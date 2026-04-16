import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { retrieve } from "@/lib/rag/retriever";
import { SYSTEM_PROMPT, buildPromptWithContext } from "@/lib/rag/prompt";
import { routeQuery, condenseForRetrieval } from "@/lib/rag/query-router";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get the latest user message for retrieval
  const lastUserMessage = messages
    .filter((m: { role: string }) => m.role === "user")
    .pop();

  if (!lastUserMessage) {
    return new Response("No user message found", { status: 400 });
  }

  // Condense conversation history into a standalone retrieval query
  const searchQuery = condenseForRetrieval(
    messages.map((m: { role: string; content?: string; parts?: { type: string; text: string }[] }) => ({
      role: m.role,
      content: m.content || (m.parts?.filter(p => p.type === "text").map(p => p.text).join("") ?? ""),
    }))
  );

  // Route query to the right document type (regex fast-path, then LLM fallback)
  const { docTypeFilter } = await routeQuery(searchQuery);

  // Retrieve relevant chunks with routing filter
  const results = await retrieve(searchQuery, {
    topK: 20,
    rerankTopK: 5,
    docTypeFilter: docTypeFilter ?? undefined,
  });

  // Build the augmented prompt with context
  const augmentedContent = buildPromptWithContext(lastUserMessage.content, results);

  // Build messages for the LLM, replacing the last user message with the augmented one
  const llmMessages = [
    ...messages.slice(0, -1),
    { role: "user" as const, content: augmentedContent },
  ];

  // Stream response from Gemini Flash
  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    system: SYSTEM_PROMPT,
    messages: llmMessages,
    temperature: 0.2,
  });

  return result.toUIMessageStreamResponse();
}
