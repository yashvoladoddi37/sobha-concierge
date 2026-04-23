"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { FileText, Scale, Landmark, ClipboardList, Receipt, ScrollText, Smartphone, ExternalLink } from "lucide-react";
import { FeedbackButtons } from "@/components/feedback-buttons";
import { resolveDocUrl } from "@/lib/doc-url";
import type { SourceChunk } from "@/lib/types";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  isStreaming?: boolean;
  messageId?: string;
  previousUserMessage?: string;
}

interface ParsedCitation {
  docName: string;
  section?: string;
  page?: string;
  quote?: string;
}

export function ChatMessage({ role, content, sources, isStreaming, messageId, previousUserMessage }: ChatMessageProps) {
  const isBot = role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-3 animate-message-in",
        isBot ? "justify-start" : "justify-end"
      )}
    >
      {isBot && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-white mt-1">
          <Image src="/sobha-logo.png" alt="Sobha" width={32} height={32} className="w-full h-full object-contain" />
        </div>
      )}

      <div className="max-w-[85%]">
        <div
          className={cn(
            "px-4 py-3 text-[15px] leading-relaxed",
            isBot
              ? "bg-[var(--color-emerald-light)] text-[var(--color-stone-900)] rounded-[2px_16px_16px_16px]"
              : "bg-[var(--color-charcoal)] text-white rounded-[16px_16px_2px_16px]"
          )}
        >
          <div
            className={cn(
              "prose prose-sm max-w-none",
              isBot ? "prose-stone" : "prose-invert"
            )}
          >
            <MessageContent content={content} isBot={isBot} sources={sources} />
          </div>

          {isStreaming && isBot && (
            <span className="inline-block w-1.5 h-4 bg-[var(--color-emerald)] rounded-full ml-1 animate-pulse" />
          )}
        </div>

        {isBot && !isStreaming && messageId && (
          <FeedbackButtons
            messageId={messageId}
            query={previousUserMessage}
            response={content}
          />
        )}
      </div>
    </div>
  );
}

function getDocIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("mygate")) return Smartphone;
  if (lower.includes("bylaw")) return Scale;
  if (lower.includes("meeting") || lower.includes("mom") || lower.includes("agm") || lower.includes("egm")) return ClipboardList;
  if (lower.includes("deed") || lower.includes("declaration")) return ScrollText;
  if (lower.includes("act") || lower.includes("karnataka")) return Landmark;
  if (lower.includes("income") || lower.includes("financial") || lower.includes("expenditure")) return Receipt;
  return FileText;
}

function parseCitation(raw: string): ParsedCitation {
  const quoteMatch = raw.match(/\|\s*"([^"]+)"\s*$/);
  const withoutQuote = quoteMatch ? raw.slice(0, raw.lastIndexOf("|")).trim() : raw;
  const parts = withoutQuote.split("|").map((p) => p.trim());

  return {
    docName: parts[0] || raw,
    section: parts[1],
    page: parts[2],
    quote: quoteMatch?.[1],
  };
}

