"use client";

import { useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  return (
    <div className="border-t border-[var(--color-sandstone)] bg-white px-4 py-3 safe-bottom">
      <div className="max-w-2xl mx-auto flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about bylaws, meetings, penalties..."
            rows={1}
            className="w-full resize-none rounded-xl border-[1.5px] border-[var(--color-sandstone)] bg-white px-4 py-3 text-[15px] placeholder:text-[var(--color-stone-400)] focus:border-[var(--color-emerald)] focus:ring-[3px] focus:ring-[var(--color-emerald)]/10 focus:outline-none transition-all duration-150"
          />
        </div>
        <button
          onClick={onSubmit}
          disabled={!value.trim() || isLoading}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer",
            value.trim() && !isLoading
              ? "bg-[var(--color-emerald)] hover:bg-[var(--color-emerald-dark)] active:scale-95 text-white"
              : "bg-[var(--color-stone-300)] text-white cursor-not-allowed"
          )}
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
