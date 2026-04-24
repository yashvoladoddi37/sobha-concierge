"use client";

const SUGGESTIONS = [
  "What are the penalties for parking violations?",
  "What was decided in the last board meeting?",
  "How do I pre-approve my Uber driver on MyGate?",
  "Can I rent out my apartment?",
  "How do I raise a complaint on MyGate?",
  "How does Swiggy delivery entry work with MyGate?",
  "What is the late fee for maintenance payment?",
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center px-2 sm:px-0">
      {SUGGESTIONS.map((question) => (
        <button
          key={question}
          onClick={() => onSelect(question)}
          className="px-3 sm:px-4 py-2 sm:py-2.5 bg-[var(--color-surface)] border border-[var(--color-stone-300)] rounded-full text-[13px] sm:text-[14px] text-[var(--color-emerald)] hover:bg-[var(--color-emerald-light)] hover:border-[var(--color-emerald)] transition-all duration-150 active:scale-[0.97] cursor-pointer text-left"
        >
          {question}
        </button>
      ))}
    </div>
  );
}
