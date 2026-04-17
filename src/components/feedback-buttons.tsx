"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedbackButtonsProps {
  messageId: string;
  query?: string;
  response?: string;
}

export function FeedbackButtons({ messageId, query, response }: FeedbackButtonsProps) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);

  const submit = async (value: "up" | "down") => {
    if (rating) return;
    setRating(value);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, rating: value, query, response }),
      });
    } catch {
      // silent — feedback is best-effort
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1.5">
      <button
        onClick={() => submit("up")}
        disabled={rating !== null}
        className={cn(
          "p-1 rounded-md transition-all",
          rating === "up"
            ? "text-[var(--color-emerald)] bg-[var(--color-emerald-light)]"
            : rating === null
              ? "text-[var(--color-stone-400)] hover:text-[var(--color-emerald)] hover:bg-[var(--color-emerald-light)] cursor-pointer"
              : "text-[var(--color-stone-300)] cursor-default"
        )}
        aria-label="Helpful"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => submit("down")}
        disabled={rating !== null}
        className={cn(
          "p-1 rounded-md transition-all",
          rating === "down"
            ? "text-red-500 bg-red-50"
            : rating === null
              ? "text-[var(--color-stone-400)] hover:text-red-500 hover:bg-red-50 cursor-pointer"
              : "text-[var(--color-stone-300)] cursor-default"
        )}
        aria-label="Not helpful"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      {rating && (
        <span className="text-[11px] text-[var(--color-stone-400)] ml-1">
          {rating === "up" ? "Thanks!" : "We'll improve"}
        </span>
      )}
    </div>
  );
}
