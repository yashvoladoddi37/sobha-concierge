import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { streamText, type LanguageModel } from "ai";
import { retrieve } from "@/lib/rag/retriever";
import { SYSTEM_PROMPT, buildPromptWithContext } from "@/lib/rag/prompt";
import { routeQuery, condenseForRetrieval } from "@/lib/rag/query-router";

export const maxDuration = 30;

const MODELS: { model: LanguageModel; name: string }[] = [
  { model: google("gemini-2.5-flash-lite"), name: "gemini-2.5-flash-lite" },
  { model: groq("llama-3.3-70b-versatile"), name: "groq/llama-3.3-70b" },
];

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

  let results: Awaited<ReturnType<typeof retrieve>> = [];
  let sources: { docName: string; docType: string; chapter: string | null; section: string | null; pageNumber: number | null; docDate: string | null; content: string }[] = [];

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
  };

  const metadataHandler = {
    messageMetadata: ({ part }: { part: { type: string } }) => {
      if (part.type === "finish") {
        return { sources };
      }
      return undefined;
    },
  };

  // Stream with automatic fallback: if primary model fails (quota/auth error),
  // the error surfaces on the first stream read. We catch it and retry with
  // the next model before any data reaches the client.
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
