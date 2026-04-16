-- Enable pgvector extension
create extension if not exists vector;

-- Document sources table
create table document_sources (
  id serial primary key,
  name text not null,           -- e.g., "SIAOA Apartment Bylaws"
  file_name text not null,      -- e.g., "siaoa-apartment-bylaws.pdf"
  doc_type text not null,       -- bylaws | deed | act | minutes | penalties | financial | certificate | notice
  total_pages int,
  date_of_document date,        -- for meeting minutes, the meeting date
  created_at timestamptz default now()
);

-- Document chunks table with vector embeddings
create table document_chunks (
  id serial primary key,
  source_id int references document_sources(id) on delete cascade,
  content text not null,                    -- the chunk text
  embedding vector(768),                    -- Google text-embedding-004 = 768 dims

  -- Metadata for filtered retrieval and citations
  chapter text,                             -- e.g., "Chapter VI: Obligations"
  section text,                             -- e.g., "Clause 36: Assessment"
  page_number int,
  chunk_index int,                          -- ordering within document

  -- Denormalized for search performance
  doc_type text not null,
  doc_name text not null,
  doc_date date,

  created_at timestamptz default now()
);

-- Index for vector similarity search (cosine distance)
create index on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 20);

-- Index for full-text search
alter table document_chunks add column fts tsvector
  generated always as (to_tsvector('english', content)) stored;
create index on document_chunks using gin (fts);

-- Index for filtered queries
create index on document_chunks (doc_type);
create index on document_chunks (source_id);

-- Hybrid search function: combines vector similarity + full-text search
create or replace function hybrid_search(
  query_embedding vector(768),
  query_text text,
  match_count int default 20,
  filter_doc_type text default null
)
returns table (
  id int,
  content text,
  chapter text,
  section text,
  page_number int,
  doc_type text,
  doc_name text,
  doc_date date,
  similarity float,
  text_rank float
)
language plpgsql
as $$
begin
  return query
  with vector_results as (
    select
      dc.id,
      dc.content,
      dc.chapter,
      dc.section,
      dc.page_number,
      dc.doc_type,
      dc.doc_name,
      dc.doc_date,
      1 - (dc.embedding <=> query_embedding) as similarity,
      0::float as text_rank
    from document_chunks dc
    where (filter_doc_type is null or dc.doc_type = filter_doc_type)
    order by dc.embedding <=> query_embedding
    limit match_count
  ),
  text_results as (
    select
      dc.id,
      dc.content,
      dc.chapter,
      dc.section,
      dc.page_number,
      dc.doc_type,
      dc.doc_name,
      dc.doc_date,
      0::float as similarity,
      ts_rank(dc.fts, websearch_to_tsquery('english', query_text)) as text_rank
    from document_chunks dc
    where dc.fts @@ websearch_to_tsquery('english', query_text)
      and (filter_doc_type is null or dc.doc_type = filter_doc_type)
    order by text_rank desc
    limit match_count
  ),
  combined as (
    select * from vector_results
    union all
    select * from text_results
  )
  select
    c.id,
    c.content,
    c.chapter,
    c.section,
    c.page_number,
    c.doc_type,
    c.doc_name,
    c.doc_date,
    max(c.similarity) as similarity,
    max(c.text_rank) as text_rank
  from combined c
  group by c.id, c.content, c.chapter, c.section, c.page_number, c.doc_type, c.doc_name, c.doc_date
  order by (max(c.similarity) * 0.7 + max(c.text_rank) * 0.3) desc
  limit match_count;
end;
$$;
