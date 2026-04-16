/**
 * Document Ingestion Pipeline for Sobha Concierge
 *
 * Flow:
 * 1. Read pre-OCR'd markdown files from data/processed/
 * 2. Chunk by section/clause structure
 * 3. Embed with Google gemini-embedding-001 (768 dims)
 * 4. Store in Supabase pgvector
 *
 * Usage: npx tsx scripts/ingest.ts
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const RAW_DIR = join(process.cwd(), "data/raw/sobha-docs/sobha");
const PROCESSED_DIR = join(process.cwd(), "data/processed");

// Document registry: maps processed .md filenames to metadata
const DOCUMENT_REGISTRY: Record<string, { name: string; docType: string; date?: string }> = {
  "siaoa-apartment-bylaws.md": { name: "SIAOA Apartment Bylaws", docType: "bylaws" },
  "declaration-deed.md": { name: "Deed of Declaration", docType: "deed" },
  "karnataka-ownership-act.md": { name: "Karnataka Apartment Ownership Act 1972", docType: "act" },
  "penalties.md": { name: "SIAOA Penalties & Violations", docType: "penalties" },
  "siaoa-income-exp-stmt.md": { name: "SIAOA Income & Expenditure Statement", docType: "financial" },
  "bbmp-occupancy-certificate.md": { name: "BBMP Occupancy Certificate", docType: "certificate" },
  "completion-certificate.md": { name: "Sobha Completion Certificate", docType: "certificate" },
  "egm-12-apr-2026.md": { name: "EGM Minutes - 12 April 2026", docType: "minutes", date: "2026-04-12" },
  "MoM-8-jul-2025.md": { name: "Board Meeting Minutes - 8 July 2025", docType: "minutes", date: "2025-07-08" },
  "MoM-22-jul-2025.md": { name: "Board Meeting Minutes - 22 July 2025", docType: "minutes", date: "2025-07-22" },
  "MoM-25-aug-2025.md": { name: "Board Meeting Minutes - 25 August 2025", docType: "minutes", date: "2025-08-25" },
  "MoM-4-sep-2025.md": { name: "Board Meeting Minutes - 4 September 2025", docType: "minutes", date: "2025-09-04" },
  "MoM-8-sep-2025.md": { name: "Board Meeting Minutes - 8 September 2025", docType: "minutes", date: "2025-09-08" },
  "MoM-23-dec-2026.md": { name: "Board Meeting Minutes - 23 December 2025", docType: "minutes", date: "2025-12-23" },
  "MoM-10-jan-2026.md": { name: "Board Meeting Minutes - 10 January 2026", docType: "minutes", date: "2026-01-10" },
  "MoM-3-feb-2026.md": { name: "Board Meeting Minutes - 3 February 2026", docType: "minutes", date: "2026-02-03" },
  "MoM-3-mar-2026.md": { name: "Board Meeting Minutes - 3 March 2026", docType: "minutes", date: "2026-03-03" },
  "MoM-31-mar-2026.md": { name: "Board Meeting Minutes - 31 March 2026", docType: "minutes", date: "2026-03-31" },
};

// ----- Chunking -----

interface Chunk {
  content: string;
  chapter?: string;
  section?: string;
  pageNumber?: number;
  chunkIndex: number;
}

/**
 * Chunk text by semantic boundaries.
 *
 * Detects:
 * - CHAPTER headers (bylaws, act)
 * - Numbered clauses: "1.1)", "4.12)", "Section 3."
 * - Agenda items in MoMs
 * - Page boundaries as fallback
 *
 * Adds 200-char overlap between consecutive chunks.
 * Prepends document context to each chunk for better embeddings.
 * Filters garbled OCR (< 40% English words).
 */

const OVERLAP_CHARS = 200;
const MAX_CHUNK_CHARS = 3000; // ~750 tokens — allows full legal clauses without mid-sentence splits
const MIN_CHUNK_CHARS = 100;

