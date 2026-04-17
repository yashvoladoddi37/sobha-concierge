# Sobha Concierge

AI-powered concierge for residents of **Sobha Indraprastha**, a 356-unit apartment complex in Rajajinagar, Bangalore. Ask questions about bylaws, penalties, meeting decisions, MyGate operations, and more — grounded in real association documents with source citations.

Responds in **English, Hindi, and Kannada** — detects the resident's language and matches it.

Built with a RAG (Retrieval-Augmented Generation) pipeline on a **$0/month** stack.

## Why This Exists

356 families share one WhatsApp group. The same questions cycle endlessly — "What's the gym timing?", "Can I rent my flat?", "What was decided in the last meeting?" The answers exist in official documents, but nobody reads a 93-page Deed of Declaration or scrolls through 11 meeting PDFs.

Sobha Concierge makes the apartment's institutional memory searchable. Every rule, every decision, every process — instant answers with exact citations instead of "check the bylaws."

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  RESIDENT                                                            │
│  "How do I pre-approve my Uber driver?"                              │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  QUERY PIPELINE                                                      │
│                                                                      │
│  ┌─────────────┐   ┌──────────────────┐   ┌──────────────────────┐  │
│  │  Condenser   │──▶│  Query Router     │──▶│  Hybrid Search       │  │
│  │  (multi-turn │   │  Tier 1: Regex    │   │  Vector (cosine)     │  │
│  │   context)   │   │  Tier 2: LLM     │   │  + BM25 full-text    │  │
│  └─────────────┘   └──────────────────┘   └──────────┬───────────┘  │
│                                                       │              │
│                                            ┌──────────▼───────────┐  │
│                                            │  Cohere Reranker     │  │
│                                            │  top 20 → top 5      │  │
│                                            └──────────┬───────────┘  │
└───────────────────────────────────┬───────────────────┘──────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  GENERATION                                                          │
│                                                                      │
│  Gemini 2.5 Flash + retrieved context → streaming cited response     │
│  Language: auto-detected (English / Hindi / Kannada)                 │
└──────────────────────────────────────────────────────────────────────┘
```

**How it works:** A resident's question flows through query condensation (handling multi-turn context), two-tier routing (regex then LLM), hybrid search (vector cosine + BM25 full-text), Cohere reranking, and streaming generation with Gemini Flash — all in under 3 seconds.

## Query Routing

```
Incoming query
     │
     ▼
┌─────────────────────────────┐
│  Tier 1: Regex (0ms, free)  │──── match ──▶ doc_type filter
│  "penalty" → penalties      │
│  "mygate"  → mygate         │
│  "bylaw"   → bylaws         │
└─────────┬───────────────────┘
          │ no match
          ▼
┌─────────────────────────────┐
│  Tier 2: LLM (~300ms)      │──── classify ──▶ doc_type filter
│  "Can I keep a pet?"        │
│  → Zod schema output        │
│  → { docType, reasoning }   │
└─────────────────────────────┘
```

Queries are classified into one of **10 document types** using a two-tier system:

- **Tier 1 — Regex** (0ms, free): High-confidence patterns like `bylaw`, `penalty|fine`, `EGM|AGM`, `mygate|pre-approve`, `uber|ola|delivery`. Catches ~60% of queries instantly.
- **Tier 2 — LLM** (~300ms): For ambiguous questions like *"Can I keep a pet?"* or *"What about the CCTV thing from last month?"*. Uses Gemini Flash with structured output (Zod schema → `{ docType, reasoning }`).

The router output feeds into hybrid search as a filter. Filtered + unfiltered results are merged so cross-category matches aren't lost, then Cohere reranks the combined pool.

## Ingestion Pipeline

```
PDF documents
     │
     ▼
┌──────────────────┐     ┌───────────────────┐     ┌───────────────┐
│  Gemini Vision   │────▶│  Semantic Chunker  │────▶│  Gemini       │
│  OCR             │     │  (clause/chapter   │     │  Embeddings   │
│  (handles scans, │     │   boundaries,      │     │  (768d)       │
│   Kannada text,  │     │   200-char overlap, │     │               │
│   stamps, seals) │     │   garbled-text      │     └───────┬───────┘
└──────────────────┘     │   filtering)        │             │
                         └───────────────────┘             ▼
                                                   ┌───────────────┐
                                                   │  Supabase     │
                                                   │  pgvector     │
                                                   │  (IVFFlat +   │
                                                   │   GIN indexes) │
                                                   └───────────────┘
