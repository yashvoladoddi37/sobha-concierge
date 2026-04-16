"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
import { FileText, Scale, Landmark, ClipboardList, Receipt, ScrollText } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isBot = role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-3 animate-message-in",
        isBot ? "justify-start" : "justify-end"
      )}
    >
      {/* Bot avatar */}
      {isBot && (
        <Image src="/sobha-logo.png" alt="Sobha" width={32} height={32} className="flex-shrink-0 rounded-full mt-1" />
      )}

      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 text-[15px] leading-relaxed",
          isBot
            ? "bg-[var(--color-emerald-light)] text-[var(--color-stone-900)] rounded-[2px_16px_16px_16px]"
            : "bg-[var(--color-charcoal)] text-white rounded-[16px_16px_2px_16px]"
        )}
      >
        {/* Render markdown-like content */}
        <div
          className={cn(
            "prose prose-sm max-w-none",
            isBot
              ? "prose-stone"
              : "prose-invert"
          )}
        >
          <MessageContent content={content} isBot={isBot} />
        </div>

        {/* Streaming indicator */}
        {isStreaming && isBot && (
          <span className="inline-block w-1.5 h-4 bg-[var(--color-emerald)] rounded-full ml-1 animate-pulse" />
        )}
      </div>
    </div>
  );
}

function getDocIcon(citation: string) {
  const lower = citation.toLowerCase();
  if (lower.includes("bylaw")) return Scale;
  if (lower.includes("meeting") || lower.includes("mom") || lower.includes("agm") || lower.includes("egm")) return ClipboardList;
  if (lower.includes("deed") || lower.includes("declaration")) return ScrollText;
  if (lower.includes("act") || lower.includes("karnataka")) return Landmark;
  if (lower.includes("income") || lower.includes("financial") || lower.includes("expenditure")) return Receipt;
  return FileText;
}

function CitationCard({ citation }: { citation: string }) {
  const Icon = getDocIcon(citation);
  // Parse "Document Name | Section | Page X" format
  const parts = citation.split("|").map((p) => p.trim());
  const docName = parts[0] || citation;
  const section = parts[1];
  const page = parts[2];

  return (
    <div className="flex items-start gap-2 px-3 py-2 my-1.5 rounded-lg bg-[var(--color-gold-light)] border border-[var(--color-gold-border)]">
      <Icon className="w-4 h-4 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-[var(--color-gold)] leading-tight">
          {docName}
        </div>
        {(section || page) && (
          <div className="text-[11px] text-[var(--color-stone-500)] leading-tight mt-0.5">
            {[section, page].filter(Boolean).join(" \u00B7 ")}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string; isBot: boolean }) {
  // Split content into main text and citations
  const parts = content.split(/(\[Source:[^\]]+\])/g);

  const textParts: string[] = [];
  const citations: string[] = [];

  parts.forEach((part) => {
    if (part.startsWith("[Source:")) {
      citations.push(part.slice(8, -1).trim());
    } else {
      textParts.push(part);
    }
  });

  const mainText = textParts.join("").replace(/\n*Sources?\s*:?\s*$/i, "").trim();

  return (
    <>
      {/* Main response text */}
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

      {/* Citation cards */}
      {citations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-gold-border)]/40">
          <div className="text-[11px] font-medium text-[var(--color-stone-400)] uppercase tracking-wider mb-1">
            Sources
          </div>
          {citations.map((c, i) => (
            <CitationCard key={i} citation={c} />
          ))}
        </div>
      )}
    </>
  );
}

function formatInline(text: string) {
  // Bold: **text**
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
      <Image src="/sobha-logo.png" alt="Sobha" width={32} height={32} className="flex-shrink-0 rounded-full" />
      <div className="bg-[var(--color-emerald-light)] rounded-[2px_16px_16px_16px] px-4 py-3 flex items-center gap-1.5">
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
      </div>
    </div>
  );
}