function isReadable(text: string): boolean {
  const words = text.split(/\s+/).filter(w => w.length > 1);
  if (words.length < 5) return true; // too short to judge
  const english = words.filter(w => /^[a-zA-Z0-9.,;:'"()\-/]+$/.test(w));
  return english.length / words.length >= 0.35;
}

/** Strip garbled OCR lines (Kannada stamps, noise) from otherwise good chunks */
function cleanChunkText(text: string): string {
  return text
    .split("\n")
    .filter(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true; // keep blank lines
      if (trimmed.length < 4) return false; // drop tiny noise
      // Drop lines that are mostly non-ASCII (Kannada stamps, garbled OCR)
      const nonAscii = (trimmed.match(/[^\x00-\x7F]/g) || []).length;
      if (nonAscii / trimmed.length > 0.6) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // collapse multiple blank lines
    .trim();
}

function chunkBySection(text: string, docType: string): Chunk[] {
  const rawChunks: Chunk[] = [];
  let currentChapter = "";
  let currentSection = "";
  let currentContent = "";
  let chunkIndex = 0;
  let currentPage = 1;

  function flush() {
    const cleaned = cleanChunkText(currentContent);
    if (cleaned.length >= MIN_CHUNK_CHARS && isReadable(cleaned)) {
      rawChunks.push({
        content: cleaned,
        chapter: currentChapter || undefined,
        section: currentSection || undefined,
        pageNumber: currentPage,
        chunkIndex: chunkIndex++,
      });
    }
    currentContent = "";
  }

  // Pre-filter: strip OCR decoration lines (e.g. 100K+ lines of just dashes)
  const lines = text.split("\n").filter(line => {
    if (line.length > 500 && /^[\s\-=_.*#|+~]+$/.test(line)) return false;
    return true;
  });

  for (const line of lines) {
    // Track page markers
    const pageMatch = line.match(/---\s*PAGE\s*(\d+)\s*---/i);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1]);
      continue;
    }

    // Detect chapter headers: "CHAPTER-1", "CHAPTER - VII:", "CHAPTER-1"
    const chapterMatch = line.match(
      /^\s*(CHAPTER\s*[-–]\s*[\w]+[\s:]*.*)/i
    );
    if (chapterMatch) {
      flush();
      currentChapter = chapterMatch[1].trim();
      currentSection = "";
      currentContent = line + "\n";
      continue;
    }

    // Detect numbered clauses: "1)", "4.12)", "5.1)", standalone on line
    const clauseMatch = line.match(
      /^\s*(\d+(?:\.\d+)?)\)\s+([A-Z].*)/
    );
    if (clauseMatch && currentContent.length > 200) {
      flush();
      currentSection = `Clause ${clauseMatch[1]}: ${clauseMatch[2].substring(0, 80)}`;
      currentContent = line + "\n";
      continue;
    }

    // Detect "Section X." pattern (for Karnataka Act)
    const sectionMatch = line.match(
      /^\s*(\d+)\.\s+((?:[A-Z][a-z]+\s*)+[-–])/
    );
    if (sectionMatch && docType === "act" && currentContent.length > 200) {
      flush();
      currentSection = `Section ${sectionMatch[1]}`;
      currentContent = line + "\n";
      continue;
    }

    // Detect numbered agenda items in MoMs: "1.", "2.", at line start
    const agendaMatch = line.match(/^\s*(\d+)\.\s+(.{10,})/);
    if (agendaMatch && docType === "minutes" && currentContent.length > 100) {
      flush();
      currentSection = `Agenda ${agendaMatch[1]}: ${agendaMatch[2].substring(0, 60)}`;
      currentContent = line + "\n";
      continue;
    }

    currentContent += line + "\n";

    // Hard split at MAX_CHUNK_CHARS
    if (currentContent.length > MAX_CHUNK_CHARS) {
      flush();
    }
  }
  flush();

  // Add overlap: prepend tail of previous chunk to each subsequent chunk
  const withOverlap: Chunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    let content = rawChunks[i].content;
    if (i > 0) {
      const prevContent = rawChunks[i - 1].content;
      const overlap = prevContent.slice(-OVERLAP_CHARS);
      content = "..." + overlap + "\n\n" + content;
    }
    withOverlap.push({ ...rawChunks[i], content });
  }

  return withOverlap;
}

