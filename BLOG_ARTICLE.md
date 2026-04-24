# I Built a Free AI Concierge for My Apartment Complex — Here's What Actually Happened

*A story about OCR rabbit holes, embedding models that vanish overnight, and why your apartment's WhatsApp group might be obsolete.*

---

## The Problem That Wouldn't Go Away

I live in Sobha Indraprastha — a 356-unit luxury apartment complex in Bangalore. Two towers, 37 floors each, infinity pool on the top floor. Sounds great until you need to know whether you can rent your flat to bachelors. Or what was decided about parking in the last AGM. Or how much the penalty is for late maintenance.

The answer is always the same: someone drops the question in the WhatsApp group, 47 people chime in with conflicting memories, and eventually someone digs out a scanned PDF from 2024. Repeat every week.

My neighbor — a director at HCLTech — asked me years ago if I could build a chatbot for this. I never did. I was still figuring out what I wanted to do. Now I'm an AI engineer, and I decided it was time to actually build the thing. Partly to help the community. Partly because a working demo speaks louder than a resume.

The constraint I gave myself: **$0/month**. No paid APIs, no subscriptions. If 400 families are going to use this, I'm not paying for it out of pocket, and I'm not asking them to either.

---

## The $0 Stack (And Why It Actually Works)

Here's what I landed on:

- **LLM**: Google Gemini 2.5 Flash Lite (free: 15 RPM, 1M tokens/day)
- **Embeddings**: Google gemini-embedding-001 (free)
- **Vector DB**: Supabase pgvector (free: 500MB)
- **Reranker**: Cohere Rerank v3.5 (free: 1000 calls/month)
- **OCR**: Gemini Vision (use the LLM itself to read scanned pages)
- **Frontend**: Next.js + Vercel AI SDK
- **Hosting**: Vercel free tier

Total monthly cost: zero.

The first engineering decision was right here. I could've gone with OpenAI for better quality and called it a day. But the free-tier constraint forced me to think about every API call — and that turned out to make the architecture *better*, not worse. When you can't brute-force with tokens, you build smarter retrieval.

---

## The OCR Rabbit Hole

The apartment bylaws — the single most important document — are a 44-page scanned PDF. Photos of printed pages. The kind where every page is slightly crooked and someone's thumb is in the corner.

**Decision point: Tesseract or Gemini Vision for OCR?**

I tried both. Tesseract at 200 DPI gave me "NOLLVIODOSSV" for "ASSOCIATION." 35% English. The bylaws were also scanned sideways — landscape orientation, text rotated 90 degrees. Even after rotating the images with PIL, Tesseract kept swapping `f` for `t`, `1` for `l`, turning "also" into "8/50." The kind of errors that seem minor until a resident asks about Clause 36(a) and the system returns Clause 86(8).

I ran a proper comparison on the same page: Tesseract at 200 DPI, Tesseract at 300 DPI, Gemini Flash Vision. Gemini returned perfect text. Not "pretty good" — perfect. Clause numbers intact, tables preserved, Kannada stamps ignored.

That settled it. But Gemini free tier gives you 10 requests per minute and 250 per day. The bylaws alone are 44 pages. The declaration deed is 93. Total pipeline: ~172 pages across 20 documents.

**Decision point: How to handle rate limits without losing progress.**

Built the OCR script to rotate through 3 API keys, save progress after every single page, and resume from where it left off. If it crashes at page 67, you rerun and it picks up at 68. Not fast. But it never loses work, and it never re-processes a page. That turned out to matter more than speed.

Worth noting: Tesseract was fine for the clean docs. Meeting minutes, Karnataka Act, penalties — all Grade A. The point isn't "Tesseract bad" — it's knowing which documents need the expensive tool.

I also wrote an automated quality audit that scores every document: English word ratio, garbled line count, letter grade. After all the OCR work: 16 out of 18 docs at Grade A. The bylaws went from Grade F under Tesseract to 97.7% under Gemini.

---

## When Google Silently Killed My Embedding Model

Mid-build, the embedding API started returning 404: "model not found." Google had replaced `text-embedding-004` with `gemini-embedding-001` — without warning, without a deprecation notice.

