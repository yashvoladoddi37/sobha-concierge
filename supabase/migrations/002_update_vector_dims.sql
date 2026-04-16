-- Fix: re-create IVFFlat index that was dropped by a failed migration attempt
-- Keep vector(768) dimensions, use outputDimensionality=768 in API calls
create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 20);