// ----- Embedding with retry -----

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatch(texts: string[], retries = 3): Promise<number[][]> {
  const requests = texts.map((text) => ({
    model: "models/gemini-embedding-001",
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_DOCUMENT",
    outputDimensionality: 768,
  }));

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.embeddings.map((e: { values: number[] }) => e.values);
    }

    const err = await response.text();
    if (response.status === 429 && attempt < retries - 1) {
      const waitSec = (attempt + 1) * 15; // 15s, 30s, 45s
      console.log(`  ⏳ Rate limited. Waiting ${waitSec}s before retry ${attempt + 2}/${retries}...`);
      await sleep(waitSec * 1000);
      continue;
    }
    throw new Error(`Embedding error: ${response.status} — ${err}`);
  }
  throw new Error("Exhausted retries");
}

// ----- Main Pipeline -----

async function processDocument(mdFileName: string) {
  const meta = DOCUMENT_REGISTRY[mdFileName];
  if (!meta) return;

  const mdPath = join(PROCESSED_DIR, mdFileName);
  if (!existsSync(mdPath)) {
    console.log(`  ⚠️  Skipping ${mdFileName} — no processed .md file`);
    return;
  }

  console.log(`\n📄 Processing: ${meta.name}`);
  const fullText = readFileSync(mdPath, "utf-8");
  const pageCount = (fullText.match(/---\s*PAGE/gi) || []).length || 1;

  // Chunk
  console.log("  ✂️  Chunking...");
  const chunks = chunkBySection(fullText, meta.docType);
  console.log(`  📦 ${chunks.length} chunks`);

  // Register document source
  const { data: source, error: sourceError } = await supabase
    .from("document_sources")
    .insert({
      name: meta.name,
      file_name: mdFileName.replace(/\.md$/, ".pdf"),
      doc_type: meta.docType,
      total_pages: pageCount,
      date_of_document: meta.date ?? null,
    })
    .select("id")
    .single();

  if (sourceError) {
    throw new Error(`Failed to register source: ${sourceError.message}`);
  }

  // Embed and store in small batches (Gemini free tier = 15 RPM for embed)
  const BATCH_SIZE = 10;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
    console.log(`  🧮 Embedding batch ${batchNum}/${totalBatches}...`);

    // Embed with context prefix for better retrieval accuracy
    const textsToEmbed = batch.map((chunk) => {
      const parts = [`[Document: ${meta.name}`];
      if (chunk.chapter) parts.push(`${chunk.chapter}`);
      if (chunk.section) parts.push(`${chunk.section}`);
      const prefix = parts.join(" | ") + "] ";
      return prefix + chunk.content;
    });
    const embeddings = await embedBatch(textsToEmbed);

    const rows = batch.map((chunk, j) => {
      // Build context prefix for better retrieval
      const parts = [`[Document: ${meta.name}`];
      if (meta.docType) parts.push(`Type: ${meta.docType}`);
      if (chunk.chapter) parts.push(`${chunk.chapter}`);
      if (chunk.section) parts.push(`${chunk.section}`);
      if (chunk.pageNumber) parts.push(`Page ${chunk.pageNumber}`);
      const prefix = parts.join(" | ") + "]\n\n";

      return {
        source_id: source.id,
        content: prefix + chunk.content,
        embedding: JSON.stringify(embeddings[j]),
        chapter: chunk.chapter ?? null,
        section: chunk.section ?? null,
        page_number: chunk.pageNumber ?? null,
        chunk_index: chunk.chunkIndex,
        doc_type: meta.docType,
        doc_name: meta.name,
        doc_date: meta.date ?? null,
      };
    });

    const { error: insertError } = await supabase
      .from("document_chunks")
      .insert(rows);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    // Rate limit pause between batches
    if (i + BATCH_SIZE < chunks.length) {
      await sleep(4000);
    }
  }

  console.log(`  ✅ Done: ${chunks.length} chunks stored`);
}

