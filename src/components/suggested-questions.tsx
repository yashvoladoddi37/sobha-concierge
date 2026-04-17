"use client";

const SUGGESTIONS = [
  "What are the penalties for parking violations?",
  "What was decided in the last board meeting?",
  "What are the gym and pool rules?",
  "How do I pre-approve my Uber driver on MyGate?",
  "Can I rent out my apartment?",
  "How do I raise a complaint on MyGate?",
  "How does Swiggy delivery entry work with MyGate?",
  "How do I book the badminton court?",
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
