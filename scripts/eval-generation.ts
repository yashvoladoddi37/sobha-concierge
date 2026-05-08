/**
 * Generation-Quality Evaluation for Sobha Concierge
 *
 * The existing scripts/eval.ts measures **retrieval** quality (doc_type match,
 * keyword hit rate, routing accuracy). This script measures **generation**
 * quality — specifically how well each candidate model follows the strict
 * prompt rules in src/lib/rag/prompt.ts:
 *
 *   1. Citation format: every factual claim has [Source: ... | "exact quote"]
 *   2. Quote accuracy:  the quoted text actually appears in retrieved chunks
 *   3. Language rules:  English by default; Hindi script if asked in Hindi;
 *                       Kannada script if asked in Kannada; Hinglish → English
 *   4. "Latest" rule:   for "last/latest/most recent" queries, the answer
 *                       references the most recent date in the retrieved set
 *   5. Refusal:         off-topic gets the SIAOA fallback with NO citations
 *
 * The script loops every (candidate model × test case), generates a full
 * answer using the same SYSTEM_PROMPT and retrieved context that production
 * uses, and prints a model-by-model scorecard so you can decide which
 * models earn a slot in the production MODELS chain in src/app/api/chat/route.ts.
 *
 * Required env (in .env.local):
 *   GOOGLE_GENERATIVE_AI_API_KEY    Gemini models + embeddings + routing
 *   GROQ_API_KEY                    Groq models
 *   NEXT_PUBLIC_SUPABASE_URL        retrieval
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   COHERE_API_KEY                  reranker (optional but recommended)
 *
 * Optional env:
 *   SARVAM_API_KEY                  enables Sarvam-M (free tier, Indic-tuned)
 *   SARVAM_INCLUDE_PAID=true        also evaluates paid Sarvam-30B / 105B
 *   EVAL_GEN_SLEEP_MS=4000          delay between LLM calls (rate-limit guard)
 *   EVAL_GEN_MODELS=gemini-2.5-flash-lite,groq/llama-3.3-70b-versatile,...
 *                                   restrict the run to a subset of model ids
 *
 * Usage:
 *   npx tsx scripts/eval-generation.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { generateText, type LanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { retrieve } from "../src/lib/rag/retriever";
import { routeQuery } from "../src/lib/rag/query-router";
import { SYSTEM_PROMPT, buildPromptWithContext } from "../src/lib/rag/prompt";
import type { SearchResult } from "../src/lib/db/supabase";

// ---------------------------------------------------------------------------
// Candidate models
// ---------------------------------------------------------------------------

interface Candidate {
  id: string;
  model: LanguageModel;
  notes?: string;
}

function buildCandidates(): Candidate[] {
  const out: Candidate[] = [];

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    out.push({
      id: "google/gemini-2.5-flash-lite",
      model: google("gemini-2.5-flash-lite"),
      notes: "current primary",
    });
    out.push({
      id: "google/gemini-2.5-flash",
      model: google("gemini-2.5-flash"),
      notes: "more headroom, same family",
    });
  } else {
    console.warn("GOOGLE_GENERATIVE_AI_API_KEY not set — skipping Gemini models");
  }

  if (process.env.GROQ_API_KEY) {
    out.push({
      id: "groq/llama-3.3-70b-versatile",
      model: groq("llama-3.3-70b-versatile"),
      notes: "current fallback",
    });
    out.push({
      id: "groq/llama-3.1-8b-instant",
      model: groq("llama-3.1-8b-instant"),
      notes: "smallest Groq model — likely degrades",
    });
    out.push({
      id: "groq/openai/gpt-oss-20b",
      model: groq("openai/gpt-oss-20b"),
      notes: "OpenAI OSS, smaller",
    });
    out.push({
      id: "groq/openai/gpt-oss-120b",
      model: groq("openai/gpt-oss-120b"),
      notes: "OpenAI OSS, larger",
    });
  } else {
    console.warn("GROQ_API_KEY not set — skipping Groq models");
  }

  if (process.env.SARVAM_API_KEY) {
    const sarvam = createOpenAICompatible({
      baseURL: "https://api.sarvam.ai/v1",
      name: "sarvam",
      apiKey: process.env.SARVAM_API_KEY,
    });
    out.push({
      id: "sarvam/sarvam-m",
      model: sarvam.chatModel("sarvam-m"),
      notes: "free legacy 24B, Indic-tuned",
    });
    if (process.env.SARVAM_INCLUDE_PAID === "true") {
      out.push({
        id: "sarvam/sarvam-30b",
        model: sarvam.chatModel("sarvam-30b"),
        notes: "paid; opt-in via SARVAM_INCLUDE_PAID=true",
      });
      out.push({
        id: "sarvam/sarvam-105b",
        model: sarvam.chatModel("sarvam-105b"),
        notes: "paid flagship; opt-in",
      });
    }
  } else {
    console.warn("SARVAM_API_KEY not set — skipping Sarvam models");
  }

  // Allow EVAL_GEN_MODELS=foo,bar to restrict the run to a subset
  const restrict = process.env.EVAL_GEN_MODELS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (restrict && restrict.length > 0) {
    return out.filter((c) => restrict.includes(c.id));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

type Lang = "english" | "hindi" | "kannada";

interface GenCase {
  id: string;
  category: "citation" | "language" | "latest" | "refusal";
  question: string;
  expectedLang: Lang;
  expectsCitations: boolean;
  /** if true, scoring will check that the answer references the most recent date among retrieved chunks */
  expectsLatest?: boolean;
  /** if true, scoring will check the answer is the SIAOA fallback with no citations */
  expectsRefusal?: boolean;
}

