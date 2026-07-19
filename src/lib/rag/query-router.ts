/**
 * Query Router: Two-tier intent classification.
 *
 * Tier 1: Regex (0ms, free) — catches obvious patterns like "bylaw", "penalty", "EGM"
 * Tier 2: LLM via generateText + Output.object — handles ambiguous questions
 *         like "Can I keep a pet?" or "What about the CCTV thing from last month?"
 *
 * The LLM call adds ~300ms but gets routing right on questions regex can't parse.
 */

import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────────────────

export interface RouteResult {
  docTypeFilter: string | null;
  intent: string;
  method: "regex" | "llm";
}

const DOC_TYPES = [
  "bylaws",
  "penalties",
  "minutes",
  "deed",
  "act",
  "financial",
  "certificate",
  "notice",
  "mygate",
  "general",
] as const;

type DocType = (typeof DOC_TYPES)[number];

// ── Tier 1: Regex (high-confidence patterns only) ─────────────────────────

const REGEX_ROUTES: { patterns: RegExp[]; docType: string; intent: string }[] = [
  {
    patterns: [
      /\b(bylaw|bye.?law|clause \d)/i,
      /\b(pet|dog|cat|animal|bird|cattle)\b/i,
      /\b(pool|swimming|gym|clubhouse|badminton|tennis|squash|court|amenit)/i,
      /\b(renovate|renovation|alterat|construct|interior|kitchen|bathroom|permission)\b/i,
      /\b(rent|tenant|lease|sublet|airbnb|short.?stay|pg|bachelor)\b/i,
      /\b(domestic help|maid|cook|driver|staff|servant|register)\b/i,
      /\b(noise|disturb|party|music|loud|shout|drill)\b/i,
      /\b(park|parking|slot|car|vehicle|electric|ev|charge)\b/i,
      /\b(garbage|waste|segregat|trash|bin)\b/i,
    ],
    docType: "bylaws",
    intent: "bylaws_explicit",
  },
  {
    patterns: [
      /\b(penalty|fine|penalt|violation|charge|late.?(fee|pay))\b/i,
    ],
    docType: "penalties",
    intent: "penalties_explicit",
  },
  {
    patterns: [
      /\b(meeting|minutes|mom)\b.*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})\b/i,
      /\b(egm|agm|sgm)\b/i,
      /\b(water|supply|tanker|cavery|borewell)\b/i,
      /\b(cctv|camera|secur|surv|guard|intercom)\b/i,
      /\b(election|committ|board|president|secretary|treasurer)\b/i,
    ],
    docType: "minutes",
    intent: "minutes_explicit",
  },
  {
    patterns: [
      /\b(deed of declaration|undivided share|carpet area|super built|sqft|sq\.ft)\b/i,
      /\b(common areas?|terrace|corridor|lobby|lift|staircase)\b/i,
      /\b(land|share|percent|proportion)\b/i,
    ],
    docType: "deed",
    intent: "deed_explicit",
  },
  {
    patterns: [
      /\bkarnataka.*act\b/i,
      /\bapartment ownership act\b/i,
      /\b(legal|law|state|government|section \d)\b/i,
      /\b(owner|resident)\b.*\b(rights|powers|duty)\b/i,
    ],
    docType: "act",
    intent: "act_explicit",
  },
  {
    patterns: [
      /\b(occupancy certificate|completion certificate|bbmp.{0,5}(certificate|oc|approval|sanction)|sanction|approv|fire noc|oc|plans)\b/i,
    ],
    docType: "certificate",
    intent: "certificate_explicit",
  },
  {
    patterns: [
      /\b(maintenance|bill|receipt|invoice|fund|finance|income|expend|budget|corpus|audit|tax)\b/i,
      /\b(how much).*(pay|maintenance|charge)\b/i,
    ],
    docType: "financial",
    intent: "financial_explicit",
  },
  {
    patterns: [
      /\b(mygate|my.?gate)\b/i,
      /\b(pre.?approv|preapprov)/i,
      /\b(visitor|delivery|cab|uber|ola|rapido)\b.*\b(entry|gate|approve|allow)\b/i,
      /\b(gate|entry)\b.*\b(visitor|delivery|cab|uber|ola|swiggy|zomato|blinkit)\b/i,
      /\b(domestic help|maid|cook|staff)\b.*\b(entry|access|gate|qr)\b/i,
      /\b(book|slot)\b.*\b(amenit|clubhouse|badminton|party hall|gym)\b/i,
      /\b(helpdesk|raise.*complaint|raise.*ticket)\b/i,
      /\b(intercom|call.*guard)\b/i,
    ],
    docType: "mygate",
    intent: "mygate_explicit",
  },
];

