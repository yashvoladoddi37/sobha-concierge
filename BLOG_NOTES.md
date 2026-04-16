# SobhaBot Build Notes — Blog Material

> These are raw notes from the build process. Each section is a potential blog post moment — the kind of "here's what actually happened" stories that make Substack posts compelling.

---

## The Motivation

- I live in Sobha Indraprastha, a luxury apartment complex in Bangalore
- Residents constantly ask the same questions on WhatsApp groups: "What's the penalty for late maintenance?", "Can I rent to bachelors?", "What did we decide about parking in the last AGM?"
- My neighbor is a director at HCLTech. Years ago he asked me to build a chatbot. I never did. Now I'm an AI engineer and I want to show him what I can build — so he refers me in
- The stakes are real. This isn't a toy project. 400+ families will use this

## War Story: The Embedding Model Vanished

- Started with Google's `text-embedding-004` (768 dimensions) — worked fine in docs
- Mid-build, the API returned 404: "model not found for API version v1beta"
- Google had silently replaced it with `gemini-embedding-001` — which outputs **3072 dimensions**
- Problem: Supabase's pgvector IVFFlat index maxes out at 2000 dimensions. Tried HNSW — also capped at 2000
- The fix: `gemini-embedding-001` supports an `outputDimensionality` parameter. Request 768 dims, keep the schema unchanged
- **Lesson:** Free-tier APIs are a moving target. Your pipeline needs to handle model deprecation gracefully
- Ran a partial migration that dropped the index before failing — had to repair migration history manually

## War Story: AI SDK v6 Broke Everything

- Built the frontend using `ai` package patterns from tutorials and docs
- Nothing worked. `useChat` didn't have `input`, `setInput`, `handleSubmit`, `isLoading`, or `append`
- Turns out AI SDK v6 is a complete rewrite:
  - `ai/react` → `@ai-sdk/react` (separate package)
  - `handleSubmit` → `sendMessage({text})` 
  - `message.content` → `message.parts.filter(p => p.type === "text")`
  - `isLoading` → `status === "streaming" || status === "submitted"`
  - `toDataStreamResponse()` → `toTextStreamResponse()`
- Every tutorial online is wrong. Had to read the actual source in `node_modules`
- **Lesson:** When a framework does a major version bump, your muscle memory becomes your enemy

## War Story: Scanned PDFs and the OCR Question

- Meeting minutes from the apartment association are **scanned PDFs** — photos of printed pages
- Traditional approach: install Tesseract, preprocess images, deal with Hindi text mixed in
- Simpler approach: send the raw PDF pages to Gemini Vision as images. It OCRs AND structures the text in one shot
- Zero local setup, zero dependencies, free tier handles it fine
- **Lesson:** Sometimes the "AI way" is genuinely simpler, not just hype

## War Story: Port 3000 Was Already Taken

- Tried to start dev server, port 3000 already had another project (Kapi) running
- Small thing, but in a blog it's relatable — every dev has been there
- Switched to port 3737

## Design Decision: Why Intercom, Not ChatGPT

