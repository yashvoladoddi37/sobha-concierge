"use client";

import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/lib/chat-store";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ChatSidebar({ sessions, activeId, onSelect, onNew, onDelete, open, onClose }: ChatSidebarProps) {
  return (
    <>
      {/* Backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-[var(--color-surface)] border-r border-[var(--color-sandstone)] z-50 flex flex-col transition-transform duration-200 ease-out",
          "md:relative md:translate-x-0 md:z-auto",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-[var(--color-sandstone)] flex-shrink-0">
          <span className="text-[14px] font-semibold text-[var(--color-charcoal)]">
            Chats
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onNew}
              className="p-2 rounded-lg hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer"
              title="New chat"
            >
              <Plus className="w-4 h-4 text-[var(--color-stone-500)]" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer md:hidden"
            >
              <X className="w-4 h-4 text-[var(--color-stone-500)]" />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-[var(--color-stone-400)]">
                No conversations yet
              </p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors",
                  session.id === activeId
                    ? "bg-[var(--color-emerald-light)] text-[var(--color-charcoal)]"
                    : "hover:bg-[var(--color-surface-elevated)] text-[var(--color-stone-500)]"
                )}
                onClick={() => {
                  onSelect(session.id);
                  onClose();
                }}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">
                    {session.title}
                  </div>
                  <div className="text-[11px] text-[var(--color-stone-400)]">
                    {timeAgo(session.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 transition-all cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
