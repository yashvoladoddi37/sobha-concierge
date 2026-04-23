"use client";

import { useState, useEffect, useCallback } from "react";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "sobha-chat-sessions";
const ACTIVE_KEY = "sobha-active-session";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function saveMessagesForSession(sessionId: string, messages: unknown[]) {
  localStorage.setItem(`sobha-msgs-${sessionId}`, JSON.stringify(messages));
}

export function loadMessagesForSession(sessionId: string): unknown[] {
  try {
    const raw = localStorage.getItem(`sobha-msgs-${sessionId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function deleteMessagesForSession(sessionId: string) {
  localStorage.removeItem(`sobha-msgs-${sessionId}`);
}

export function useChatStore() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const s = loadSessions();
    const a = loadActiveId();
    setSessions(s);
    if (a && s.find((x) => x.id === a)) {
      setActiveIdState(a);
    } else if (s.length > 0) {
      setActiveIdState(s[0].id);
      saveActiveId(s[0].id);
    }
    setLoaded(true);
  }, []);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    saveActiveId(id);
  }, []);

  const createSession = useCallback(() => {
    const id = generateId();
    const session: ChatSession = {
      id,
      title: "New chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions((prev) => {
      const next = [session, ...prev];
      saveSessions(next);
      return next;
    });
    setActiveId(id);
    return id;
  }, [setActiveId]);

  const updateTitle = useCallback((id: string, title: string) => {
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, title, updatedAt: Date.now() } : s
      );
      saveSessions(next);
      return next;
    });
  }, []);

  const deleteSession = useCallback((id: string) => {
    deleteMessagesForSession(id);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(next);
      if (activeId === id) {
        const newActive = next[0]?.id ?? null;
        if (newActive) {
          setActiveId(newActive);
        } else {
          setActiveIdState(null);
        }
      }
      return next;
    });
  }, [activeId, setActiveId]);

  return {
    sessions,
    activeId,
    loaded,
    setActiveId,
    createSession,
    updateTitle,
    deleteSession,
  };
}