function FootnoteCitation({ index, citation }: { index: number; citation: ParsedCitation }) {
  const Icon = getDocIcon(citation.docName);
  const details = [citation.section, citation.page].filter(Boolean).join(" · ");
  const docUrl = resolveDocUrl(citation.docName, citation.page);

  const inner = (
    <>
      <span className="text-[11px] font-bold text-[var(--color-gold)] mt-0.5 flex-shrink-0 w-4 text-right">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        {citation.quote && (
          <div className="text-[12px] italic text-[var(--color-stone-600)] mb-0.5">
            &ldquo;{citation.quote}&rdquo;
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-[var(--color-gold)] flex-shrink-0" />
          <span className="text-[11px] font-medium text-[var(--color-gold)]">{citation.docName}</span>
          {details && <span className="text-[10px] text-[var(--color-stone-400)]">· {details}</span>}
          {docUrl && <ExternalLink className="w-2.5 h-2.5 text-[var(--color-stone-400)]" />}
        </div>
      </div>
    </>
  );

  if (docUrl) {
    return (
      <Link href={docUrl} target="_blank" className="flex gap-2 py-1.5 hover:bg-[var(--color-gold-light)]/50 -mx-1 px-1 rounded transition-colors">
        {inner}
      </Link>
    );
  }

  return <div className="flex gap-2 py-1.5">{inner}</div>;
}

function MessageContent({ content, isBot, sources }: { content: string; isBot: boolean; sources?: SourceChunk[] }) {
  const { textWithRefs, citations } = useMemo(() => {
    const cits: ParsedCitation[] = [];
    const citationMap = new Map<string, number>();

    const text = content.replace(/\[Source:\s*([^\]]+)\]/g, (_, raw: string) => {
      const parsed = parseCitation(raw);
      const key = `${parsed.docName}|${parsed.section || ""}|${parsed.page || ""}`;

      let num: number;
      if (parsed.quote) {
        num = cits.length + 1;
        cits.push(parsed);
        citationMap.set(key + "|" + num, num);
      } else if (citationMap.has(key + "|" + (citationMap.get(key) ?? 0))) {
        num = citationMap.get(key) ?? cits.length + 1;
      } else {
        num = cits.length + 1;
        cits.push(parsed);
        citationMap.set(key, num);
      }
      return `⟦${num}⟧`;
    });

    const cleaned = text.replace(/\n*Sources?\s*:?\s*$/i, "").trim();
    return { textWithRefs: cleaned, citations: cits };
  }, [content]);

  return (
    <>
      {textWithRefs.split("\n").map((line, j) => {
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <span key={j} className="block pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[10px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-40">
              {formatInline(line.slice(2))}
            </span>
          );
        }
        if (line.trim() === "") {
          return <br key={j} />;
        }
        return (
          <span key={j}>
            {j > 0 && <br />}
            {formatInline(line)}
          </span>
        );
      })}

      {citations.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--color-gold-border)]/40">
          <div className="text-[10px] font-medium text-[var(--color-stone-400)] uppercase tracking-wider mb-1">
            References
          </div>
          {citations.map((c, i) => (
            <FootnoteCitation key={i} index={i + 1} citation={c} />
          ))}
        </div>
      )}

      {citations.length === 0 && sources && sources.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--color-gold-border)]/40">
          <div className="text-[10px] font-medium text-[var(--color-stone-400)] uppercase tracking-wider mb-1">
            Source documents
          </div>
          {sources.map((s, i) => {
            const Icon = getDocIcon(s.docName);
            const details = [s.chapter, s.section, s.pageNumber ? `Page ${s.pageNumber}` : null].filter(Boolean).join(" · ");
            const url = resolveDocUrl(s.docName, s.pageNumber ? `Page ${s.pageNumber}` : undefined);
            const content = (
              <>
                <Icon className="w-3 h-3 text-[var(--color-gold)] flex-shrink-0" />
                <span className="text-[11px] font-medium text-[var(--color-gold)]">{s.docName}</span>
                {details && <span className="text-[10px] text-[var(--color-stone-400)]">· {details}</span>}
                {url && <ExternalLink className="w-2.5 h-2.5 text-[var(--color-stone-400)]" />}
              </>
            );
            return url ? (
              <Link key={i} href={url} target="_blank" className="flex items-center gap-1.5 py-1 hover:bg-[var(--color-gold-light)]/50 -mx-1 px-1 rounded transition-colors">
                {content}
              </Link>
            ) : (
              <div key={i} className="flex items-center gap-1.5 py-1">{content}</div>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatInline(text: string) {
  const parts = text.split(/(⟦\d+⟧|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const refMatch = part.match(/^⟦(\d+)⟧$/);
    if (refMatch) {
      return (
        <sup key={i} className="text-[10px] font-bold text-[var(--color-gold)] ml-0.5">
          [{refMatch[1]}]
        </sup>
      );
    }
    return part;
  });
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start animate-message-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-white">
        <Image src="/sobha-logo.png" alt="Sobha" width={32} height={32} className="w-full h-full object-contain" />
      </div>
      <div className="bg-[var(--color-emerald-light)] rounded-[2px_16px_16px_16px] px-4 py-3 flex items-center gap-1.5">
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
      </div>
    </div>
  );
}