```

**Quality gates** at each stage:
- OCR: 3-key API rotation, per-page progress saves, automatic resume on crash
- Chunking: chapter/clause boundary detection, 200-char overlap, decoration line stripping, garbled-text filtering (< 40% English words)
- Storage: IVFFlat + GIN indexes, incremental ingestion (won't re-process unchanged docs)

## Corpus

| Document Type | Chunks | Source Documents |
|---|---|---|
| Bylaws | 128 | SIAOA Apartment Bylaws (44 pages) |
| Deed | 78 | Deed of Declaration (93 pages) |
| Minutes | 42 | 11 board/EGM meeting minutes |
| MyGate | — | MyGate operations guide (how-to, FAQ) |
| Act | 10 | Karnataka Apartment Ownership Act 1972 |
| Certificate | 7 | BBMP Occupancy + Completion Certificates |
| Penalties | 5 | SIAOA Penalties & Violations |
| Notice | 2 | Official notices |
| Financial | 1 | Income & Expenditure Statement |
| **Total** | **273+** | **19 documents** |

## Features

- **Cited answers** — every response references exact document, clause, and page number
- **Multi-language** — responds in English, Hindi, or Kannada based on the resident's query
- **MyGate guide** — step-by-step how-to for pre-approvals, delivery entry, amenity booking, complaints
- **Feedback loop** — thumbs up/down on every response, stored for quality tracking
- **Hybrid search** — vector similarity + BM25 keyword matching for comprehensive retrieval
- **Two-tier routing** — regex fast-path + LLM fallback for query classification
- **Streaming responses** — real-time response generation with typing indicators

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router), Tailwind, shadcn/ui | Server components, streaming UI |
| Chat | AI SDK v6 (`useChat`, `streamText`) | Framework-agnostic streaming with `UIMessage` format |
| LLM | Gemini 2.5 Flash Lite (free tier) | Fast, capable, free |
| Embeddings | `gemini-embedding-001` (768d) | Matched to the LLM provider, free |
| Vector DB | Supabase pgvector (free tier) | Hybrid search via SQL function (cosine + BM25) |
| Reranker | Cohere Rerank v3.5 (free tier) | Dramatically improves precision (top 20 → top 5) |
| OCR | Gemini Vision API | Handles scanned PDFs with Kannada text, stamps, seals |
| Routing | AI SDK `generateText` + `Output.object()` | Structured LLM output with Zod schema validation |

**Total cost: $0/month.** Every service runs on its free tier.

## Project Structure

```
src/
  app/
    api/
      chat/route.ts            # POST handler: condense → route → retrieve → stream
      feedback/route.ts        # POST handler: store thumbs up/down ratings
    chat/page.tsx              # Chat UI with useChat()
    page.tsx                   # Landing page
  components/
    chat-input.tsx             # Message input with submit handling
    chat-message.tsx           # Message bubbles with citation rendering
    feedback-buttons.tsx       # Thumbs up/down feedback on responses
    suggested-questions.tsx    # Quick-start question chips
  lib/
    rag/
      query-router.ts          # Two-tier routing (regex + LLM)
      retriever.ts             # Hybrid search + Cohere rerank
      embeddings.ts            # Gemini embedding API (single + batch)
      prompt.ts                # System prompt + context formatting + language rules
    db/
      supabase.ts              # Client + types
scripts/
  ocr-gemini.ts                # Gemini Vision OCR pipeline (resume-capable)
  ingest.ts                    # Chunking + embedding + storage pipeline
  eval.ts                      # 20-question eval framework (7 categories)
data/
  processed/                   # Clean markdown files (post-OCR)
  raw/                         # Original PDFs
supabase/
  migrations/                  # Schema, indexes, hybrid_search function, feedback table
```

## Getting Started

### Prerequisites

- Node.js 20+
- Three API keys (all free tier):
  - [Google AI Studio](https://aistudio.google.com/) — Gemini API key
  - [Supabase](https://supabase.com/) — project URL + anon key
  - [Cohere](https://dashboard.cohere.com/) — API key for reranking

### Setup

```bash
git clone https://github.com/yashvoladoddi37/sobha-concierge.git
cd sobha-concierge
npm install
```

Create `.env.local`:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
COHERE_API_KEY=your_cohere_key
```

Run the Supabase migrations (creates tables, indexes, hybrid_search function, and feedback table):

```bash
npx supabase db push
```

### Ingest Documents

```bash
# OCR scanned PDFs (if you have raw PDFs)
npx tsx scripts/ocr-gemini.ts

# Ingest all documents
npx tsx scripts/ingest.ts

# Or ingest a specific document
npx tsx scripts/ingest.ts mygate-guide.md
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Evaluate

```bash
npx tsx scripts/eval.ts
```

Runs 20 questions across 7 categories. Checks retrieval accuracy (doc type match), keyword hit rate, and query routing correctness. Exits with code 1 if overall pass rate falls below 70%.

## Eval Results

Routing accuracy: **95%** (19/20) — regex covers obvious patterns, LLM handles the rest.

Retrieval is strong for categories with sufficient data (bylaws, minutes, certificates, legal) and improves as more documents are added.

## License

MIT