/**
 * Incremental ingestion: only process docs that are new or need re-ingestion.
 * Pass specific filenames as CLI args to re-ingest only those:
 *   npx tsx scripts/ingest.ts siaoa-apartment-bylaws.md penalties.md
 *
 * With no args, ingests all docs not yet in Supabase.
 * With --full, wipes everything and re-ingests all.
 */
async function main() {
  console.log("🚀 Sobha Concierge — Document Ingestion\n");
  console.log("========================================\n");

  const args = process.argv.slice(2);
  const fullMode = args.includes("--full");
  const specificFiles = args.filter(a => !a.startsWith("--"));

  // Get existing sources from Supabase
  const { data: existingSources } = await supabase
    .from("document_sources")
    .select("id, file_name, name");

  const existingFileNames = new Set(
    (existingSources || []).map((s) => s.file_name)
  );

  if (fullMode) {
    console.log("🧹 Full mode: clearing all existing data...");
    await supabase.from("document_chunks").delete().neq("id", 0);
    await supabase.from("document_sources").delete().neq("id", 0);
    existingFileNames.clear();
    console.log("  Done.\n");
  }

  // Process text notices (only if not already present)
  const txtFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith(".txt"));
  for (const txtFile of txtFiles) {
    if (existingFileNames.has(txtFile) && !fullMode) {
      console.log(`📋 Notice already ingested: ${txtFile}`);
      continue;
    }
    const content = readFileSync(join(RAW_DIR, txtFile), "utf-8");
    const { data: source } = await supabase
      .from("document_sources")
      .insert({
        name: `Notice: ${txtFile.replace(".txt", "")}`,
        file_name: txtFile,
        doc_type: "notice",
        total_pages: 1,
      })
      .select("id")
      .single();

    if (source) {
      const embeddings = await embedBatch([content]);
      await supabase.from("document_chunks").insert({
        source_id: source.id,
        content,
        embedding: JSON.stringify(embeddings[0]),
        chunk_index: 0,
        doc_type: "notice",
        doc_name: `Notice: ${txtFile.replace(".txt", "")}`,
      });
      console.log(`📋 Processed notice: ${txtFile}`);
    }
  }

  // Determine which .md files to process
  let mdFiles: string[];
  if (specificFiles.length > 0) {
    mdFiles = specificFiles;
    console.log(`\n📚 Re-ingesting ${mdFiles.length} specific documents\n`);
  } else {
    mdFiles = Object.keys(DOCUMENT_REGISTRY);
    console.log(`\n📚 ${mdFiles.length} documents in registry\n`);
  }

  for (const mdFile of mdFiles) {
    if (!DOCUMENT_REGISTRY[mdFile]) {
      console.log(`  ⚠️  ${mdFile} not in registry, skipping`);
      continue;
    }

    const pdfName = mdFile.replace(/\.md$/, ".pdf");

    // If re-ingesting a specific file, delete old data for it first
    if (specificFiles.length > 0 || fullMode) {
      const existing = (existingSources || []).find(
        (s) => s.file_name === pdfName
      );
      if (existing) {
        console.log(`  🗑️  Removing old data for ${existing.name}`);
        await supabase.from("document_chunks").delete().eq("source_id", existing.id);
        await supabase.from("document_sources").delete().eq("id", existing.id);
      }
    } else if (existingFileNames.has(pdfName)) {
      console.log(`  ✓ Already ingested: ${DOCUMENT_REGISTRY[mdFile].name}`);
      continue;
    }

    try {
      await processDocument(mdFile);
    } catch (err) {
      console.error(`❌ Error processing ${mdFile}:`, err);
    }
    await sleep(3000);
  }

  console.log("\n========================================");
  console.log("🎉 Ingestion complete!");

  const { count } = await supabase
    .from("document_chunks")
    .select("*", { count: "exact", head: true });
  console.log(`📊 Total chunks in database: ${count}`);
}

main().catch(console.error);
