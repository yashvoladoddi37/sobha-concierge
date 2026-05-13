# SPEC: WhatsApp Bot + MyGate Agentic Layer

## Objective

Turn Sobha Concierge from a web-only Q&A chatbot into a WhatsApp-native AI agent that answers resident questions AND takes real-world actions (MyGate pre-approvals, visitor management) on their behalf.

**User story (Phase 1 — WhatsApp RAG):**
Resident sends "What's the penalty for unauthorized parking?" on WhatsApp → gets cited answer within 10 seconds.

**User story (Phase 2 — MyGate Agent):**
Resident sends "Pre-approve Swiggy deliveries for the next 30 days, 10am-10pm" on WhatsApp → bot authenticates with MyGate, creates batch pre-approvals, confirms done.

## Phases

| Phase | What | Depends on | Timeline |
|---|---|---|---|
| **1** | WhatsApp bot with existing RAG pipeline | Meta Business account setup | ~1 week |
| **2** | MyGate agentic actions via unofficial resident API | Phase 1 + MyGate OTP auth flow | ~1 week |

---

## Phase 1: WhatsApp RAG Bot

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| WhatsApp API | Meta Cloud API (direct) | Free for service conversations (user-initiated) |
| Webhook handler | Next.js API route on Vercel | Same project, same deployment |
| RAG pipeline | Existing (retriever, reranker, query router, prompt) | Zero duplication |
| LLM | Existing model cascade (Gemini → Groq fallback) | Same as web |
| Message formatting | WhatsApp markdown subset | Bold, italic, monospace, lists |

### Architecture

```
Resident sends WhatsApp message
         |
         v
Meta Cloud API --webhook POST--> /api/whatsapp/route.ts
                                        |
                                        +-- 1. Verify signature (HMAC-SHA256)
                                        +-- 2. Extract message text
                                        +-- 3. Load conversation context (last 6 msgs)
                                        +-- 4. Condense (if multi-turn)
                                        +-- 5. Route query (regex -> LLM)
                                        +-- 6. Retrieve (hybrid search + rerank)
                                        +-- 7. Generate (Gemini/Groq, NON-streaming)
                                        +-- 8. Format citations for WhatsApp
                                        +-- 9. Send reply via Meta API
                                        +-- 10. Store messages in Supabase
                                        +-- 11. Return 200
```

### Meta Cloud API Setup

**Prerequisites (all free):**
- Meta Business account
- Meta Developer app with WhatsApp product added
- Test phone number (provided by Meta automatically)
- Up to 5 recipient numbers for testing

**Environment variables:**
```
WHATSAPP_VERIFY_TOKEN=sobha-concierge-webhook-verify-2026
WHATSAPP_ACCESS_TOKEN=<from Meta app dashboard>
WHATSAPP_PHONE_NUMBER_ID=<from Meta app dashboard>
```

**Webhook URL:** `https://sobha-chatbot.vercel.app/api/whatsapp`
**Subscribed fields:** `messages`

### API Routes

#### GET /api/whatsapp — Webhook Verification

Meta sends GET during setup to verify endpoint.

```
Query params: hub.mode, hub.verify_token, hub.challenge
Response: hub.challenge (plain text) if token matches, 403 otherwise
```

#### POST /api/whatsapp — Incoming Messages

```
1. Verify X-Hub-Signature-256 header (HMAC-SHA256 of raw body with app secret)
2. Parse message from payload (entry[].changes[].value.messages[])
3. Ignore non-text messages -> reply "I can only read text messages right now"
4. Ignore status updates (delivered, read receipts)
5. Check if new user -> send welcome message first
6. Run existing RAG pipeline: condense -> route -> retrieve -> generate
7. Format response for WhatsApp (convert citations)
8. Send reply via POST to Meta messages endpoint
9. Store user message + bot reply in whatsapp_conversations
10. Return 200 OK immediately
```

### WhatsApp Citation Format

Web UI uses `[Source: Doc | Clause | Page | "quote"]`. WhatsApp uses shorter inline format:

