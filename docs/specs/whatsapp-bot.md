# Spec: WhatsApp Bot Integration

## Objective

Let Sobha Indraprastha residents message a WhatsApp number and get the same RAG-powered answers they get from the web UI — with citations, source references, and multilingual support. The bot reuses the existing RAG pipeline entirely.

**User story:** A resident sends "What's the penalty for unauthorized parking?" on WhatsApp and gets back an answer with the exact clause, fine amount, and source document reference — within seconds.

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| WhatsApp API | Meta Cloud API (direct) | Free for service conversations (user-initiated), no cap |
| Webhook handler | Next.js API route on Vercel | Same project, same deployment |
| RAG pipeline | Existing (retriever, reranker, query router, prompt) | Zero duplication |
| LLM | Existing model cascade (Gemini → Groq fallback) | Same as web |
| Message formatting | WhatsApp markdown subset | Bold, italic, monospace, lists |

## Architecture

```
Resident sends WhatsApp message
         │
         ▼
Meta Cloud API ──webhook POST──▶ /api/whatsapp/route.ts
                                        │
                                        ├── 1. Verify signature (HMAC-SHA256)
                                        ├── 2. Extract message text
                                        ├── 3. Condense (if multi-turn)
                                        ├── 4. Route query (regex → LLM)
                                        ├── 5. Retrieve (hybrid search + rerank)
                                        ├── 6. Generate (Gemini/Groq, non-streaming)
                                        ├── 7. Format citations for WhatsApp
                                        ├── 8. Send reply via Meta API
                                        └── 9. Return 200
```

## Meta Cloud API Setup

### Prerequisites
- Meta Business account (free)
- Meta Developer app (free)
- WhatsApp Business Account (WABA) — created in Meta Business Suite
- Test phone number (provided by Meta for dev, free)
- Permanent access token or System User token

### Environment Variables (new)
```
WHATSAPP_VERIFY_TOKEN=<random string you choose>
WHATSAPP_ACCESS_TOKEN=<from Meta Business Suite>
WHATSAPP_PHONE_NUMBER_ID=<from Meta app dashboard>
```

### Webhook Configuration
- **Webhook URL:** `https://sobha-concierge.vercel.app/api/whatsapp`
- **Verify token:** matches `WHATSAPP_VERIFY_TOKEN`
- **Subscribed fields:** `messages`

## API Routes

### GET /api/whatsapp — Webhook Verification
Meta sends a GET request during setup to verify the endpoint.

```
Query params: hub.mode, hub.verify_token, hub.challenge
Response: hub.challenge (plain text) if token matches, 403 otherwise
```

### POST /api/whatsapp — Incoming Messages
Meta sends a POST with message payload.

```
1. Verify X-Hub-Signature-256 header (HMAC-SHA256 of raw body)
2. Parse message from payload (handle nested entry[].changes[].value.messages[])
3. Ignore non-text messages (images, voice, stickers) — reply with "I can only read text messages"
4. Ignore status updates (delivered, read receipts)
5. Run existing RAG pipeline: condense → route → retrieve → generate
6. Format response for WhatsApp (convert citations)
7. Send reply via POST to Meta's messages endpoint
8. Return 200 OK
```

## Citation Format (WhatsApp)

Web UI uses superscript numbers with expandable footnotes. WhatsApp doesn't support this.

**WhatsApp format:**
```
The penalty for unauthorized parking is ₹200/day. _(SIAOA Bylaws, Clause 42a, Page 15)_

Residents must register vehicles with the association. _(Board Meeting Minutes, 10 Jan 2026, Page 2)_
```

- Citations are inline, italic, parenthesized
- No expandable sections, no numbered footnotes
- Keep it short: document name, clause/section, page
- Drop the exact quote to save message length (WhatsApp has 4096 char limit)

## WhatsApp-Specific System Prompt Additions

Add to existing system prompt (or override for WhatsApp channel):
```
WHATSAPP FORMAT RULES:
- Keep responses under 3000 characters (WhatsApp limit is 4096, leave room for citations)
- Use WhatsApp markdown: *bold*, _italic_, ~strikethrough~, ```monospace```
- No numbered footnote citations. Instead, put citations inline in parentheses and italics after each claim
- Use bullet points (- ) not numbered lists for readability on mobile
- No headers (WhatsApp doesn't render ## headers)
```

