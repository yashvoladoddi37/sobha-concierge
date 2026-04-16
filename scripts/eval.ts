/**
 * RAG Evaluation Framework for Sobha Concierge
 *
 * Tests retrieval quality and query routing accuracy across all document types.
 * Runs 20 realistic resident questions and produces a scorecard.
 *
 * Usage: npx tsx scripts/eval.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { retrieve } from "../src/lib/rag/retriever";
import { routeQuery } from "../src/lib/rag/query-router";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvalCase {
  question: string;
  expectedDocType: string;
  expectedKeywords: string[];
  /** Which route the query-router should pick (doc_type string or null for general) */
  expectedRoute: string | null;
  category:
    | "bylaws"
    | "penalties"
    | "meetings"
    | "deed"
    | "legal"
    | "financial"
    | "certificate";
}

interface EvalResult {
  question: string;
  category: string;
  docTypeMatch: boolean;
  keywordHits: { keyword: string; found: boolean }[];
  keywordHitRate: number;
  routeMatch: boolean;
  actualRoute: string | null;
  retrievedDocTypes: string[];
  pass: boolean;
}

// ---------------------------------------------------------------------------
// Evaluation Dataset — 20 realistic resident questions
// ---------------------------------------------------------------------------

const EVAL_CASES: EvalCase[] = [
  // ── Bylaws (5 questions) ────────────────────────────────────────────────
  {
    question: "Can I keep a pet dog in my apartment?",
    expectedDocType: "bylaws",
    expectedKeywords: ["pet", "dog", "animal", "apartment"],
    expectedRoute: "bylaws",
    category: "bylaws",
  },
  {
    question: "What are the rules for using the swimming pool and gym?",
    expectedDocType: "bylaws",
    expectedKeywords: ["pool", "gym", "facility", "hours"],
    expectedRoute: "bylaws",
    category: "bylaws",
  },
  {
    question:
      "I want to renovate my kitchen. Do I need permission from the association?",
    expectedDocType: "bylaws",
    expectedKeywords: ["renovation", "permission", "alteration", "association"],
    expectedRoute: "bylaws",
    category: "bylaws",
  },
  {
    question: "Can I rent out my flat on Airbnb for short stays?",
    expectedDocType: "bylaws",
    expectedKeywords: ["rent", "tenant", "lease"],
    expectedRoute: "bylaws",
    category: "bylaws",
  },
  {
    question: "What is the process for registering my domestic help or maid?",
    expectedDocType: "bylaws",
    expectedKeywords: ["domestic", "help", "staff", "register"],
    expectedRoute: "bylaws",
    category: "bylaws",
  },

  // ── Penalties (3 questions) ─────────────────────────────────────────────
  {
    question: "What is the fine for not paying maintenance on time?",
    expectedDocType: "penalties",
    expectedKeywords: ["fine", "maintenance", "penalty"],
    expectedRoute: "penalties",
    category: "penalties",
  },
  {
    question: "How much is the penalty for unauthorized construction?",
    expectedDocType: "penalties",
    expectedKeywords: ["penalty", "unauthorized", "construction"],
    expectedRoute: "penalties",
    category: "penalties",
  },
  {
    question:
      "What are the violations that can lead to a fine by the association?",
    expectedDocType: "penalties",
    expectedKeywords: ["violation", "fine", "association"],
    expectedRoute: "penalties",
    category: "penalties",
  },

  // ── Meeting Minutes (3 questions) ───────────────────────────────────────
  {
    question:
      "What was discussed about the water supply issue in the board meetings?",
    expectedDocType: "minutes",
    expectedKeywords: ["water", "supply", "board"],
    expectedRoute: "minutes",
    category: "meetings",
  },
  {
    question:
      "Were there any decisions about CCTV cameras in the recent meetings?",
    expectedDocType: "minutes",
    expectedKeywords: ["CCTV", "camera", "decision"],
    expectedRoute: "minutes",
    category: "meetings",
  },
  {
    question: "What happened in the EGM held in April 2026?",
    expectedDocType: "minutes",
    expectedKeywords: ["EGM", "April", "2026"],
    expectedRoute: "minutes",
    category: "meetings",
  },

  // ── Deed of Declaration (3 questions) ───────────────────────────────────
  {
    question: "What is the undivided share of land for a 3BHK apartment?",
    expectedDocType: "deed",
    expectedKeywords: ["undivided", "share", "land", "apartment"],
    expectedRoute: "deed",
    category: "deed",
  },
  {
    question: "Which areas are classified as common areas in the complex?",
    expectedDocType: "deed",
    expectedKeywords: ["common", "area"],
    expectedRoute: "deed",
    category: "deed",
  },
  {
    question:
      "What does the deed of declaration say about the sinking fund?",
    expectedDocType: "deed",
    expectedKeywords: ["deed", "sinking", "fund"],
    expectedRoute: "deed",
    category: "deed",
  },

  // ── Legal / Karnataka Act (2 questions) ─────────────────────────────────
  {
    question:
      "What does the Karnataka Apartment Ownership Act say about the rights of apartment owners?",
    expectedDocType: "act",
    expectedKeywords: ["Karnataka", "Act", "owner", "rights"],
    expectedRoute: "act",
    category: "legal",
  },
  {
    question:
      "Under the state law, can the association impose restrictions on sale of my apartment?",
    expectedDocType: "act",
    expectedKeywords: ["association", "restriction", "sale"],
    expectedRoute: "act",
    category: "legal",
  },

  // ── Financial (2 questions) ─────────────────────────────────────────────
  {
    question:
      "What is the total income and expenditure of the association for this year?",
    expectedDocType: "financial",
    expectedKeywords: ["income", "expenditure"],
    expectedRoute: "financial",
    category: "financial",
  },
  {
    question: "How much did the association spend on maintenance charges?",
    expectedDocType: "financial",
    expectedKeywords: ["maintenance", "charge", "expense"],
    expectedRoute: "financial",
    category: "financial",
  },

  // ── Certificate (2 questions) ───────────────────────────────────────────
  {
    question:
      "Does Sobha Indraprastha have a valid BBMP occupancy certificate?",
    expectedDocType: "certificate",
    expectedKeywords: ["BBMP", "occupancy", "certificate"],
    expectedRoute: "certificate",
    category: "certificate",
  },
  {
    question:
      "When was the completion certificate issued for our building?",
    expectedDocType: "certificate",
    expectedKeywords: ["completion", "certificate", "building"],
    expectedRoute: "certificate",
    category: "certificate",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Case-insensitive check: does `keyword` appear anywhere in `text`?
 */
function textContainsKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

// ---------------------------------------------------------------------------
// Main evaluation loop
// ---------------------------------------------------------------------------

async function runEval(): Promise<void> {
  console.log("=".repeat(72));
  console.log("  Sobha Concierge — RAG Evaluation Framework");
  console.log("  20 questions across 7 categories");
  console.log("=".repeat(72));
  console.log();

  const results: EvalResult[] = [];
  const total = EVAL_CASES.length;

  for (let i = 0; i < total; i++) {
    const evalCase = EVAL_CASES[i];
    const num = `[${String(i + 1).padStart(2, "0")}/${total}]`;
    console.log(`${num} ${evalCase.question}`);

    // ── Step 1: Query routing (async — regex then LLM fallback) ────────
    const route = await routeQuery(evalCase.question);
    const routeMatch = route.docTypeFilter === evalCase.expectedRoute;

    // ── Step 2: Retrieval (top 5) ───────────────────────────────────────
    let docTypeMatch = false;
    let keywordHits: { keyword: string; found: boolean }[] = [];
    let retrievedDocTypes: string[] = [];

    try {
      const chunks = await retrieve(evalCase.question, { rerankTopK: 5 });

      retrievedDocTypes = chunks.map((c) => c.doc_type);
      docTypeMatch = chunks.some(
        (c) => c.doc_type === evalCase.expectedDocType
      );

      // Concatenate all retrieved content for keyword search
      const allContent = chunks.map((c) => c.content).join("\n");

      keywordHits = evalCase.expectedKeywords.map((kw) => ({
        keyword: kw,
        found: textContainsKeyword(allContent, kw),
      }));
    } catch (err) {
      console.log(`      ERROR retrieving: ${(err as Error).message}`);
      keywordHits = evalCase.expectedKeywords.map((kw) => ({
        keyword: kw,
        found: false,
      }));
    }

    const keywordHitRate =
      keywordHits.length > 0
        ? keywordHits.filter((k) => k.found).length / keywordHits.length
        : 0;

    const pass = docTypeMatch && keywordHitRate >= 0.6 && routeMatch;

    const result: EvalResult = {
      question: evalCase.question,
      category: evalCase.category,
      docTypeMatch,
      keywordHits,
      keywordHitRate,
      routeMatch,
      actualRoute: route.docTypeFilter,
      retrievedDocTypes,
      pass,
    };
    results.push(result);

    // Print inline result
    const docIcon = docTypeMatch ? "PASS" : "FAIL";
    const kwPercent = `${Math.round(keywordHitRate * 100)}%`;
    const routeIcon = routeMatch ? "PASS" : "FAIL";
    const overallIcon = pass ? "PASS" : "FAIL";

    console.log(
      `      doc_type: ${docIcon}  |  keywords: ${kwPercent}  |  routing: ${routeIcon}  |  overall: ${overallIcon}`
    );

    if (!docTypeMatch) {
      console.log(
        `      expected doc_type="${evalCase.expectedDocType}" but got [${[...new Set(retrievedDocTypes)].join(", ")}]`
      );
    }
    if (!routeMatch) {
      console.log(
        `      expected route="${evalCase.expectedRoute}" but got "${route.docTypeFilter}"`
      );
    }
    const missedKws = keywordHits
      .filter((k) => !k.found)
      .map((k) => k.keyword);
    if (missedKws.length > 0) {
      console.log(`      missed keywords: ${missedKws.join(", ")}`);
    }
    console.log();

    // Delay to respect Cohere free tier (10 RPM) and Gemini embedding limits
    if (i < total - 1) {
      await sleep(4000);
    }
  }

  // -----------------------------------------------------------------------
  // Scorecard
  // -----------------------------------------------------------------------

  console.log("=".repeat(72));
  console.log("  SCORECARD");
  console.log("=".repeat(72));
  console.log();

  // Per-question table
  const colQ = 60;
  const colS = 10;
  console.log(
    `${pad("Question", colQ)} ${pad("DocType", colS)} ${pad("Keywords", colS)} ${pad("Route", colS)} ${pad("Result", colS)}`
  );
  console.log("-".repeat(colQ + colS * 4 + 4));

  for (const r of results) {
    const q =
      r.question.length > colQ - 2
        ? r.question.slice(0, colQ - 5) + "..."
        : r.question;
    console.log(
      `${pad(q, colQ)} ${pad(r.docTypeMatch ? "PASS" : "FAIL", colS)} ${pad(Math.round(r.keywordHitRate * 100) + "%", colS)} ${pad(r.routeMatch ? "PASS" : "FAIL", colS)} ${pad(r.pass ? "PASS" : "FAIL", colS)}`
    );
  }

  console.log();

  // Summary metrics
  const totalCases = results.length;
  const retrievalPasses = results.filter((r) => r.docTypeMatch).length;
  const routingPasses = results.filter((r) => r.routeMatch).length;
  const allKeywordHits = results.flatMap((r) => r.keywordHits);
  const keywordHitCount = allKeywordHits.filter((k) => k.found).length;
  const overallPasses = results.filter((r) => r.pass).length;

  const retrievalAcc = ((retrievalPasses / totalCases) * 100).toFixed(1);
  const routingAcc = ((routingPasses / totalCases) * 100).toFixed(1);
  const kwHitRate = ((keywordHitCount / allKeywordHits.length) * 100).toFixed(1);
  const overallAcc = ((overallPasses / totalCases) * 100).toFixed(1);

  console.log("-".repeat(48));
  console.log(`  Retrieval accuracy (doc_type):  ${retrievalPasses}/${totalCases}  (${retrievalAcc}%)`);
  console.log(`  Routing accuracy:               ${routingPasses}/${totalCases}  (${routingAcc}%)`);
  console.log(`  Keyword hit rate:               ${keywordHitCount}/${allKeywordHits.length}  (${kwHitRate}%)`);
  console.log(`  Overall pass rate:              ${overallPasses}/${totalCases}  (${overallAcc}%)`);
  console.log("-".repeat(48));

  // Per-category breakdown
  console.log();
  console.log("  Per-category breakdown:");
  console.log();

  const categories = [...new Set(results.map((r) => r.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPasses = catResults.filter((r) => r.pass).length;
    const catRetrieval = catResults.filter((r) => r.docTypeMatch).length;
    const catRouting = catResults.filter((r) => r.routeMatch).length;
    const n = catResults.length;
    console.log(
      `  ${pad(cat, 14)}  overall: ${catPasses}/${n}  retrieval: ${catRetrieval}/${n}  routing: ${catRouting}/${n}`
    );
  }

  console.log();
  console.log("=".repeat(72));

  // Exit with non-zero if overall accuracy is below 70%
  if (overallPasses / totalCases < 0.7) {
    console.log(
      `\n  WARNING: Overall pass rate ${overallAcc}% is below the 70% threshold.\n`
    );
    process.exit(1);
  } else {
    console.log(`\n  All clear. Overall pass rate: ${overallAcc}%\n`);
  }
}

runEval().catch((err) => {
  console.error("Fatal error running evaluation:", err);
  process.exit(2);
});