The new model outputs 3072 dimensions. My Supabase pgvector column was set to 768. IVFFlat index: "column cannot have more than 2000 dimensions." Tried HNSW — same 2000-dim cap.

**Decision point: Migrate the schema or truncate the embeddings?**

Turns out `gemini-embedding-001` accepts an `outputDimensionality` parameter. Request 768 dims, keep the schema as-is. Problem solved — if you know the parameter exists.

But I'd already run a partial migration that dropped the index before failing on the CREATE INDEX. Had to use `supabase migration repair` to clean up. Lesson learned: free-tier APIs are a moving target. Your pipeline needs to handle model deprecation gracefully, and you should never assume an API that works today will work the same tomorrow.

---

## Why Fixed-Size Chunking Doesn't Work for Legal Documents

Most RAG tutorials tell you to split documents into 500-token chunks. I tried that first.

**Decision point: Fixed-size chunks vs. section-aware chunking.**

Apartment bylaws have legal structure: chapters, clauses, sub-clauses. If you chunk at arbitrary boundaries, "Clause 36(a)" gets split across two chunks and the LLM loses context for the exceptions at the end of the clause.

I rewrote the chunker to detect patterns that actually appear in Indian legal documents:
- `CHAPTER-1`, `CHAPTER - VII:` — chapter boundaries
- `4.12)`, `5.1)` — numbered clauses (the `)` after the number is the giveaway)
- `Section 3.` — Karnataka Act style
- `1. Agenda item text` — meeting minutes agenda items

Found a bug during review: agenda items weren't breaking correctly, so each agenda line was getting appended to both the old chunk and the new one. The kind of thing that doesn't show up in a quick scan but quietly degrades every meeting minute chunk.

Also bumped max chunk size from 2000 to 3000 characters. Legal clauses run long. Splitting mid-sentence in a bylaw clause means the LLM has half the rule and none of the exceptions.

---

## Three-Stage Retrieval (Because Vector Search Alone Isn't Enough)

Pure vector search was giving me problems. A resident asks "what's the penalty amount for unauthorized parking" and vector search returns vaguely similar paragraphs about parking rules — not the actual fine amount.

**Decision point: Pure vector search vs. hybrid retrieval pipeline.**

Ended up with a three-stage pipeline:

1. **Hybrid search**: Vector similarity (pgvector cosine) + BM25 full-text search, run in parallel via Supabase RPCs
2. **Cohere reranking**: Take the top 20 candidates, rerank them against the actual question, keep the top 5
3. **LLM generation**: Feed the 5 best chunks to Gemini with a detailed system prompt

The reranker was the biggest quality jump. Vector search gets you in the right neighborhood; reranking gets you to the right door.

**Decision point: How to route queries to the right documents.**

"What's the penalty for late maintenance?" was searching all 375 chunks. Results came from bylaws clauses about maintenance calculation, not the penalty schedule.

Built a two-tier query router:
- **Tier 1 (regex)**: Free, instant. "Can I keep a pet?" → bylaws. "How much is the fine?" → penalties. Catches 60%+ of queries.
- **Tier 2 (LLM)**: For ambiguous queries like "What about the CCTV thing from last month?" — uses Gemini Flash Lite with a Zod schema to classify into one of 10 document types.

The filter gets passed to the Supabase RPC function, so filtering happens at the database level. Searching 30 chunks instead of 375 is a different game.

---

## Multi-Turn Conversations Without Extra LLM Calls

If someone asks "What are the parking rules?" and follows up with "What about for visitors?", the second query needs parking context.

**Decision point: LLM-based query rewriting vs. simple heuristic.**

I went with the simple approach: check for pronouns ("it", "this", "that", "they") and short queries (under 8 words). If detected, prepend the last few messages as context. The embedding model handles the concatenated text fine — no separate LLM call needed.

Not as smart as GPT-4 rewriting your query. But it's free, it's instant, and it works for 90% of follow-up questions.

---

## The AI SDK v6 Surprise

Built the frontend using patterns from every tutorial and doc I could find. Nothing worked.

`useChat` didn't have `input`, `setInput`, `handleSubmit`, `isLoading`, or `append`. None of them. Turned out the Vercel AI SDK had done a complete rewrite for v6:

- `ai/react` → `@ai-sdk/react` (separate package)
- `handleSubmit` → `sendMessage({text})`
- `message.content` → `message.parts.filter(p => p.type === "text")`
- `isLoading` → `status === "streaming" || status === "submitted"`

Every tutorial online was wrong. Had to read the actual source code in `node_modules`. Found a second bug when multi-turn stopped working: AI SDK v6 sends messages with `parts[]` arrays, but prior messages in follow-up turns had undefined `content`, causing Zod validation errors on the server.

When a framework does a major version bump, your muscle memory becomes your enemy.

---

## Design: Not Another ChatGPT Clone

Every AI chatbot in 2026 looks the same. Dark sidebar, message bubbles, the same layout OpenAI popularized. I wanted something different.

**Decision point: What should a luxury apartment assistant look and feel like?**

Took inspiration from Intercom's design system — they've been doing conversational UI longer than anyone. But adapted for residential context: swapped corporate blue for Sobha emerald green, added warm gold for citations, went with a dark theme that feels more like a premium app than a developer tool.

**Decision point: Stripe's typography trick for the landing page.**

For the landing page, studied Stripe, Apple, and Linear. Key finding: **font-weight 300 is the luxury signal**. Most devs default to 600-700 for headlines. Stripe uses 300 with tight letter-spacing — it completely changes the feel. Used Playfair Display for headings with this same approach.

**Decision point: Perplexity-style inline citations.**

Every factual claim in the bot's response gets an inline citation: `[1]`, `[2]`, etc. Click it, and it scrolls to a reference card at the bottom of the message. Click the reference, and it expands to show the actual source text from the document.

Built fuzzy matching to connect the LLM's citation text to the retrieved chunks — document names, section numbers, and page references all get matched with a scoring system. It's not perfect, but when a resident sees "As per Clause 36(a) of the SIAOA Bylaws" and can click to see the actual clause text, that's trust you can't get any other way.

**Decision point: Apartment-life typing indicators.**

While the AI is thinking, instead of generic "Typing..." it cycles through messages like "Flipping through the bylaws", "Coming up from B3", "Asking the security desk", "Checking with the RWA office." Small touch, but it makes the bot feel like it belongs in the building.

---

## The Feature I Built and Then Deleted

Built an entire knowledge base: `/docs` index page with all 19 documents, individual pages with section anchors, citations in chat linking to document pages with `#page-N` anchors. Fuzzy doc name matching for URL resolution. All statically pre-rendered.

**Decision point: Ship it or revert it.**

Reverted the whole thing. The OCR'd text renders poorly as web pages — broken tables, artifacts, no structure. It looked bad. A demo that's mostly great but has one section that looks broken is worse than a demo without that section.

The commit message reads: "revert: remove knowledge base pages, raw OCR not demo-ready." Sometimes the best engineering decision is deleting code.

---

## Model Fallback (Because Free Tiers Go Down)

**Decision point: What happens when Gemini's free tier hits its limit?**

Added a fallback chain in the API route: Gemini Flash Lite first, then Groq's Llama 3.3 70B (also free). If the first model throws an error — quota, auth, anything — it automatically tries the next. Both produce good enough answers for apartment questions.

The implementation is simple: loop through models, try each one, catch errors, move to next. Last model failure returns a 503. No complex orchestration needed.

---

## Where It Stands

375 chunks across 20 documents in Supabase. Hybrid search + Cohere reranking. Two-tier query routing. Cited answers with expandable source excerpts. Chat sessions persisted in localStorage. Feedback buttons on every response. A landing page that doesn't look like it was built in a hackathon.

Total cost: $0/month.

The biggest lesson isn't technical. It's that building for a real community — people who will actually use it, whose questions I hear in the elevator every week — changes how you make decisions. You don't over-engineer because you want to ship. You don't cut corners on citations because your neighbor will call you out if the answer is wrong. You build the knowledge base feature and then delete it because you'd be embarrassed to show it.

The best portfolio projects aren't the most technically complex ones. They're the ones where you had real stakes.

---

*Built with Next.js, Vercel AI SDK, Google Gemini, Supabase pgvector, and Cohere. Deployed on Vercel. Source code available on GitHub.*
