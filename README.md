# Sobha Concierge

<div align="center">

https://github.com/user-attachments/assets/4857656b-20f7-49ad-914b-805a9ef01fb5

*Asking about parking rules, meeting decisions, and penalty amounts — all answered with inline citations from real apartment documents.*

</div>

AI-powered concierge for residents of **Sobha Indraprastha**, a 356-unit apartment complex in Rajajinagar, Bangalore. Ask questions about bylaws, penalties, meeting decisions, MyGate operations, and more — grounded in real association documents with inline source citations.

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
│  Gemini 2.5 Flash Lite + retrieved context → streaming cited response│
│  Inline citations with exact quotes from source documents            │
└──────────────────────────────────────────────────────────────────────┘
```

## Features

- **Inline cited answers** — every factual claim has a numbered reference `[1]` linking to the exact quote, document, clause, and page. Clickable superscripts scroll to the footnote.
- **Expandable source excerpts** — footnote citations can be expanded to show the full source chunk from the retrieved document.
- **Dark elegant UI** — near-black backgrounds, emerald accents, gold citation highlights. Auto-hiding scrollbars, smooth animations.
- **Chat sessions** — sidebar with session history, create/switch/delete chats. Messages persist in localStorage across page reloads.
- **English-first responses** — defaults to English regardless of source document language. Responds in Hindi/Kannada only when the resident writes in that language.
- **Smart "latest" handling** — when asked about "the last meeting" or "most recent decision", picks the most recent date from context instead of listing all options.
- **MyGate how-to guide** — step-by-step instructions for pre-approvals, delivery entry, amenity booking, complaints.
- **Feedback loop** — thumbs up/down on every response, stored in Supabase for quality tracking.
- **Hybrid search** — vector similarity (cosine) + BM25 full-text matching for comprehensive retrieval.
- **Cohere reranking** — retrieved candidates scored against the actual query for precision (top 20 → top 5).
- **Two-tier query routing** — regex fast-path (~60% of queries) + LLM fallback with Zod structured output.
- **Streaming responses** — real-time generation with typing indicators.
- **Suggested questions** — quick-start chips on empty chat for common queries.

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

Queries are classified into one of **10 document types**. The router output feeds into hybrid search as a filter. Filtered + unfiltered results are merged so cross-category matches aren't lost, then Cohere reranks the combined pool.

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

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui | Server components, streaming UI |
| Chat | AI SDK v6 (`useChat`, `streamText`) | Framework-agnostic streaming with `UIMessage` format |
| LLM | Gemini 2.5 Flash Lite (free tier) | Fast, capable, free |
| Embeddings | `gemini-embedding-001` (768d) | Matched to the LLM provider, free |
| Vector DB | Supabase pgvector (free tier) | Hybrid search via SQL function (cosine + BM25) |
| Reranker | Cohere Rerank v3.5 (free tier) | Scores candidates against actual query for precision |
| OCR | Gemini Vision API | Handles scanned PDFs with Kannada text, stamps, seals |
| Routing | AI SDK `generateText` + `Output.object()` | Structured LLM output with Zod schema validation |
| Persistence | localStorage | Chat sessions and message history |

**Total cost: $0/month.** Every service runs on its free tier.

## Project Structure

```
src/
  app/
    api/
      chat/route.ts            # POST: condense → route → retrieve → stream
      feedback/route.ts        # POST: store thumbs up/down ratings
    chat/page.tsx              # Chat UI with session management
    page.tsx                   # Landing page (dark theme)
  components/
    chat-input.tsx             # Message input with auto-resize
    chat-message.tsx           # Message bubbles, inline citations, footnotes
    chat-sidebar.tsx           # Session list with create/switch/delete
    feedback-buttons.tsx       # Thumbs up/down on responses
    suggested-questions.tsx    # Quick-start question chips
  lib/
    rag/
      query-router.ts          # Two-tier routing (regex + LLM)
      retriever.ts             # Hybrid search + Cohere rerank
      embeddings.ts            # Gemini embedding API (single + batch)
      prompt.ts                # System prompt, citation format, language rules
    chat-store.ts              # Session management (localStorage)
    db/
      supabase.ts              # Client + types
    types.ts                   # Shared TypeScript interfaces
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

Two complementary eval suites:

**Retrieval quality** (`scripts/eval.ts`) — does the right document come back for each question?

```bash
npm run eval
```

Runs 20 questions across 7 categories. Checks retrieval accuracy (doc type match), keyword hit rate, and query routing correctness. Exits with code 1 if overall pass rate falls below 70%.

**Generation quality** (`scripts/eval-generation.ts`) — given the right context, does the LLM actually follow the prompt rules in `src/lib/rag/prompt.ts`?

```bash
npm run eval:gen
```

Loops every (candidate model × test case) and scores answers on six axes:
citation format, quote accuracy (quote actually appears in retrieved chunks),
language correctness (English / Hindi-script / Kannada-script / Hinglish→English),
"latest" date handling, refusal correctness, and call-error rate.

Models are auto-discovered from env vars: Gemini (Flash Lite, Flash) require
`GOOGLE_GENERATIVE_AI_API_KEY`, Groq models (`llama-3.3-70b-versatile`,
`llama-3.1-8b-instant`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`) require
`GROQ_API_KEY`, and Sarvam AI models (Sarvam-M free, Sarvam-30B / 105B paid)
require `SARVAM_API_KEY` (+ optional `SARVAM_INCLUDE_PAID=true`). The output
is a model-by-model scorecard with a verdict column (`PRIMARY` / `FALLBACK` /
`AVOID` / `BROKEN`) so you can decide which models earn a slot in the
production fallback chain in `src/app/api/chat/route.ts`.

## Eval Results

Routing accuracy: **95%** (19/20) — regex covers obvious patterns, LLM handles the rest.

Retrieval is strong for categories with sufficient data (bylaws, minutes, certificates, legal) and improves as more documents are added.

## License

MIT