## Multi-Turn Context

WhatsApp messages are stateless from Meta's perspective — each webhook is independent. Multi-turn from day one.

**Storage:** Supabase table `whatsapp_conversations` — store recent messages per phone number (hashed).

```sql
create table whatsapp_conversations (
  id bigint generated always as identity primary key,
  phone_hash text not null,          -- SHA-256 of phone number (no raw PII)
  role text not null,                 -- 'user' or 'assistant'
  content text not null,
  created_at timestamptz default now()
);

create index idx_wa_conv_phone_hash on whatsapp_conversations (phone_hash, created_at desc);
```

**Context window:** Last 6 messages (3 turns) per phone number. Older messages are still in the table but not loaded. Use existing `condenseForRetrieval` to resolve pronouns like "what about the penalty for that?"

**TTL:** Messages older than 24 hours are ignored (matches WhatsApp's service window). Cron or manual cleanup later.

## Welcome Message

On first message from a new phone number (no history in `whatsapp_conversations`):

```
👋 Hi! I'm Sobha Concierge — your AI assistant for all things Sobha Indraprastha.

Ask me about bylaws, penalties, meeting decisions, MyGate, or anything in the apartment docs. I'll answer with exact references.

Try: "What are the parking rules?" or "What was decided in the last board meeting?"
```

Sent before processing their actual question. Their question is still answered in the same webhook call (two messages sent: welcome + answer).

## Error Handling

| Scenario | Behavior |
|---|---|
| Signature verification fails | Return 200 (don't leak info), log warning, don't process |
| Non-text message (image, voice, sticker) | Reply: "I can only read text messages right now. Please type your question." |
| RAG pipeline fails | Reply: "Something went wrong. Please try again, or contact SIAOA at bom@siaoa.co.in" |
| Response > 4096 chars | Truncate and append "...for the full answer, visit [web link]" |
| Rate limiting from Meta | Exponential backoff on send, log for monitoring |

## Project Structure (new files)

```
src/
  app/
    api/
      whatsapp/
        route.ts           # GET (verify) + POST (incoming messages)
  lib/
    whatsapp/
      client.ts            # Send message via Meta API
      format.ts            # Convert web citations → WhatsApp format
      verify.ts            # HMAC-SHA256 signature verification
      types.ts             # Meta webhook payload types
    rag/
      prompt.ts            # Add WhatsApp-specific prompt variant
```

## Commands

```
Build:  npm run build
Dev:    npm run dev
Test:   npm test (once tests exist)
Deploy: git push (Vercel auto-deploys)
```

## Testing Strategy

- **Unit tests:** signature verification, message parsing, citation formatting
- **Integration test:** mock Meta webhook payload → verify RAG pipeline is called → verify response format
- **Manual test:** Use Meta's test phone number to send real messages during dev
- **Monitoring:** Log every incoming message + response time + model used

## Boundaries

### Always
- Verify webhook signatures before processing
- Return 200 to Meta quickly (process inline, but don't block)
- Log incoming messages for debugging (redact phone numbers in production)
- Reuse existing RAG pipeline — no duplication

### Ask First
- Adding new dependencies
- Storing phone numbers or message history in Supabase
- Changing the existing system prompt (WhatsApp variant should be separate)

### Never
- Store messages with PII without consent
- Send marketing/template messages (keep it service-only = free)
- Skip signature verification
- Expose Meta tokens in client-side code

## Success Criteria

1. Resident sends a text message on WhatsApp → gets a cited answer within 10 seconds
2. Citations are readable on mobile (inline italic parenthesized format)
3. Non-text messages get a polite "text only" reply
4. Invalid/spoofed webhooks are rejected silently
5. Existing web UI is unaffected
6. Zero new monthly cost (Meta service conversations are free)

## Open Questions

1. **Phone number:** Use Meta's test number for dev. Register a dedicated number when ready for residents.
2. **Rate limiting:** Add later if abuse happens. Not MVP.
3. **Cleanup cron:** Messages older than 24h — manual cleanup for now, cron later.
