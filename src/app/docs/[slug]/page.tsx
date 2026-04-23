import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { DOCS, getDocBySlug } from "@/lib/docs-registry";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

interface Section {
  id: string;
  title: string;
  level: "page" | "chapter" | "clause";
  lines: string[];
}

function parseDocument(raw: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { id: "top", title: "Document", level: "page", lines: [] };

  for (const line of raw.split("\n")) {
    const pageMatch = line.match(/^---\s*PAGE\s*(\d+)\s*---$/i);
    if (pageMatch) {
      if (current.lines.length > 0) sections.push(current);
      const pageNum = pageMatch[1];
      current = {
        id: `page-${pageNum}`,
        title: `Page ${pageNum}`,
        level: "page",
        lines: [],
      };
      continue;
    }

    const chapterMatch = line.match(/^\s*(CHAPTER\s*[-–]\s*[\w]+[\s:]*.*)/i);
    if (chapterMatch) {
      if (current.lines.length > 0) sections.push(current);
      const title = chapterMatch[1].trim();
      current = {
        id: slugify(title),
        title,
        level: "chapter",
        lines: [line],
      };
      continue;
    }

    const clauseMatch = line.match(/^\s*(\d+(?:\.\d+)?)\)\s+([A-Z].*)/);
    if (clauseMatch) {
      if (current.lines.length > 0) sections.push(current);
      const clauseNum = clauseMatch[1];
      const clauseTitle = clauseMatch[2].slice(0, 80);
      current = {
        id: `clause-${clauseNum}`,
        title: `Clause ${clauseNum}: ${clauseTitle}`,
        level: "clause",
        lines: [line],
      };
      continue;
    }

    const numberedMatch = line.match(/^\s*(\d+)\)\s+(.+)/);
    if (numberedMatch && !clauseMatch) {
      if (current.lines.length > 0) sections.push(current);
      const num = numberedMatch[1];
      const title = numberedMatch[2].slice(0, 80);
      current = {
        id: `section-${num}`,
        title: `${num}) ${title}`,
        level: "clause",
        lines: [line],
      };
      continue;
    }

    current.lines.push(line);
  }
  if (current.lines.length > 0) sections.push(current);

  return sections;
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const filePath = join(process.cwd(), "data/processed", doc.fileName);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    notFound();
  }

  const sections = parseDocument(raw);

  return (
    <div className="min-h-dvh bg-[var(--color-ivory)]">
      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-[var(--color-sandstone)] bg-[var(--color-ivory)]/90 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/docs" className="p-1.5 rounded-lg hover:bg-[var(--color-stone-100)] transition-colors">
            <ArrowLeft className="w-4 h-4 text-[var(--color-stone-600)]" />
          </Link>
          <Image src="/sobha-logo.png" alt="Sobha" width={24} height={24} className="rounded-full" />
          <span className="text-[14px] font-medium text-[var(--color-charcoal)] truncate">{doc.shortTitle}</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <h1 className="text-[24px] font-bold text-[var(--color-charcoal)] tracking-[-0.5px] font-[family-name:var(--font-display)]">
          {doc.title}
        </h1>
        {doc.date && (
          <p className="text-[14px] text-[var(--color-stone-400)] mt-1">
            {new Date(doc.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}

        {/* Content */}
        <div className="mt-8 space-y-0">
          {sections.map((section) => (
            <div key={section.id} id={section.id} className="scroll-mt-20">
              {section.level === "page" && section.title !== "Document" && (
                <div className="mt-10 mb-4 pt-6 border-t border-[var(--color-sandstone)]/60">
                  <span className="text-[11px] font-medium text-[var(--color-stone-400)] uppercase tracking-wider">
                    {section.title}
                  </span>
                </div>
              )}
              {section.level === "chapter" && (
                <h2 className="mt-8 mb-3 text-[18px] font-bold text-[var(--color-emerald)] font-[family-name:var(--font-display)]">
                  <a href={`#${section.id}`} className="hover:underline">
                    {section.title}
                  </a>
                </h2>
              )}
              {section.level === "clause" && (
                <h3 className="mt-6 mb-2 text-[15px] font-semibold text-[var(--color-charcoal)]">
                  <a href={`#${section.id}`} className="hover:underline">
                    {section.title}
                  </a>
                </h3>
              )}
              <div className="text-[14px] leading-relaxed text-[var(--color-stone-700)] whitespace-pre-wrap">
                {section.lines.join("\n").trim()}
              </div>
            </div>
          ))}
        </div>

        {/* Back to chat */}
        <div className="mt-16 pt-8 border-t border-[var(--color-sandstone)]/60 text-center">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-emerald)] text-white text-[14px] font-medium hover:bg-[var(--color-emerald-dark)] transition-colors"
          >
            Ask Sobha Concierge about this document
          </Link>
        </div>
      </div>
    </div>
  );
}
