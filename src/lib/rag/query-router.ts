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
  "general",
] as const;

type DocType = (typeof DOC_TYPES)[number];

// ── Tier 1: Regex (high-confidence patterns only) ─────────────────────────

const REGEX_ROUTES: { patterns: RegExp[]; docType: string; intent: string }[] = [
  {
    patterns: [
      /\b(bylaw|bye.?law|clause \d)/i,
    ],
    docType: "bylaws",
    intent: "bylaws_explicit",
  },
  {
    patterns: [
      /\b(penalty|fine|penalt|violation)\b/i,
    ],
    docType: "penalties",
    intent: "penalties_explicit",
  },
  {
    patterns: [
      /\b(meeting|minutes|mom)\b.*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})\b/i,
      /\b(egm|agm|sgm)\b/i,
    ],
    docType: "minutes",
    intent: "minutes_explicit",
  },
  {
    patterns: [
      /\b(deed of declaration|undivided share|carpet area)\b/i,
    ],
    docType: "deed",
    intent: "deed_explicit",
  },
  {
    patterns: [
      /\bkarnataka.*act\b/i,
      /\bapartment ownership act\b/i,
    ],
    docType: "act",
    intent: "act_explicit",
  },
  {
    patterns: [
      /\b(occupancy certificate|completion certificate|bbmp)\b/i,
    ],
    docType: "certificate",
    intent: "certificate_explicit",
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
export function condenseForRetrieval(
  messages: { role: string; content: string }[]
): string {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length <= 1) {
    return userMessages[userMessages.length - 1]?.content || "";
  }

  const recent = messages.slice(-6);
  const lastQuestion = userMessages[userMessages.length - 1].content;

  const words = lastQuestion.split(/\s+/);
  const hasPronouns = /\b(it|this|that|they|them|those|the same|above|previous)\b/i.test(lastQuestion);
  if (words.length > 8 && !hasPronouns) {
    return lastQuestion;
  }

  const context = recent
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  return `${context}\n\nStandalone question: ${lastQuestion}`;
}