function regexRoute(query: string): RouteResult | null {
  for (const route of REGEX_ROUTES) {
    if (route.patterns.some((p) => p.test(query))) {
      return { docTypeFilter: route.docType, intent: route.intent, method: "regex" };
    }
  }
  return null;
}

// ── Tier 2: LLM classification ────────────────────────────────────────────

const CLASSIFICATION_SCHEMA = z.object({
  docType: z.enum(DOC_TYPES).describe(
    "The document type most relevant to this question. Use 'general' only if no specific type fits."
  ),
  reasoning: z.string().describe("One sentence explaining why this document type was chosen"),
});

const CLASSIFICATION_PROMPT = `You are a query classifier for Sobha Indraprastha, a 356-unit apartment complex in Bangalore managed by SIAOA.

Classify the resident's question into exactly one document type:

- bylaws: Rules about pets, renovation, parking, renting, noise, gym/pool, visitors, domestic help, quorum, voting, office bearers, garden/terrace usage, permissions, conduct rules
- penalties: Fine amounts, violation charges, penalty schedules
- minutes: Board meeting decisions, AGM/EGM/SGM proceedings, what was decided when, committee resolutions
- deed: Property details from the Deed of Declaration — undivided share, carpet area, super built-up area, common area definitions, sinking fund, builder obligations, schedules
- act: Karnataka Apartment Ownership Act 1972 — state law, legal provisions, section references, owner rights under law
- financial: Maintenance charges, income/expenditure, budget, corpus fund, receipts, association finances
- certificate: BBMP occupancy certificate, completion certificate, building approvals
- notice: Official notices, circulars, announcements from SIAOA
- mygate: How to use the MyGate app — pre-approving visitors, delivery entry (Swiggy/Zomato/Uber/Ola), managing domestic help, booking amenities, raising complaints, paying maintenance, gate access, intercom, QR codes, visitor logs
- general: Greetings, off-topic, or genuinely ambiguous questions that don't fit any category`;

async function llmRoute(query: string): Promise<RouteResult> {
  try {
    const { output } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      output: Output.object({ schema: CLASSIFICATION_SCHEMA }),
      prompt: `${CLASSIFICATION_PROMPT}\n\nQuestion: "${query}"`,
      temperature: 0,
    });

    const docType = output?.docType ?? "general";

    return {
      docTypeFilter: docType === "general" ? null : docType,
      intent: `llm_${docType}`,
      method: "llm",
    };
  } catch (err) {
    console.warn("LLM routing failed, falling back to general:", (err as Error).message);
    return { docTypeFilter: null, intent: "llm_fallback", method: "llm" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Route a query using two-tier classification:
 * 1. Regex for high-confidence obvious patterns (free, instant)
 * 2. LLM for everything else (~300ms, handles ambiguity)
 */
export async function routeQuery(query: string): Promise<RouteResult> {
  // Tier 1: try regex first
  const regexResult = regexRoute(query);
  if (regexResult) return regexResult;

  // Tier 2: LLM classification
  return llmRoute(query);
}

/**
 * Sync regex-only routing (for eval or when LLM is unavailable).
 */
export function routeQuerySync(query: string): RouteResult {
  const regexResult = regexRoute(query);
  return regexResult ?? { docTypeFilter: null, intent: "general", method: "regex" };
}

/**
 * Condense multi-turn conversation into a standalone search query.
 */
const CONTINUATION_PATTERNS = /^(tell me more|go on|more|elaborate|explain|details|what else|and\??|continue|keep going|yes|yeah|okay tell me|haan|aur batao)$/i;

export function condenseForRetrieval(
  messages: { role: string; content: string }[]
): string {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length <= 1) {
    return userMessages[userMessages.length - 1]?.content || "";
  }

  const lastQuestion = userMessages[userMessages.length - 1].content;

  // For continuation phrases, use the previous user question as the search query
  // with "more details" appended so retrieval pulls deeper/adjacent chunks
  if (CONTINUATION_PATTERNS.test(lastQuestion.trim())) {
    const prevQuestion = userMessages[userMessages.length - 2]?.content;
    if (prevQuestion) {
      return `${prevQuestion} — more details, additional rules, exceptions, related information`;
    }
  }

  // Only pull in prior context when the question actually refers to it.
  // Otherwise short standalone questions ("penalties", "how many floors")
  // get their embedding poisoned by the previous topic.
  const hasPronouns = /\b(it|this|that|they|them|those|the same|above|previous|there|these|his|her|their)\b/i.test(lastQuestion);
  if (!hasPronouns) {
    return lastQuestion;
  }

  const recent = messages.slice(-6);
  const context = recent
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  return `${context}\n\nStandalone question: ${lastQuestion}`;
}
