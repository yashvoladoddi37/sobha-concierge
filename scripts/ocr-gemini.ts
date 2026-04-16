/**
 * High-quality OCR via Gemini 2.5 Flash Vision API.
 *
 * Pacing: 1 request per 7s → ~8.5 RPM (under 10 RPM limit)
 * Free tier: 250 RPD, 250K TPM
 * 144 total pages → ~17 minutes
 *
 * Saves progress per-page so it can resume if interrupted.
 * Usage: npx tsx scripts/ocr-gemini.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { config } from "dotenv";
config({ path: ".env.local" });

// Rotate between API keys to triple the rate limit
const API_KEYS = [
  process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
  process.env.GOOGLE_GENERATIVE_AI_API_KEY_2!,
  process.env.GOOGLE_GENERATIVE_AI_API_KEY_3!,
].filter(Boolean);
let keyIndex = 0;
function getApiKey(): string {
  const key = API_KEYS[keyIndex % API_KEYS.length];
  keyIndex++;
  return key;
}
const MODEL = "gemini-3-flash-preview";
const PROCESSED_DIR = join(process.cwd(), "data/processed");
const RAW_DIR = join(process.cwd(), "data/raw/sobha-docs/sobha");
const TMP_DIR = join(PROCESSED_DIR, "tmp-pages");
const PROGRESS_FILE = join(PROCESSED_DIR, ".ocr-progress.json");

// 3 keys rotating = 30 RPM total. 3s interval = ~20 RPM (safe margin)
const REQUEST_INTERVAL_MS = 3000;
// Max retries on 429/503
const MAX_RETRIES = 10;

// Documents to OCR — declaration-deed is the remaining big one
const DOCS_TO_OCR: { pdf: string; needsRotation: boolean }[] = [
  { pdf: "declaration-deed.pdf", needsRotation: false },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Progress {
  [docName: string]: {
    totalPages: number;
    completedPages: number[];
    pageTexts: { [page: number]: string };
  };
}

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return {};
}

function saveProgress(progress: Progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function ocrPage(imagePath: string, retryCount = 0): Promise<string> {
  const imgBase64 = readFileSync(imagePath).toString("base64");

  const prompt = `Extract ALL text from this scanned document page exactly as written.
Rules:
- Preserve numbered clauses (1.1, 4.12, etc), headings, and structure
- For tables, use plain text alignment
- Ignore stamps, seals, registration marks, and signatures
- If Kannada text appears alongside English, keep the English, skip the Kannada
- Output clean text only, no commentary or formatting markers`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${getApiKey()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/png", data: imgBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  );

  if (resp.status === 429 || resp.status === 503) {
    if (retryCount >= MAX_RETRIES) {
      throw new Error(`Failed after ${MAX_RETRIES} retries (last status: ${resp.status})`);
    }
    const errText = await resp.text();
    const retryMatch = errText.match(/retryDelay.*?(\d+)s/);
    const waitSec = retryMatch
      ? parseInt(retryMatch[1]) + 5
      : resp.status === 503
        ? (retryCount + 1) * 30 // longer backoff for 503
        : (retryCount + 1) * 20;
    const reason = resp.status === 429 ? "Rate limited" : "Model busy";
    console.log(`    ⏳ ${reason}. Waiting ${waitSec}s (retry ${retryCount + 1}/${MAX_RETRIES})...`);
    await sleep(waitSec * 1000);
    return ocrPage(imagePath, retryCount + 1);
  }

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err.substring(0, 200)}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function processDocument(pdfName: string, needsRotation: boolean, progress: Progress) {
  const pdfPath = join(RAW_DIR, pdfName);
  // Handle case-insensitive PDF extension
  const actualPath = existsSync(pdfPath)
    ? pdfPath
    : existsSync(pdfPath.replace(".pdf", ".PDF"))
      ? pdfPath.replace(".pdf", ".PDF")
      : pdfPath;

  const mdName = pdfName.toLowerCase().replace(/\.pdf$/, ".md");

  console.log(`\n📄 ${pdfName}`);

  // Clean tmp dir to avoid leftover pages from previous doc
  if (existsSync(TMP_DIR)) {
    for (const f of readdirSync(TMP_DIR)) {
      unlinkSync(join(TMP_DIR, f));
    }
  }

  // Convert PDF to images
  mkdirSync(TMP_DIR, { recursive: true });
  const prefix = join(TMP_DIR, "page");
  execSync(`pdftoppm -png -r 200 "${actualPath}" "${prefix}"`, { timeout: 120000 });

  const pageFiles = readdirSync(TMP_DIR)
    .filter((f: string) => f.startsWith("page-") && f.endsWith(".png"))
    .sort();

  const totalPages = pageFiles.length;
  console.log(`  ${totalPages} pages`);

  // Init progress for this doc
  if (!progress[pdfName]) {
    progress[pdfName] = { totalPages, completedPages: [], pageTexts: {} };
  }
  const docProgress = progress[pdfName];

  for (let i = 0; i < pageFiles.length; i++) {
    const pageNum = i + 1;

    // Skip already-completed pages (resume support)
    if (docProgress.completedPages.includes(pageNum)) {
      console.log(`  ✓ Page ${pageNum}/${totalPages} (cached)`);
      continue;
    }

    let imagePath = join(TMP_DIR, pageFiles[i]);

    // Rotate if needed (bylaws are landscape-scanned)
    if (needsRotation) {
      const rotatedPath = imagePath.replace(".png", "-rot.png");
      execSync(
        `python3 -c "from PIL import Image; img=Image.open('${imagePath}'); img.rotate(-90, expand=True).save('${rotatedPath}')"`,
        { timeout: 10000 }
      );
      imagePath = rotatedPath;
    }

    console.log(`  🔍 Page ${pageNum}/${totalPages}...`);
    const text = await ocrPage(imagePath);

    docProgress.pageTexts[pageNum] = text;
    docProgress.completedPages.push(pageNum);
    saveProgress(progress);

    // Clean up rotated image
    if (needsRotation) {
      unlinkSync(imagePath);
    }

    // Pace requests
    if (i < pageFiles.length - 1) {
      await sleep(REQUEST_INTERVAL_MS);
    }
  }

  // Clean up page images
  for (const f of pageFiles) {
    const p = join(TMP_DIR, f);
    if (existsSync(p)) unlinkSync(p);
  }

  // Write final markdown
  const output = Array.from({ length: totalPages }, (_, i) => {
    const text = docProgress.pageTexts[i + 1] || "";
    return `--- PAGE ${i + 1} ---\n${text}`;
  })
    .filter((section) => {
      // Drop pages with no useful content
      const textPart = section.replace(/--- PAGE \d+ ---\n/, "");
      return textPart.trim().length > 20;
    })
    .join("\n\n");

  writeFileSync(join(PROCESSED_DIR, mdName), output, "utf-8");
  console.log(`  ✅ Saved ${mdName} (${output.length} chars)`);
}

async function main() {
  console.log("🔬 Gemini 2.5 Flash OCR Pipeline");
  console.log(`   Model: ${MODEL}`);
  console.log(`   Pacing: ${REQUEST_INTERVAL_MS / 1000}s between requests (~${Math.round(60000 / REQUEST_INTERVAL_MS)} RPM)`);
  console.log(`   Documents: ${DOCS_TO_OCR.length}`);

  const totalPages = DOCS_TO_OCR.reduce((sum, d) => {
    const pdfPath = join(RAW_DIR, d.pdf);
    const actual = existsSync(pdfPath) ? pdfPath : pdfPath.replace(".pdf", ".PDF");
    try {
      const info = execSync(`pdfinfo "${actual}" 2>/dev/null | grep Pages`, { encoding: "utf-8" });
      return sum + parseInt(info.match(/\d+/)?.[0] ?? "0");
    } catch {
      return sum;
    }
  }, 0);

  const estMinutes = Math.ceil((totalPages * REQUEST_INTERVAL_MS) / 60000);
  console.log(`   Total pages: ${totalPages}`);
  console.log(`   Estimated time: ~${estMinutes} minutes\n`);

  const progress = loadProgress();

  for (const doc of DOCS_TO_OCR) {
    await processDocument(doc.pdf, doc.needsRotation, progress);
  }

  // Clean up progress file
  if (existsSync(PROGRESS_FILE)) unlinkSync(PROGRESS_FILE);

  console.log("\n🎉 All documents re-OCR'd with Gemini 2.5 Flash!");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  console.log("Progress saved. Re-run to resume from where it stopped.");
  process.exit(1);
});