const CASES: GenCase[] = [
  // ── Citation correctness (English, factual queries) ─────────────────────
  {
    id: "cite-pet",
    category: "citation",
    question: "Can I keep a pet dog in my apartment?",
    expectedLang: "english",
    expectsCitations: true,
  },
  {
    id: "cite-parking-fine",
    category: "citation",
    question: "What is the fine for unauthorized parking in a no-parking zone?",
    expectedLang: "english",
    expectsCitations: true,
  },
  {
    id: "cite-mygate-delivery",
    category: "citation",
    question: "How do I pre-approve a Swiggy or Zomato delivery using MyGate?",
    expectedLang: "english",
    expectsCitations: true,
  },
  {
    id: "cite-maintenance",
    category: "citation",
    question: "How much is the maintenance charge per square foot?",
    expectedLang: "english",
    expectsCitations: true,
  },

  // ── "Latest" date handling ──────────────────────────────────────────────
  {
    id: "latest-egm",
    category: "latest",
    question: "What was decided in the latest EGM?",
    expectedLang: "english",
    expectsCitations: true,
    expectsLatest: true,
  },

  // ── Language switching ──────────────────────────────────────────────────
  {
    id: "lang-hindi",
    category: "language",
    question: "क्या मैं अपने अपार्टमेंट में कुत्ता पाल सकता हूँ?",
    expectedLang: "hindi",
    expectsCitations: true,
  },
  {
    id: "lang-kannada",
    category: "language",
    question: "ನಾನು ನನ್ನ ಫ್ಲ್ಯಾಟ್ ಅನ್ನು ಬಾಡಿಗೆಗೆ ಕೊಡಬಹುದೇ?",
    expectedLang: "kannada",
    expectsCitations: true,
  },
  {
    id: "lang-hinglish-default-english",
    category: "language",
    question: "bhai, parking ka penalty kitna hai?",
    // Per src/lib/rag/prompt.ts: "Mixed languages (Hinglish, Kanglish) → respond in English"
    expectedLang: "english",
    expectsCitations: true,
  },

  // ── Refusal correctness ─────────────────────────────────────────────────
  {
    id: "refusal-offtopic",
    category: "refusal",
    question: "What's a good restaurant in Bangalore for dinner tonight?",
    expectedLang: "english",
    expectsCitations: false,
    expectsRefusal: true,
  },
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function scriptShare(text: string, range: RegExp): number {
  const meaningful = [...text].filter((c) => /\S/.test(c));
  if (meaningful.length === 0) return 0;
  const matched = meaningful.filter((c) => range.test(c)).length;
  return matched / meaningful.length;
}

function checkLanguage(text: string, expected: Lang): boolean {
  // Use the first 600 chars to avoid the citation block (which is always English)
  // dragging the script-share score around.
  const head = text.slice(0, 600);
  const latin = scriptShare(head, /[A-Za-z]/);
  const devanagari = scriptShare(head, /[\u0900-\u097F]/);
  const kannada = scriptShare(head, /[\u0C80-\u0CFF]/);

  switch (expected) {
    case "english":
      return latin >= 0.4 && devanagari < 0.1 && kannada < 0.1;
    case "hindi":
      return devanagari >= 0.25;
    case "kannada":
      return kannada >= 0.25;
  }
}

interface Citation {
  full: string;
  quote: string | null;
}

function findCitations(text: string): Citation[] {
  const citationRe = /\[Source:[^\]]*?\]/g;
  const quoteRe = /"([^"]+)"/;
  const out: Citation[] = [];
  for (const m of text.matchAll(citationRe)) {
    const q = m[0].match(quoteRe);
    out.push({ full: m[0], quote: q ? q[1] : null });
  }
  return out;
}