```
The penalty for unauthorized parking is Rs 200/day. _(SIAOA Bylaws, Clause 42a, Page 15)_

Residents must register vehicles with the association. _(Board Meeting, 10 Jan 2026, Page 2)_
```

Rules:
- Citations inline, italic, parenthesized
- Document name, clause/section, page — no exact quotes (saves chars)
- Keep responses under 3000 chars (WhatsApp limit 4096, leave room)
- Use WhatsApp markdown: *bold*, _italic_, ~strikethrough~, ```monospace```
- Bullet points (- ) not numbered lists
- No ## headers (WhatsApp doesn't render them)

### WhatsApp System Prompt

Add to existing system prompt as a channel-specific override:

```
WHATSAPP FORMAT RULES:
- Keep responses under 3000 characters
- Use WhatsApp markdown: *bold*, _italic_, ~strikethrough~, ```monospace```
- No numbered footnote citations. Put citations inline: _(Document, Section, Page)_
- Use bullet points (- ) not numbered lists
- No headers
- Be concise — mobile screens are small
```

### Multi-Turn Context

**Storage:** Supabase table `whatsapp_conversations`

```sql
create table whatsapp_conversations (
  id bigint generated always as identity primary key,
  phone_hash text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create index idx_wa_conv_phone on whatsapp_conversations (phone_hash, created_at desc);
```

- Phone numbers stored as SHA-256 hashes (no raw PII)
- Load last 6 messages (3 turns) per phone
- Messages older than 24h ignored (matches WhatsApp service window)
- Use existing `condenseForRetrieval` for pronoun resolution

### Welcome Message

First message from new phone number:

```
Hi! I'm Sobha Concierge — your AI assistant for Sobha Indraprastha.

Ask me about bylaws, penalties, meeting decisions, parking, pets, maintenance — anything in the apartment docs. Every answer comes with citations.

Try: "What are the parking rules?" or "What was decided in the last board meeting?"
```

Sent before processing their question. Both messages sent in same webhook call.

### Error Handling

