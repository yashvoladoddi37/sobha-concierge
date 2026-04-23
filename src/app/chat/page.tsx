"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Menu, Plus } from "lucide-react";
import { ChatMessage, TypingIndicator } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { SuggestedQuestions } from "@/components/suggested-questions";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useChatStore, saveMessagesForSession, loadMessagesForSession } from "@/lib/chat-store";
import type { SobhaMessage } from "@/lib/types";

export default function ChatPage() {
  const store = useChatStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  const activeSession = store.sessions.find((s) => s.id === store.activeId);

  const { messages, sendMessage, status, setMessages } = useChat<SobhaMessage>({
    id: `chat-${store.activeId}-${chatKey}`,
    messages: [],
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "streaming" || status === "submitted";
  const hasSetInitial = useRef<string | null>(null);

  // Load messages when switching sessions
  useEffect(() => {
    if (!store.loaded || !store.activeId) return;
    if (hasSetInitial.current === store.activeId) return;
    hasSetInitial.current = store.activeId;

    const saved = loadMessagesForSession(store.activeId);
    if (saved.length > 0) {
      setMessages(saved as SobhaMessage[]);
    }
  }, [store.activeId, store.loaded, setMessages]);

  // Save messages when they change
  useEffect(() => {
    if (!store.activeId || messages.length === 0) return;
    saveMessagesForSession(store.activeId, messages);

    // Update session title from first user message
    if (activeSession?.title === "New chat") {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) {
        const text = firstUser.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("") || "";
        if (text) {
          store.updateTitle(store.activeId, text.slice(0, 50) + (text.length > 50 ? "..." : ""));
        }
      }
    }
  }, [messages, store.activeId, activeSession?.title, store]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-create first session
  useEffect(() => {
    if (store.loaded && store.sessions.length === 0) {
      store.createSession();
    }
  }, [store.loaded, store.sessions.length, store]);

  const handleSend = useCallback((text?: string) => {
    const messageText = text ?? input.trim();
    if (!messageText || isLoading) return;

    if (!store.activeId) {
      store.createSession();
    }

    sendMessage({ text: messageText });
    setInput("");
  }, [input, isLoading, store, sendMessage]);

  const handleNewChat = useCallback(() => {
    const id = store.createSession();
    hasSetInitial.current = id;
    setChatKey((k) => k + 1);
    setMessages([]);
  }, [store, setMessages]);

  const handleSelectSession = useCallback((id: string) => {
    if (id === store.activeId) return;
    hasSetInitial.current = null;
    store.setActiveId(id);
    setChatKey((k) => k + 1);

    const saved = loadMessagesForSession(id);
    setMessages(saved.length > 0 ? (saved as SobhaMessage[]) : []);
    hasSetInitial.current = id;
  }, [store, setMessages]);

  const hasMessages = messages.length > 0;

  if (!store.loaded) return null;

  return (
    <div className="flex h-dvh bg-[var(--color-ivory)]">
      {/* Sidebar */}
      <ChatSidebar
        sessions={store.sessions}
        activeId={store.activeId}
        onSelect={handleSelectSession}
        onNew={handleNewChat}
        onDelete={store.deleteSession}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-[var(--color-sandstone)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-[var(--color-stone-100)] transition-colors cursor-pointer md:hidden"
            >
              <Menu className="w-5 h-5 text-[var(--color-stone-600)]" />
            </button>
            <Image src="/sobha-logo.png" alt="Sobha" width={32} height={32} className="rounded-full" />
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-semibold text-[var(--color-charcoal)] leading-tight truncate">
                Sobha Concierge
              </h1>
              <p className="text-[11px] text-[var(--color-stone-500)] leading-tight">
                Sobha Indraprastha Resident Assistant
              </p>
            </div>
            <button
              onClick={handleNewChat}
              className="p-2 rounded-lg hover:bg-[var(--color-stone-100)] transition-colors cursor-pointer"
              title="New chat"
            >
              <Plus className="w-5 h-5 text-[var(--color-stone-600)]" />
            </button>
          </div>
        </header>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-2xl mx-auto px-4 py-6">
            {!hasMessages ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <Image src="/sobha-logo.png" alt="Sobha" width={56} height={56} className="rounded-2xl shadow-[0_4px_12px_rgba(45,106,79,0.2)]" />
                <div className="text-center">
                  <h2 className="text-[24px] font-bold text-[var(--color-charcoal)] tracking-[-0.5px] font-[family-name:var(--font-display)]">
                    Welcome to Sobha Concierge
                  </h2>
                  <p className="text-[14px] text-[var(--color-stone-500)] mt-2">
                    Ask about bylaws, meeting decisions, penalties, finances, and more.
                  </p>
                </div>
                <div className="mt-2 max-w-lg">
                  <SuggestedQuestions onSelect={(q) => handleSend(q)} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message, idx) => {
                  const prevUserMsg = message.role === "assistant"
                    ? messages.slice(0, idx).reverse().find((m) => m.role === "user")
                    : undefined;
                  const prevUserText = prevUserMsg?.parts
                    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p) => p.text).join("") || undefined;

                  const sources = message.role === "assistant"
                    ? message.metadata?.sources
                    : undefined;

                  return (
                    <ChatMessage
                      key={message.id}
                      role={message.role as "user" | "assistant"}
                      content={
                        message.parts
                          .filter((p): p is { type: "text"; text: string } => p.type === "text")
                          .map((p) => p.text)
                          .join("") || ""
                      }
                      sources={sources}
                      isStreaming={
                        isLoading &&
                        message.id === messages[messages.length - 1]?.id &&
                        message.role === "assistant"
                      }
                      messageId={message.id}
                      previousUserMessage={prevUserText}
                    />
                  );
                })}
                {isLoading && messages[messages.length - 1]?.role === "user" && (
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
    </div>
  );
}