function normWS(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function quoteAppearsInChunks(quote: string, chunks: SearchResult[]): boolean {
  const q = normWS(quote);
  if (q.length < 4) return false;
  return chunks.some((c) => normWS(c.content).includes(q));
}

function isRefusal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("siaoa") ||
    lower.includes("management office") ||
    lower.includes("77957") ||
    lower.includes("don't have that in the apartment documents") ||
    lower.includes("don't have that") ||
    lower.includes("i don't have")
  );
}

/**
 * Find dates from retrieved chunks (doc_date metadata + dates in content)
 * and return the most recent one's ISO string + raw form.
 */
function findLatestDate(chunks: SearchResult[]): { iso: string; year: string; month?: string } | null {
  const months = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December";
  const dateRe = new RegExp(`\\b(\\d{1,2})[\\s\\/-](${months})[\\s\\/-]?(\\d{4})\\b`, "gi");
  type D = { iso: string; raw: string };
  const dates: D[] = [];

  for (const ch of chunks) {
    if (ch.doc_date) {
      dates.push({ iso: ch.doc_date, raw: ch.doc_date });
    }
    for (const m of ch.content.matchAll(dateRe)) {
      const tryIso = new Date(`${m[1]} ${m[2]} ${m[3]}`).toISOString().slice(0, 10);
      dates.push({ iso: tryIso, raw: m[0] });
    }
  }

  if (dates.length === 0) return null;

  const sorted = dates
    .map((d) => ({ ...d, t: Date.parse(d.iso) || 0 }))
    .sort((a, b) => b.t - a.t);
  const latest = sorted[0];
  if (!latest.iso || latest.iso === "Invalid Date") return null;
  return {
    iso: latest.iso,
    year: latest.iso.slice(0, 4),
    month: latest.iso.slice(0, 7),
  };
}

// ---------------------------------------------------------------------------
// Score one (model, case) pair
// ---------------------------------------------------------------------------

interface CaseScore {
  caseId: string;
  category: GenCase["category"];
  text: string;
  errored: boolean;
  errorMsg?: string;

  // Per-axis scores (null = not applicable for this case)
  citation_present: boolean | null;
  citation_format: number; // share of citations that include a quote
  quote_accuracy: number; // share of quoted citations whose quote appears in chunks
  language_match: boolean;
  latest_correct: boolean | null;
  refusal_correct: boolean | null;
}

async function scoreCase(
  c: GenCase,
  cand: Candidate,
  retrieved: SearchResult[]
): Promise<CaseScore> {
  const augmented = buildPromptWithContext(c.question, retrieved);

  let text = "";
  try {
    const res = await generateText({
      model: cand.model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: augmented }],
      temperature: 0.2,
    });
    text = res.text ?? "";
  } catch (err) {
    return {
      caseId: c.id,
      category: c.category,
      text: "",
      errored: true,
      errorMsg: (err as Error).message,
      citation_present: null,
      citation_format: 0,
      quote_accuracy: 0,
      language_match: false,
      latest_correct: c.expectsLatest ? false : null,
      refusal_correct: c.expectsRefusal ? false : null,
    };
  }

  const citations = findCitations(text);
  const withQuote = citations.filter((x) => x.quote);
  const accurate = withQuote.filter((x) => quoteAppearsInChunks(x.quote!, retrieved));

  const citation_format = citations.length > 0 ? withQuote.length / citations.length : 0;
  const quote_accuracy = withQuote.length > 0 ? accurate.length / withQuote.length : 0;

  let citation_present: boolean | null;
  if (c.expectsCitations) citation_present = citations.length >= 1;
  else if (c.expectsRefusal) citation_present = citations.length === 0; // refusal: NO citations
  else citation_present = null;

  const language_match = checkLanguage(text, c.expectedLang);

  let latest_correct: boolean | null = null;
  if (c.expectsLatest) {
    const latest = findLatestDate(retrieved);
    if (!latest) {
      latest_correct = null;
    } else {
      latest_correct =
        text.includes(latest.iso) ||
        (!!latest.month && text.includes(latest.month)) ||
        text.includes(latest.year);
    }
  }

  let refusal_correct: boolean | null = null;
  if (c.expectsRefusal) {
    refusal_correct = isRefusal(text) && citations.length === 0;
  }

  return {
    caseId: c.id,
    category: c.category,
    text,
    errored: false,
    citation_present,
    citation_format,
    quote_accuracy,
    language_match,
    latest_correct,
    refusal_correct,
  };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}
