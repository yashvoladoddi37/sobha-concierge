"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { FileText, Scale, Landmark, ClipboardList, Receipt, ScrollText, Smartphone, ChevronDown, X } from "lucide-react";
import { FeedbackButtons } from "@/components/feedback-buttons";
import type { SourceChunk } from "@/lib/types";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  isStreaming?: boolean;
  messageId?: string;
  previousUserMessage?: string;
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

function getDocIcon(type: string) {
  switch (type) {
    case "mygate": return Smartphone;
    case "bylaws": return Scale;
    case "minutes": return ClipboardList;
    case "deed": return ScrollText;
    case "act": return Landmark;
    case "financial": return Receipt;
    default: return FileText;
  }
}

function stripMetadataPrefix(content: string): string {
  const match = content.indexOf("]\n\n");
  if (content.startsWith("[Document:") && match !== -1) {
    return content.slice(match + 3).trim();
  }
  return content.trim();
}

function SourceCard({ source }: { source: SourceChunk }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getDocIcon(source.docType);

  const details = [source.chapter, source.section, source.pageNumber ? `Page ${source.pageNumber}` : null]
    .filter(Boolean)
    .join(" · ");

  const cleanContent = stripMetadataPrefix(source.content);

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--color-gold-light)] border border-[var(--color-gold-border)] hover:bg-[var(--color-gold-light)]/80 transition-colors text-left cursor-pointer"
      >
        <Icon className="w-4 h-4 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[var(--color-gold)] leading-tight">
            {source.docName}
          </div>
          {details && (
            <div className="text-[11px] text-[var(--color-stone-500)] leading-tight mt-0.5">
              {details}
            </div>
          )}
        </div>
        <ChevronDown className={cn(
          "w-3.5 h-3.5 text-[var(--color-gold)] flex-shrink-0 mt-0.5 transition-transform",
          expanded && "rotate-180"
        )} />
      </button>

      {expanded && (
        <div className="mt-1 mx-1 p-3 rounded-lg bg-white border border-[var(--color-sandstone)] text-[13px] leading-relaxed text-[var(--color-stone-700)] max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-[var(--color-stone-400)] uppercase tracking-wider">
              Full clause
            </span>
            <button type="button" onClick={() => setExpanded(false)} className="cursor-pointer">
              <X className="w-3.5 h-3.5 text-[var(--color-stone-400)] hover:text-[var(--color-stone-600)]" />
            </button>
          </div>
          <div className="whitespace-pre-wrap">{cleanContent}</div>
        </div>
      )}
    </div>
  );
}

function CitationCard({ citation }: { citation: string }) {
  const parts = citation.split("|").map((p) => p.trim());
  const docName = parts[0] || citation;
  const section = parts[1];
  const page = parts[2];

  const lower = citation.toLowerCase();
  let Icon = FileText;
  if (lower.includes("mygate")) Icon = Smartphone;
  else if (lower.includes("bylaw")) Icon = Scale;
  else if (lower.includes("meeting") || lower.includes("mom") || lower.includes("agm") || lower.includes("egm")) Icon = ClipboardList;
  else if (lower.includes("deed") || lower.includes("declaration")) Icon = ScrollText;
  else if (lower.includes("act") || lower.includes("karnataka")) Icon = Landmark;
  else if (lower.includes("income") || lower.includes("financial") || lower.includes("expenditure")) Icon = Receipt;

  return (
    <div className="flex items-start gap-2 px-3 py-2 my-1.5 rounded-lg bg-[var(--color-gold-light)] border border-[var(--color-gold-border)]">
      <Icon className="w-4 h-4 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-[var(--color-gold)] leading-tight">
          {docName}
        </div>
        {(section || page) && (
          <div className="text-[11px] text-[var(--color-stone-500)] leading-tight mt-0.5">
            {[section, page].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ content, isBot, sources }: { content: string; isBot: boolean; sources?: SourceChunk[] }) {
  const parts = content.split(/(\[Source:[^\]]+\])/g);

  const textParts: string[] = [];
  const inlineCitations: string[] = [];

  parts.forEach((part) => {
    if (part.startsWith("[Source:")) {
      inlineCitations.push(part.slice(8, -1).trim());
    } else {
      textParts.push(part);
    }
  });

  const mainText = textParts.join("").replace(/\n*Sources?\s*:?\s*$/i, "").trim();
  const hasSources = sources && sources.length > 0;

  return (
    <>
      {mainText.split("\n").map((line, j) => {
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

      {/* Expandable source cards from metadata (preferred) */}
      {hasSources && (
        <div className="mt-3 pt-3 border-t border-[var(--color-gold-border)]/40">
          <div className="text-[11px] font-medium text-[var(--color-stone-400)] uppercase tracking-wider mb-1">
            Sources — click to expand
          </div>
          {sources.map((s, i) => (
            <SourceCard key={i} source={s} />
          ))}
        </div>
      )}

      {/* Fallback: inline citations if no metadata sources */}
      {!hasSources && inlineCitations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-gold-border)]/40">
          <div className="text-[11px] font-medium text-[var(--color-stone-400)] uppercase tracking-wider mb-1">
            Sources
          </div>
          {inlineCitations.map((c, i) => (
            <CitationCard key={i} citation={c} />
          ))}
        </div>
      )}
    </>
  );
}

function formatInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
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
