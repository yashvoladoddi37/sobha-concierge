import { getSupabase } from "@/lib/db/supabase";
import type { ConversationMessage } from "./types";

const MAX_CONTEXT_MESSAGES = 6; // Last 3 turns (user + assistant pairs)
const CONTEXT_HOURS = 24; // Ignore messages older than 24h

/**
 * Get recent conversation history for a phone number
 * Returns last N messages within 24 hours for multi-turn context
 */
export async function getRecentMessages(
  phoneHash: string,
  limit: number = MAX_CONTEXT_MESSAGES
): Promise<ConversationMessage[]> {
  const sb = getSupabase();
  const cutoffTime = new Date(Date.now() - CONTEXT_HOURS * 60 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("whatsapp_conversations") as any)
    .select("role, content, created_at")
    .eq("phone_hash", phoneHash)
    .gte("created_at", cutoffTime.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[Conversation] Failed to load history:", error);
    return [];
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?.map((row: any) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
      timestamp: new Date(row.created_at),
    })) || []
  );
}

/**
 * Store a message in conversation history
 */
export async function storeMessage(
  phoneHash: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const sb = getSupabase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("whatsapp_conversations") as any).insert({
    phone_hash: phoneHash,
    role,
    content,
  });

  if (error) {
    console.error("[Conversation] Failed to store message:", error);
    // Non-critical - don't fail the request
  }
}

/**
 * Check if this is a new user (no conversation history)
 */
export async function isNewUser(phoneHash: string): Promise<boolean> {
  const sb = getSupabase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (sb.from("whatsapp_conversations") as any)
    .select("*", { count: "exact", head: true })
    .eq("phone_hash", phoneHash);

  if (error) {
    console.error("[Conversation] Failed to check user history:", error);
    return true; // Assume new user on error
  }

  return count === 0;
}

/**
 * Convert conversation history to format expected by condenseForRetrieval
 */
export function toCondenseFormat(
  messages: ConversationMessage[]
): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
