import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
} from "ai";
import { getSupabase } from "@/lib/db/supabase";
import { retrieve } from "@/lib/rag/retriever";
import { SYSTEM_PROMPT, buildPromptWithContext } from "@/lib/rag/prompt";
import { routeQuery, condenseForRetrieval } from "@/lib/rag/query-router";

export const maxDuration = 30;

const MODELS: { model: LanguageModel; name: string }[] = [
  { model: google("gemini-2.5-flash-lite"), name: "gemini-2.5-flash-lite" },
  { model: groq("llama-3.3-70b-versatile"), name: "groq/llama-3.3-70b" },
];

const CACHE_TTL_HOURS = 24;

type SourceEntry = {
  docName: string;
  docType: string;
  chapter: string | null;
  section: string | null;
  pageNumber: number | null;
  docDate: string | null;
  content: string;
};

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ").replace(/[?.!,]+$/g, "");
}

async function getCachedResponse(key: string): Promise<{ text: string; sources: SourceEntry[] } | null> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("response_cache")
      .select("response_text, sources")
      .eq("query_key", key)
      .gt("expires_at", new Date().toISOString())
      .single() as { data: { response_text: string; sources: SourceEntry[] } | null; error: unknown };

    if (error || !data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.rpc as any)("bump_cache_hit", { cache_key: key }).catch(() => {});

    return { text: data.response_text, sources: data.sources };
  } catch {
    return null;
  }
}

async function setCachedResponse(key: string, rawQuery: string, text: string, sources: SourceEntry[]) {
  try {
    const sb = getSupabase();
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("response_cache") as any)
      .upsert({
        query_key: key,
        query_raw: rawQuery,
        response_text: text,
        sources: JSON.stringify(sources),
        hit_count: 0,
        expires_at: expiresAt,
      }, { onConflict: "query_key" });
  } catch (err) {
    console.warn("Cache write failed:", err);
  }
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const lastUserMessage = messages
    .filter((m: { role: string }) => m.role === "user")
    .pop();

  if (!lastUserMessage) {
    return new Response("No user message found", { status: 400 });
  }

  const lastUserContent =
    lastUserMessage.content ||
    lastUserMessage.parts
      ?.filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("") ||
    "";

  const searchQuery = condenseForRetrieval(
    messages.map((m: { role: string; content?: string; parts?: { type: string; text: string }[] }) => ({
      role: m.role,
      content: m.content || (m.parts?.filter(p => p.type === "text").map(p => p.text).join("") ?? ""),
    }))
  );

  // --- Check persistent cache (single-turn only) ---
  const isFirstMessage = messages.filter((m: { role: string }) => m.role === "user").length === 1;
  const cacheKey = normalizeQuery(searchQuery);

  if (isFirstMessage) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const partId = crypto.randomUUID();
          writer.write({ type: "text-delta", delta: cached.text, id: partId });
          writer.write({
            type: "finish",
            messageMetadata: { sources: cached.sources },
          });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }
  }

  // --- Retrieval ---
  let results: Awaited<ReturnType<typeof retrieve>> = [];
  let sources: SourceEntry[] = [];

  try {
    const { docTypeFilter } = await routeQuery(searchQuery);

    results = await retrieve(searchQuery, {
      topK: 20,
      rerankTopK: 5,
      docTypeFilter: docTypeFilter ?? undefined,
    });

    sources = results.map((r) => ({
      docName: r.doc_name,
      docType: r.doc_type,
      chapter: r.chapter,
      section: r.section,
      pageNumber: r.page_number,
      docDate: r.doc_date,
      content: r.content,
    }));
  } catch (err) {
    console.error("Retrieval error (proceeding without context):", err);
  }

  const augmentedContent = buildPromptWithContext(lastUserContent, results);

  const convertedHistory = messages.slice(0, -1).map(
    (m: { role: string; content?: string; parts?: { type: string; text: string }[] }) => ({
      role: m.role as "user" | "assistant",
      content:
        m.content ||
        m.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("") ||
        "",
    })
  );

  const llmMessages = [
    ...convertedHistory,
    { role: "user" as const, content: augmentedContent },
  ];

  const streamOpts = {
    system: SYSTEM_PROMPT,
    messages: llmMessages,
    temperature: 0.2,
    onFinish: ({ text }: { text: string }) => {
      if (isFirstMessage && text.length > 0) {
        setCachedResponse(cacheKey, lastUserContent, text, sources);
      }
    },
  };

  const metadataHandler = {
    messageMetadata: ({ part }: { part: { type: string } }) => {
      if (part.type === "finish") {
        return { sources };
      }
      return undefined;
    },
  };

  const readable = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < MODELS.length; i++) {
        try {
          const result = streamText({ model: MODELS[i].model, ...streamOpts });
          const inner = result.toUIMessageStreamResponse(metadataHandler);
          const reader = inner.body!.getReader();

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }

          controller.close();
          return;
        } catch (err) {
          console.warn(`${MODELS[i].name} failed, trying next:`, err);
          if (i === MODELS.length - 1) {
            controller.error(err);
          }
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Vercel-AI-Data-Stream": "v1",
    },
  });
}
