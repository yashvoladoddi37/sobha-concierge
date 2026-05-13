# Tasks: WhatsApp Bot — Phase 1

## T1: Types + Signature Verification
**File:** `src/lib/whatsapp/types.ts`, `src/lib/whatsapp/verify.ts`
**What:** TypeScript types for Meta webhook payloads + HMAC-SHA256 verification function.
**Acceptance:**
- [ ] Types cover: webhook verification query params, incoming message payload (entry > changes > value > messages), message types (text, image, etc.), status updates
- [ ] `verifySignature(rawBody, signature, appSecret)` returns boolean
- [ ] Rejects tampered payloads, accepts valid ones
**Verify:** Unit test — pass known payload + signature, confirm true. Tamper payload, confirm false.
**Status:** [ ]

## T2: Meta Client (Send Message)
**File:** `src/lib/whatsapp/client.ts`
**What:** Function to send text message via Meta Cloud API.
**Acceptance:**
- [ ] `sendWhatsAppMessage(to, text)` sends POST to `graph.facebook.com/v21.0/{phoneNumberId}/messages`
- [ ] Handles WhatsApp 4096 char limit — truncates with link to web
- [ ] Returns success/failure
- [ ] Uses env vars: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
**Verify:** `npm run build` passes. Manual test after deploy (T7).
**Status:** [ ]

## T3: WhatsApp System Prompt
**File:** `src/lib/rag/prompt-whatsapp.ts`
**What:** WhatsApp-specific system prompt variant. Imports base personality from `prompt.ts`, adds WhatsApp formatting rules.
**Acceptance:**
- [ ] Exports `WHATSAPP_SYSTEM_PROMPT` string
- [ ] Includes all base personality/accuracy rules from existing prompt
- [ ] Adds WhatsApp format rules: under 3000 chars, WhatsApp markdown, inline citations as `_(Doc, Section, Page)_`, bullet points, no headers, no exact quotes in citations
- [ ] Does NOT modify `prompt.ts`
**Verify:** Read the prompt, confirm it covers all SPEC citation rules. `npm run build` passes.
**Status:** [ ]

## T4: Citation Formatter
**File:** `src/lib/whatsapp/format.ts`
**What:** Not LLM output formatting (that's handled by prompt). This converts any edge cases: truncation logic, WhatsApp markdown escaping, character limit enforcement.
**Acceptance:**
- [ ] `formatForWhatsApp(text)` enforces 3000 char limit
- [ ] If over limit, truncates at last complete sentence before 3000, appends "... full answer at sobha-chatbot.vercel.app"
- [ ] Strips any `##` headers that LLM might still produce (replace with *bold*)
**Verify:** Test with string > 3000 chars, confirm truncation at sentence boundary. Test with headers, confirm stripped.
**Status:** [ ]

## T5: Supabase Migration — whatsapp_conversations
**File:** `supabase/migrations/005_whatsapp_conversations.sql`
**What:** Create table + index for multi-turn WhatsApp context.
**Acceptance:**
- [ ] Table: `whatsapp_conversations` with columns: id (identity PK), phone_hash (text, not null), role (text, not null), content (text, not null), created_at (timestamptz, default now)
- [ ] Index on (phone_hash, created_at desc) for fast recent-message lookup
- [ ] No raw PII — phone_hash is SHA-256
**Verify:** Run migration on Supabase. Query empty table, confirm schema matches.
**Status:** [ ]

---

**CHECKPOINT: T1-T5 complete. All building blocks exist. Nothing deployed yet. `npm run build` must pass.**

---

## T6: Webhook Route (GET + POST)
**File:** `src/app/api/whatsapp/route.ts`
**What:** The main integration — ties everything together.
**Depends on:** T1, T2, T3, T4, T5
**Acceptance:**
- [ ] `GET` handler: reads `hub.mode`, `hub.verify_token`, `hub.challenge` from query params. Returns challenge if token matches env var, 403 otherwise
- [ ] `POST` handler: verifies signature (T1), parses message (T1 types), ignores non-text + status updates
- [ ] Non-text messages get "text only" reply via T2
- [ ] Loads last 6 messages from `whatsapp_conversations` for phone_hash
- [ ] First-time users get welcome message (T2) before answer
- [ ] Runs existing RAG pipeline: `condenseForRetrieval` -> `routeQuery` -> `retrieve` -> `generateText` with WhatsApp prompt (T3)
- [ ] Uses NON-streaming `generateText` (not `streamText`)
- [ ] Applies formatForWhatsApp (T4) to LLM output
- [ ] Sends reply via Meta API (T2)
- [ ] Stores user message + bot reply in whatsapp_conversations (T5)
- [ ] Returns 200 OK
- [ ] Model cascade: try Gemini first, fall back to Groq (same as web)
- [ ] Error handling: RAG failure -> friendly error message, signature fail -> silent 200
**Verify:** `npm run build` passes. Deploy to Vercel (T7), send real message.
**Status:** [ ]

---

**CHECKPOINT: T6 complete. Code is done. Need Meta setup + deploy to test.**

---

## T7: Deploy + Meta Webhook Setup
**What:** Deploy to Vercel, configure Meta webhook, test end-to-end.
**Depends on:** T6
**Acceptance:**
- [ ] User creates Meta Business account + Developer app (manual step)
- [ ] User adds WhatsApp product, gets test phone number
- [ ] User copies access token + phone number ID to Vercel env vars
- [ ] Webhook URL configured in Meta: `https://sobha-chatbot.vercel.app/api/whatsapp`
- [ ] Verify token handshake succeeds (Meta sends GET, gets challenge back)
- [ ] Subscribed to `messages` field
**Verify:** Meta dashboard shows webhook as "verified". No deploy errors in Vercel.
**Status:** [ ]

## T8: End-to-End Test
**What:** Send real messages from test phone, verify full flow.
**Depends on:** T7
**Acceptance:**
- [ ] Send "What are the parking rules?" -> get cited answer < 10s
- [ ] Send follow-up "tell me more" -> get expanded answer using context
- [ ] Send image/sticker -> get "text only" reply
- [ ] Send "Hi" -> get welcome message (first time) + greeting
- [ ] Citations use WhatsApp format: _(Doc, Section, Page)_
- [ ] Response under 3000 chars
- [ ] Web UI at sobha-chatbot.vercel.app still works perfectly
- [ ] Check Supabase: whatsapp_conversations has entries with hashed phone
**Verify:** All 8 checks pass manually.
**Status:** [ ]

---

## Summary

| Task | Files | Depends on | Estimated effort |
|---|---|---|---|
| T1 | types.ts, verify.ts | — | 30 min |
| T2 | client.ts | — | 30 min |
| T3 | prompt-whatsapp.ts | — | 20 min |
| T4 | format.ts | — | 20 min |
| T5 | 005_whatsapp_conversations.sql | — | 10 min |
| T6 | route.ts | T1-T5 | 1-2 hours |
| T7 | (manual Meta setup) | T6 | 30 min |
| T8 | (manual testing) | T7 | 30 min |

**Total: ~4-5 hours of coding, ~1 hour of setup/testing.**