| Scenario | Behavior |
|---|---|
| Signature verification fails | Return 200 (don't leak), log warning, don't process |
| Non-text message | Reply: "I can only read text messages right now. Please type your question." |
| RAG pipeline fails | Reply: "Something went wrong. Please try again, or contact SIAOA at bom@siaoa.co.in" |
| Response > 4096 chars | Truncate at 3000, append "... for the full answer, visit sobha-chatbot.vercel.app" |
| Rate limit from Meta | Exponential backoff on send, log |

### New Files (Phase 1)

```
src/
  app/
    api/
      whatsapp/
        route.ts              # GET (verify) + POST (incoming messages)
  lib/
    whatsapp/
      client.ts               # Send message via Meta API
      format.ts               # Convert web citations -> WhatsApp format
      verify.ts               # HMAC-SHA256 signature verification
      types.ts                # Meta webhook payload types
    rag/
      prompt-whatsapp.ts      # WhatsApp-specific system prompt variant
supabase/
  migrations/
    005_whatsapp_conversations.sql
```

---

## Phase 2: MyGate Agentic Layer

### How It Works

Resident sends natural language command on WhatsApp. Bot detects it's an action (not a question), authenticates with MyGate's resident API, executes the action, confirms.

### MyGate Resident API (Unofficial)

Same API the MyGate mobile app uses. Proven by open-source MyGatePass project.

**Auth flow:**
1. `POST /send-otp` — send OTP to resident's registered mobile
2. `POST /verify-otp` — verify OTP, receive `access_key` + `user_id`
3. Use `access_key` for subsequent API calls (pre-approvals, etc.)

**Core actions:**
| Action | What it does |
|---|---|
| Pre-approve delivery | Create time-windowed pre-approval for company (Swiggy, Amazon, etc.) |
| Pre-approve cab | Create pre-approval for Uber/Ola/Rapido in time window |
| Batch pre-approve | Create N days of pre-approvals in one command |

### Intent Detection

Extend existing query router with a new tier: **action detection**.

```
User message arrives
    |
    +-- Is it an action? (regex + LLM classification)
    |     |
    |     +-- YES -> Extract params -> Execute MyGate API -> Confirm
    |     +-- NO  -> Existing RAG pipeline (question/answer)
```

**Action patterns (regex tier):**
```
/\b(pre.?approv|preapprov|allow|approve)\b.*\b(swiggy|zomato|blinkit|amazon|uber|ola|rapido|delivery|cab)\b/i
/\b(set up|create|add)\b.*\b(pre.?approv|entry|access)\b/i
/\b(block|reject|deny|stop)\b.*\b(visitor|entry|access)\b/i
```

**Action parameters to extract:**
- Company name (Swiggy, Uber, etc.)
- Time window (start time, end time)
- Duration (number of days)
- Action type (approve / block)

### MyGate Auth Flow via WhatsApp

First time a resident wants to use MyGate actions:

```
User: "Pre-approve Swiggy for next 30 days"

Bot: "To manage MyGate actions, I need to verify your identity once.
     I'll send an OTP to your registered MyGate number.
     Reply with the OTP to continue."

[Bot calls MyGate send-otp API with phone number derived from WhatsApp sender]

User: "482910"

Bot: "Verified! Setting up Swiggy pre-approval for 30 days (7am-11pm)...
     Done — 30 pre-approvals created. Swiggy deliveries will be auto-approved."
```

**Session persistence:**
- Store `access_key` + `user_id` in Supabase (encrypted), keyed by phone_hash
- Token refresh: if API returns 401, prompt re-authentication
- Never store raw phone numbers

### New Supabase Table (Phase 2)

```sql
create table mygate_sessions (
  id bigint generated always as identity primary key,
  phone_hash text unique not null,
  access_key_encrypted text not null,
  user_id text not null,
  created_at timestamptz default now(),
  last_used_at timestamptz default now()
);
```

### Agentic Tool Architecture

LLM with tool-calling capability. Tools registered:

```typescript
tools: {
  mygate_pre_approve: {
    description: "Create a pre-approval for delivery/cab entry",
    parameters: {
      company: string,       // "Swiggy", "Uber", etc.
      start_time: string,    // "07:00"
      end_time: string,      // "23:00"
      num_days: number,      // 1-365
    }
  },
  mygate_check_auth: {
    description: "Check if user has active MyGate session",
    parameters: {}
  },
  mygate_send_otp: {
    description: "Send OTP for MyGate authentication",
    parameters: {}
  }
}
```

### New Files (Phase 2)

```
src/
  lib/
    mygate/
      client.ts               # MyGate API calls (send-otp, verify-otp, pre-approve)
      auth.ts                 # Session management (store/retrieve/refresh tokens)
      crypto.ts               # Encrypt/decrypt access keys
      types.ts                # MyGate API types
    whatsapp/
      action-router.ts        # Detect action vs question intent
      tools.ts                # Tool definitions for agentic LLM
supabase/
  migrations/
    006_mygate_sessions.sql
```

---

## Project Structure (complete after both phases)

```
src/
  app/
    api/
      chat/route.ts            # Existing web UI endpoint
      feedback/route.ts        # Existing feedback endpoint
      whatsapp/route.ts        # NEW: WhatsApp webhook (Phase 1)
    chat/page.tsx              # Existing web chat UI
    layout.tsx
    page.tsx
  lib/
    rag/
      embeddings.ts            # Existing
      prompt.ts                # Existing web prompt
      prompt-whatsapp.ts       # NEW: WhatsApp prompt variant (Phase 1)
      query-router.ts          # Existing
      retriever.ts             # Existing
    whatsapp/
      client.ts                # NEW: Meta API client (Phase 1)
      format.ts                # NEW: Citation formatter (Phase 1)
      verify.ts                # NEW: Webhook signature verification (Phase 1)
      types.ts                 # NEW: Meta payload types (Phase 1)
      action-router.ts         # NEW: Action vs question detection (Phase 2)
      tools.ts                 # NEW: Agentic tool definitions (Phase 2)
    mygate/
      client.ts                # NEW: MyGate API client (Phase 2)
      auth.ts                  # NEW: Session management (Phase 2)
      crypto.ts                # NEW: Token encryption (Phase 2)
      types.ts                 # NEW: MyGate types (Phase 2)
    db/
      supabase.ts              # Existing
    chat-store.ts              # Existing
    types.ts                   # Existing
    utils.ts                   # Existing
```

## Commands

```
Build:    npm run build
Dev:      npm run dev
Deploy:   git push (Vercel auto-deploys)
```

## Code Style

- TypeScript strict mode, existing patterns
- No new dependencies unless essential (Meta API = raw fetch, no SDK)
- Reuse existing RAG pipeline — zero duplication
- Non-streaming responses for WhatsApp (Meta API is request/response, not SSE)
- All WhatsApp-specific code isolated in `src/lib/whatsapp/`
- All MyGate-specific code isolated in `src/lib/mygate/`

## Testing Strategy

**Phase 1:**
- Unit: signature verification, message parsing, citation formatting
- Integration: mock Meta webhook payload -> verify RAG called -> verify response format
- Manual: Meta test phone number, send real messages

**Phase 2:**
- Unit: action intent detection, parameter extraction, OTP flow
- Integration: mock MyGate API responses -> verify pre-approval creation
- Manual: real MyGate account, test pre-approval flow end-to-end

## Boundaries

### Always
- Verify webhook signatures before processing
- Return 200 to Meta immediately (don't block)
- Hash phone numbers before storage (SHA-256)
- Encrypt MyGate tokens at rest
- Reuse existing RAG pipeline for questions
- Log request/response times for monitoring

### Ask First
- Adding new npm dependencies
- Changing existing system prompt (WhatsApp variant is separate)
- Storing any new PII in Supabase
- Changing query router logic

### Never
- Store raw phone numbers
- Store unencrypted MyGate tokens
- Send marketing/template messages (keeps it free)
- Skip webhook signature verification
- Expose Meta or MyGate tokens in client-side code
- Modify existing web UI chat route

## Success Criteria

### Phase 1
1. Resident sends text on WhatsApp -> gets cited answer < 10 seconds
2. Citations readable on mobile (inline italic format)
3. Non-text messages get polite rejection
4. Invalid webhooks rejected silently
5. Multi-turn context works (follow-up questions resolved)
6. Existing web UI completely unaffected
7. Zero monthly cost

### Phase 2
1. "Pre-approve Swiggy for 30 days" -> 30 pre-approvals created on MyGate
2. OTP auth flow works conversationally on WhatsApp
3. Session persists across conversations (no re-auth every time)
4. Action detection doesn't false-positive on questions about MyGate
5. Failed actions get clear error messages

## Open Questions

1. **MyGate token expiry** — How long does the access_key last? Need to test. MyGatePass stores in localStorage indefinitely, suggesting long-lived tokens.
2. **WhatsApp 24h window** — Service conversations are free within 24h of last user message. If user doesn't message for 24h, we can't proactively notify. Acceptable for v1.
3. **Rate limits** — MyGate unofficial API rate limits unknown. Start conservative (1 req/sec).
4. **Multi-device** — If multiple family members message from different numbers for same flat, each gets separate context. Acceptable for v1.

## Not Doing (and Why)

- **Voice note support** — Adds speech-to-text dependency, complexity. Text-only for v1.
- **Group chat support** — WhatsApp Business API doesn't support groups well. 1:1 only.
- **Proactive notifications** — Requires template messages (paid). Stay reactive (free).
- **Official MyGate partnership** — Requires business entity, months of process. Unofficial API works now.
- **Multi-community support** — Sobha Indraprastha only. Not building a platform.
- **Image/document sharing** — No sending PDFs or images of documents. Text answers with citations.
- **Payment integration** — No maintenance payment via bot. Too much liability.
