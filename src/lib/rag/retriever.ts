import { getSupabase, type SearchResult } from "@/lib/db/supabase";
import { embedText } from "./embeddings";

function getCohereKey(): string | undefined {
  return process.env.COHERE_API_KEY;
}

/**
 * Hybrid search: vector similarity + full-text search via Supabase RPC,
 * then rerank with Cohere for precision.
 */
export async function retrieve(
  query: string,
  options: {
    topK?: number;
    rerankTopK?: number;
    docTypeFilter?: string;
  } = {}
): Promise<SearchResult[]> {
  const { topK = 20, rerankTopK = 5, docTypeFilter } = options;

  // Step 1: Embed the query
  const queryEmbedding = await embedText(query, "RETRIEVAL_QUERY");
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Step 2: Hybrid search via Supabase RPC
  // When a doc_type filter is set, fetch both filtered and unfiltered results
  // so the reranker sees cross-category matches (e.g. penalties Q answered by bylaws)
  const sb = getSupabase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const search = (filter: string | null) => (sb.rpc as any)("hybrid_search", {
    query_embedding: embeddingStr,
    query_text: query,
    match_count: topK,
    filter_doc_type: filter,
  });

  let candidates: SearchResult[];

  if (docTypeFilter) {
    // Fetch filtered + unfiltered in parallel, merge for broader recall
    const [filtered, unfiltered] = await Promise.all([
      search(docTypeFilter),
      search(null),
    ]);

    if (filtered.error) throw new Error(`Supabase search error: ${filtered.error.message}`);
    if (unfiltered.error) throw new Error(`Supabase search error: ${unfiltered.error.message}`);

    // Deduplicate by id, keeping best scores
    const seen = new Map<number, SearchResult>();
    for (const r of [...(filtered.data ?? []), ...(unfiltered.data ?? [])]) {
      const existing = seen.get(r.id);
      if (!existing || (r.similarity + r.text_rank) > (existing.similarity + existing.text_rank)) {
        seen.set(r.id, r);
      }
    }
    candidates = [...seen.values()];
  } else {
    const { data, error } = await search(null);
    if (error) throw new Error(`Supabase search error: ${error.message}`);
    candidates = data ?? [];
  }

  if (candidates.length === 0) {
    return [];
  }

  // Step 3: Rerank with Cohere (if API key available)
  if (getCohereKey() && candidates.length > 1) {
    return rerank(query, candidates, rerankTopK);
  }

  // Fallback: return top results without reranking
  return candidates.slice(0, rerankTopK);
}

/**
 * Rerank candidates using Cohere's rerank API.
 * This dramatically improves precision by scoring each chunk
 * against the actual question, not just embedding similarity.
 */
async function rerank(
  query: string,
  candidates: SearchResult[],
  topK: number
): Promise<SearchResult[]> {
  const response = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getCohereKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "rerank-v3.5",
      query,
      documents: candidates.map((c) => c.content),
      top_n: topK,
    }),
  });

  if (!response.ok) {
    // Fallback gracefully if Cohere fails (rate limit, etc.)
    console.warn("Cohere rerank failed, using vector results:", response.status);
    return candidates.slice(0, topK);
  }

  const data = await response.json();
  return data.results.map(
    (r: { index: number; relevance_score: number }) => ({
      ...candidates[r.index],
      similarity: r.relevance_score,
    })
  );
}
