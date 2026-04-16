"use client";

const SUGGESTIONS = [
  "What are the penalties for parking violations?",
  "What was decided in the last board meeting?",
  "What are the gym and pool rules?",
  "How is the maintenance charge calculated?",
  "Can I rent out my apartment?",
  "What is the process for interior renovation?",
  "Who are the current Board of Managers?",
  "What are the noise rules after 10 PM?",
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {SUGGESTIONS.map((question) => (
        <button
          key={question}
          onClick={() => onSelect(question)}
          className="px-4 py-2.5 bg-white border border-[var(--color-stone-300)] rounded-full text-[14px] text-[var(--color-emerald)] hover:bg-[var(--color-emerald-light)] hover:border-[var(--color-emerald)] transition-all duration-150 active:scale-[0.97] cursor-pointer"
        >
          {question}
        </button>
      ))}
    </div>
  );
}
