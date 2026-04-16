"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ChatMessage, TypingIndicator } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { SuggestedQuestions } from "@/components/suggested-questions";

export default function Home() {
  const { messages, sendMessage, status } = useChat();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = (text?: string) => {
    const messageText = text ?? input.trim();
    if (!messageText || isLoading) return;
    sendMessage({ text: messageText });
    setInput("");
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-dvh bg-[var(--color-ivory)]">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--color-sandstone)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <Image src="/sobha-logo.png" alt="Sobha" width={36} height={36} className="rounded-full" />
          <div>
            <h1 className="text-[16px] font-semibold text-[var(--color-charcoal)] leading-tight">
              Sobha Concierge
            </h1>
            <p className="text-[12px] text-[var(--color-stone-500)] leading-tight">
              Sobha Indraprastha Resident Assistant
            </p>
          </div>
        </div>
      </header>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="max-w-2xl mx-auto px-4 py-6">
          {!hasMessages ? (
            /* Welcome screen */
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
              <Image src="/sobha-logo.png" alt="Sobha" width={64} height={64} className="rounded-2xl shadow-[0_4px_12px_rgba(45,106,79,0.2)]" />
              <div className="text-center">
                <h2 className="text-[28px] font-bold text-[var(--color-charcoal)] tracking-[-0.5px] font-[family-name:var(--font-display)]">
                  Welcome to Sobha Concierge
                </h2>
                <p className="text-[15px] text-[var(--color-stone-500)] mt-2">
                  Your AI assistant for Sobha Indraprastha
                </p>
                <p className="text-[13px] text-[var(--color-stone-400)] mt-1">
                  Ask about bylaws, meeting decisions, penalties, finances, and more.
                </p>
              </div>
              <div className="mt-4 max-w-lg">
                <SuggestedQuestions onSelect={(q) => handleSend(q)} />
              </div>
            </div>
          ) : (
            /* Chat messages */
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role as "user" | "assistant"}
                  content={
                    message.parts
                      .filter((p): p is { type: "text"; text: string } => p.type === "text")
                      .map((p) => p.text)
                      .join("") || ""
                  }
                  isStreaming={
                    isLoading &&
                    message.id === messages[messages.length - 1]?.id &&
                    message.role === "assistant"
                  }
                />
              ))}
              {isLoading &&
                messages[messages.length - 1]?.role === "user" && (
                  <TypingIndicator />
                )}
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={() => handleSend()}
        isLoading={isLoading}
      />
    </div>
  );
}