- Every AI chatbot looks like ChatGPT now. Dark sidebar, message bubbles, boring
- Took inspiration from Intercom's design system — they've been doing conversational UI for years
- But adapted for luxury residential: swapped corporate blue/orange for Sobha emerald green (#2D6A4F) + warm gold (#B7872F) + ivory backgrounds
- Typography: DM Sans for modern headings, Lora serif for citations (gives legal documents a "proper" feel)
- **Lesson:** Design systems from successful products are open knowledge. Adapt, don't copy

## Design Decision: Section-Based Chunking

- Most RAG tutorials use fixed-size chunks (500 tokens, 1000 tokens)
- Apartment bylaws have legal structure: chapters, clauses, sub-clauses
- If you chunk at arbitrary boundaries, "Clause 36(a)" might get split across two chunks and the LLM loses context
- Built a chunker that detects chapter/clause/agenda headers and splits at natural boundaries
- Each chunk carries metadata: chapter name, section name, page number, document name
- **Lesson:** Domain knowledge about your documents matters more than chunking algorithm choice

## Technical Decision: Hybrid Search

- Pure vector search misses exact terms — residents ask "what's the penalty amount" and vector search returns vaguely similar paragraphs
- Added BM25 full-text search alongside vector search (70/30 weighting)
- Then Cohere reranking on top for precision
- Three-stage pipeline: hybrid retrieve → rerank → generate
- **Lesson:** RAG is not just "embed and search." The retrieval pipeline is where quality lives

## The $0 Stack

- Google Gemini 2.0 Flash: free tier (15 RPM, 1M tokens/day)
- Google gemini-embedding-001: free tier
- Supabase: free tier (500MB database, pgvector included)
- Cohere Rerank v3.5: free trial (1000 calls/month)
- Vercel: free tier for hosting
- Total cost: $0/month
- **Lesson:** In 2026, you can build production-grade AI apps without spending a rupee

## War Story: Rate Limits Hit During First Ingestion

- Ran the ingestion pipeline for the first time: 18 PDFs, 172 pages
- The 2 plain text notices went through fine
- Then every single scanned PDF hit Gemini's free tier rate limit (429 errors)
- Why? The OCR sends the entire PDF as base64 to Gemini — that eats tokens fast
- First attempt: 2-second delay between documents. Not enough
- Fix: added exponential backoff with retry — parse the `retryDelay` from the error response, wait that long + 5 seconds buffer, then retry automatically
- Also increased between-document delay from 2s to 5s
- The daily quota limit (`limit: 0`) means the quota was fully exhausted for the day
- **Lesson:** Free tier rate limits are the real constraint. Your ingestion pipeline needs to be patient, not fast. Build retry logic from day one.

## War Story: pgvector Dimension Limits

- Google replaced `text-embedding-004` (768 dims) with `gemini-embedding-001` (3072 dims)
- Tried to migrate the Supabase column from vector(768) to vector(3072)
- IVFFlat index: "column cannot have more than 2000 dimensions" — failed
- Tried HNSW index: same 2000-dimension limit
- The fix? `gemini-embedding-001` accepts an `outputDimensionality` parameter. Request 768 dims, keep the schema as-is
- Ran a partial migration that dropped the index before the CREATE INDEX failed — had to use `supabase migration repair` to clean up
- **Lesson:** New embedding models with higher dimensions aren't always better. pgvector has hard limits. Truncated embeddings at 768 dims work fine for small datasets

## Design Decision: Stripe-Inspired Landing Page

- For the landing page, studied Stripe, Apple, and Linear design systems
- Key takeaway: **font-weight 300 is the luxury signal** (Stripe). Most devs default to 600-700 for headlines
- Apple's pattern of alternating light/dark sections creates visual rhythm without any decoration
- Linear's approach: 80px+ vertical padding between sections — space is the separator, not lines or dividers
- Used the existing Sobha emerald/gold/ivory palette with these structural principles
- Chat preview mockup on the landing page shows a real bylaw question/answer — makes it immediately tangible

## The OCR rabbit hole

So the bylaws PDF — the most important document in the whole corpus — was scanned sideways. Landscape orientation, text rotated 90 degrees. Tesseract read it and gave me "NOLLVIODOSSV" for "ASSOCIATION." 35% English. Completely unusable.

Rotated the images with PIL (`img.rotate(-90, expand=True)`) and Tesseract got way better. But still not clean — swapping f for t, 1 for l, turning "also" into "8/50." The kind of errors that seem minor until a resident asks about Clause 36(a) and gets Clause 86(8).

Ran a proper comparison: Tesseract at 200 DPI vs 300 DPI vs Gemini 2.5 Flash Vision on the same page. Gemini returned perfect text. Not "pretty good." Perfect. Clause numbers intact, tables preserved, Kannada stamps ignored. That settled it.

The catch: Gemini free tier gives you 10 requests per minute and 250 per day, per API key. The bylaws alone are 42 pages. The declaration deed is 93. Total pipeline: ~145 pages.

Built the OCR script to rotate through 3 API keys, save progress after every single page, and resume from where it left off. If it crashes at page 67, you rerun and it picks up at 68. Added cron jobs as insurance — every 3 hours, kick it off again. The whole thing runs unattended across sessions.

Not fast. But it never loses work, and it never re-processes a page. That turned out to matter more than speed.

## Quality grading

Wrote an automated audit that scores every document on English word ratio and garbled line count. Letter grades: A means >85% English with <5 garbled lines. Anything below B gets flagged for re-OCR.

Results after all the work: 16 out of 18 docs at Grade A. The two Bs (declaration deed, BBMP certificate) are both in the Gemini re-OCR queue. The bylaws went from Grade F under Tesseract to 97.7% under Gemini.

Worth noting: Tesseract was fine for the clean docs. Meeting minutes, Karnataka Act, penalties — all Grade A with plain Tesseract at 300 DPI. The MoMs were already digital text, not scans. The point isn't "Tesseract bad" — it's "know which documents need the expensive tool."

## Chunking, take two

First chunker looked for markdown headers. Tesseract doesn't output markdown. So nothing got detected and every chunk was a dumb 2000-char slice with clause 36(a) split across two chunks.

Rewrote it to detect the patterns that actually appear in Indian legal documents:
- `CHAPTER-1`, `CHAPTER - VII:` — chapter boundaries
- `4.12)`, `5.1)` — numbered clauses (the `)` after the number is the giveaway)
- `Section 3.` — Karnataka Act style
- `1. Agenda item text` — MoM agenda items

Found a bug during review: agenda items weren't `continue`-ing after flush, so each agenda line got appended to both the old chunk and the new one. The kind of thing that doesn't show up in a quick scan but quietly degrades every meeting minute chunk.

Also bumped MAX_CHUNK_CHARS from 2000 to 3000. Legal clauses run long. Splitting mid-sentence in a bylaw clause means the LLM has half the rule and none of the exceptions. 3000 chars (~750 tokens) lets most clauses stay whole.

## The incremental ingestion thing

First version of the ingestion script nuked everything and re-embedded all 18 docs. That's 375 chunks through the embedding API, which eats into rate limits for no reason when you only changed one document.

Rewrote it with three modes:
- No args: only ingests docs not yet in Supabase
- Named files: `npx tsx scripts/ingest.ts siaoa-apartment-bylaws.md` — deletes old chunks for that doc, re-ingests
- `--full`: the old nuke everything behavior

So when Gemini finishes re-OCR'ing the declaration deed, it's one command to swap the chunks. Everything else stays untouched.

## Query routing

"What's the penalty for late maintenance?" was searching all 375 chunks. Most results came from bylaws clauses about maintenance calculation, not from the penalty schedule. The actual answer lived in 5 penalty chunks that got outranked.

Added a keyword-based router — no LLM call, just regex. "Can I keep a pet?" routes to `bylaws`. "How much is the fine?" routes to `penalties`. "What was decided in March?" routes to `minutes`. Falls back to searching everything for ambiguous questions.

The filter gets passed to the Supabase RPC function so it happens at the database level. Retrieval on 5 chunks instead of 375 is a different game.

Also added conversation-aware retrieval. If someone asks "What are the parking rules?" and follows up with "What about for visitors?", the second query needs the parking context. The condenser checks for pronouns and short queries, prepends recent history if needed. No LLM call — the embedding model figures it out from the concatenated text.

## Eval framework

Built a 20-question test suite covering all 7 document types. Each question has an expected doc_type, expected keywords in the retrieved chunks, and expected routing.

A question passes when: correct doc_type shows up in results, at least 60% of expected keywords appear, and the router picked the right filter. Exits with code 1 below 70% pass rate — wirable into CI if we ever get there.

Haven't run it on the full corpus yet (waiting on declaration deed OCR). But the structure is there and the scoring is automated. No more "it seems to work" — there's a number now.

## Where it stands right now

375 chunks across 20 sources in Supabase. Chat works end-to-end — ask a question, get a cited answer with clause numbers and page references. Gemini 2.5 Flash for generation, Cohere rerank for precision, hybrid search underneath.

One document left with subpar OCR (declaration deed, 93 pages, Gemini grinding through it at ~1 page per rate limit cycle). Everything else is Grade A. The pipeline is patient.

---

*More notes will be added as the build continues...*
