# Plan: WhatsApp Bot — Phase 1

## Dependency Graph

```
T1: Types + Verify ──────────────────┐
                                     │
T2: Meta Client (send message) ──────┤
                                     │
T3: WhatsApp System Prompt ──────────┤
                                     │
T4: Citation Formatter ──────────────┼──> T6: Webhook Route (GET + POST)
                                     │         |
T5: Supabase Migration ─────────────┘         |
  (whatsapp_conversations)                     |
                                               v
                                     T7: Deploy + Meta Setup
                                               |
                                               v
                                     T8: End-to-End Test
```

T1-T5 are independent — can be built in parallel.
T6 depends on all of T1-T5.
T7 depends on T6.
T8 depends on T7.

## Slicing Strategy

Vertical slices. Each task produces a file that compiles and can be tested in isolation. No horizontal "set up all types first" layers — each task includes its own types inline or imports from T1.

## Key Decisions

1. **No new dependencies.** Meta API = raw `fetch`. Crypto = Node.js `crypto` module. No SDK.
2. **Non-streaming LLM.** WhatsApp is request/response. Use `generateText` not `streamText`. Reuse same model cascade + retriever.
3. **Existing RAG pipeline untouched.** Import `retrieve`, `routeQuery`, `condenseForRetrieval`, `buildPromptWithContext` as-is. Only new thing: WhatsApp-specific system prompt + citation format.
4. **Web UI route untouched.** `src/app/api/chat/route.ts` gets zero changes.

## Risk: Vercel Function Timeout

WhatsApp webhook must return 200 fast. But RAG pipeline (embed + search + rerank + LLM generate) takes 5-10s. Meta retries after 20s if no 200.

**Mitigation:** Return 200 immediately, process in background. But Vercel serverless functions terminate after response is sent. Two options:
- **Option A:** `waitUntil` (Next.js 16 supports this) — continues execution after response
- **Option B:** Process inline, Meta's timeout is actually 20s which is fine for our ~8s pipeline

Going with Option B. If we hit timeout issues, switch to `waitUntil`.

## Environment Variable Needed Before T7

User must complete Meta Business setup and fill in:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

`WHATSAPP_VERIFY_TOKEN` already set in `.env.local`.
