import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { retrieve } from "@/lib/rag/retriever";
import { SYSTEM_PROMPT, buildPromptWithContext } from "@/lib/rag/prompt";
import { routeQuery, condenseForRetrieval } from "@/lib/rag/query-router";

export const maxDuration = 30;

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

  const llmMessages = [
    ...messages.slice(0, -1),
    { role: "user" as const, content: augmentedContent },
  ];

  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    system: SYSTEM_PROMPT,
    messages: llmMessages,
    temperature: 0.2,
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return { sources };
      }
      return undefined;
    },
  });
}
