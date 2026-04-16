import { createClient } from "@supabase/supabase-js";

// Server-side client with service role key (for ingestion + search)
// Lazily initialized to avoid build-time errors when env vars aren't set
let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export interface DocumentSource {
  id?: number;
  name: string;
  file_name: string;
  doc_type: string;
  total_pages?: number;
  date_of_document?: string;
}

export interface DocumentChunk {
  id?: number;
  source_id: number;
  content: string;
  embedding?: number[];
  chapter?: string;
  section?: string;
  page_number?: number;
  chunk_index?: number;
  doc_type: string;
  doc_name: string;
  doc_date?: string;
}

export interface SearchResult {
  id: number;
  content: string;
  chapter: string | null;
  section: string | null;
  page_number: number | null;
  doc_type: string;
  doc_name: string;
  doc_date: string | null;
  similarity: number;
  text_rank: number;
}