function padR(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : " ".repeat(len - s.length) + s;
}
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const candidates = buildCandidates();
  if (candidates.length === 0) {
    console.error("No candidate models available. Set provider env vars and retry.");
    process.exit(1);
  }

  const sleepMs = Number(process.env.EVAL_GEN_SLEEP_MS ?? 4000);

  console.log("=".repeat(72));
  console.log("  Sobha Concierge — Generation-Quality Eval");
  console.log("=".repeat(72));
  console.log(`  Cases:  ${CASES.length}`);
  console.log(`  Models: ${candidates.length}`);
  candidates.forEach((c) => console.log(`    - ${c.id}${c.notes ? `  (${c.notes})` : ""}`));
  console.log(`  Sleep:  ${sleepMs}ms between LLM calls`);
  console.log();

  // ── Phase 1: retrieve once per case (saves Cohere quota) ────────────────
  console.log("Phase 1: retrieving chunks (once per case)…");
  const retrievals = new Map<string, SearchResult[]>();
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    process.stdout.write(`  [${i + 1}/${CASES.length}] ${c.id} … `);
    try {
      const route = await routeQuery(c.question);
      const chunks = await retrieve(c.question, {
        topK: 20,
        rerankTopK: 5,
        docTypeFilter: route.docTypeFilter ?? undefined,
      });
      retrievals.set(c.id, chunks);
      console.log(`${chunks.length} chunks (route=${route.docTypeFilter ?? "general"})`);
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
      retrievals.set(c.id, []);
    }
    if (i < CASES.length - 1) await sleep(sleepMs);
  }
  console.log();

  // ── Phase 2: generate + score each (model × case) ───────────────────────
  console.log("Phase 2: generating answers and scoring…");
  const results = new Map<string, CaseScore[]>(); // key = candidate.id
  for (const cand of candidates) {
    console.log(`\n=== ${cand.id} ===`);
    const scores: CaseScore[] = [];
    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i];
      const chunks = retrievals.get(c.id) ?? [];
      process.stdout.write(`  [${i + 1}/${CASES.length}] ${pad(c.id, 32)} … `);
      const s = await scoreCase(c, cand, chunks);
      scores.push(s);

      if (s.errored) {
        console.log(`ERROR: ${s.errorMsg?.slice(0, 80)}`);
      } else {
        const bits: string[] = [];
        bits.push(`lang=${s.language_match ? "PASS" : "FAIL"}`);
        if (c.expectsCitations) {
          bits.push(`cite=${s.citation_present ? "PASS" : "FAIL"}`);
          bits.push(`fmt=${pct(s.citation_format)}`);
          bits.push(`quote=${pct(s.quote_accuracy)}`);
        }
        if (c.expectsLatest) bits.push(`latest=${s.latest_correct ? "PASS" : "FAIL"}`);
        if (c.expectsRefusal) bits.push(`refusal=${s.refusal_correct ? "PASS" : "FAIL"}`);
        console.log(bits.join("  "));
      }
      if (i < CASES.length - 1) await sleep(sleepMs);
    }
    results.set(cand.id, scores);
    // Inter-model gap (kinder to per-provider rate limits)
    if (cand !== candidates[candidates.length - 1]) await sleep(sleepMs);
  }

  // ── Phase 3: scorecard ──────────────────────────────────────────────────
  console.log("\n" + "=".repeat(96));
  console.log("  GENERATION-QUALITY SCORECARD");
  console.log("=".repeat(96));
  console.log();

  const colId = 36;
  const colN = 7;
  const header = [
    pad("Model", colId),
    padR("lang%", colN),
    padR("cite%", colN),
    padR("fmt%", colN),
    padR("quote%", colN),
    padR("latest", colN),
    padR("refuse", colN),
    padR("err%", colN),
    padR("verdict", 14),
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const cand of candidates) {
    const scores = results.get(cand.id)!;
    const completed = scores.filter((s) => !s.errored);
    const errCount = scores.length - completed.length;

    // Aggregate per-axis (only over applicable cases)
    const langCases = completed; // all cases evaluate language
    const citCases = completed.filter((s) => CASES.find((c) => c.id === s.caseId)!.expectsCitations);
    const refCases = completed.filter((s) => CASES.find((c) => c.id === s.caseId)!.expectsRefusal);
    const latCases = completed.filter((s) => CASES.find((c) => c.id === s.caseId)!.expectsLatest);

    const langPct = langCases.length ? langCases.filter((s) => s.language_match).length / langCases.length : 0;
    const citPct = citCases.length ? citCases.filter((s) => s.citation_present === true).length / citCases.length : 0;
    const fmtAvg = citCases.length ? citCases.reduce((a, s) => a + s.citation_format, 0) / citCases.length : 0;
    const quoteAvg = citCases.length ? citCases.reduce((a, s) => a + s.quote_accuracy, 0) / citCases.length : 0;
    const latPct = latCases.length ? latCases.filter((s) => s.latest_correct === true).length / latCases.length : 0;
    const refPct = refCases.length ? refCases.filter((s) => s.refusal_correct === true).length / refCases.length : 0;
    const errPct = scores.length ? errCount / scores.length : 0;

    // Verdict heuristic
    let verdict: string;
    if (errPct >= 0.3) verdict = "BROKEN";
    else if (langPct >= 0.85 && citPct >= 0.85 && fmtAvg >= 0.85 && quoteAvg >= 0.7) verdict = "PRIMARY";
    else if (langPct >= 0.7 && citPct >= 0.7 && fmtAvg >= 0.7) verdict = "FALLBACK";
    else verdict = "AVOID";

    console.log(
      [
        pad(cand.id, colId),
        padR(pct(langPct), colN),
        padR(pct(citPct), colN),
        padR(pct(fmtAvg), colN),
        padR(pct(quoteAvg), colN),
        padR(latCases.length ? pct(latPct) : "-", colN),
        padR(refCases.length ? pct(refPct) : "-", colN),
        padR(pct(errPct), colN),
        padR(verdict, 14),
      ].join("  ")
    );
  }

  console.log();
  console.log("Legend:");
  console.log("  lang%   share of cases where the answer is in the expected script");
  console.log("  cite%   share of citation cases where ≥1 citation was emitted (or refusal cases with NO citations)");
  console.log("  fmt%    share of citations that include a quoted span ('...')");
  console.log("  quote%  share of those quotes that actually appear in the retrieved chunks");
  console.log("  latest  for 'last/latest/most recent' cases — answer references the latest date in context");
  console.log("  refuse  for off-topic cases — answer is the SIAOA fallback with no citations");
  console.log("  err%    share of cases where the model call threw an error");
  console.log();
  console.log("Verdicts:");
  console.log("  PRIMARY    safe to put first or second in the MODELS chain");
  console.log("  FALLBACK   ok further down the chain when primaries are rate-limited");
  console.log("  AVOID      consistently fails one or more axes — would degrade UX");
  console.log("  BROKEN     >=30% of calls errored (config issue, not model fitness)");
  console.log();
  console.log("=".repeat(96));

  // ── Phase 4: per-case sample answers (truncated) for spot-checking ──────
  console.log("\nSample outputs (first model only, for spot-checking):");
  const first = candidates[0];
  for (const s of results.get(first.id) ?? []) {
    console.log("\n--- " + s.caseId + " ---");
    if (s.errored) {
      console.log("  ERROR: " + s.errorMsg);
    } else {
      console.log("  " + s.text.slice(0, 400).replace(/\n/g, "\n  "));
      if (s.text.length > 400) console.log("  …");
    }
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal error in eval-generation:", err);
  process.exit(1);
});
