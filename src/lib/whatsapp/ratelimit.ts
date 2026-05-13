import { getSupabase } from "@/lib/db/supabase";
import type { RateLimitInfo } from "./types";
import crypto from "crypto";

const RATE_LIMIT_MAX = parseInt(process.env.WHATSAPP_RATE_LIMIT_MAX || "20", 10);
const RATE_LIMIT_WINDOW_HOURS = parseInt(
  process.env.WHATSAPP_RATE_LIMIT_WINDOW_HOURS || "24",
  10
);

/**
 * Hash phone number for privacy (no raw PII in database)
 */
export function hashPhone(phone: string): string {
  // Normalize: remove non-digits
  const normalized = phone.replace(/\D/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Check rate limit status for a phone number
 * Returns remaining queries and reset time
 */
export async function checkRateLimit(phoneHash: string): Promise<RateLimitInfo> {
  const sb = getSupabase();
  const now = new Date();

  // Get or create rate limit record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("whatsapp_rate_limits") as any)
    .select("*")
    .eq("phone_hash", phoneHash)
    .single();

  if (error && error.code !== "PGRST116") {
    // Not "no rows" error
    console.error("[RateLimit] Database error:", error);
    // Fail open - allow request on DB error
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX,
      max: RATE_LIMIT_MAX,
      windowStart: now,
      resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000),
      currentCount: 0,
    };
  }

  if (!data) {
    // New user - create record
    const windowStart = now;
    const resetAt = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("whatsapp_rate_limits") as any).upsert({
      phone_hash: phoneHash,
      query_count: 0,
      window_start: windowStart.toISOString(),
      updated_at: now.toISOString(),
    });

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX,
      max: RATE_LIMIT_MAX,
      windowStart,
      resetAt,
      currentCount: 0,
    };
  }

  // Check if window has expired
  const windowStart = new Date(data.window_start);
  const windowEnd = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);

  if (now > windowEnd) {
    // Window expired - reset
    const newWindowStart = now;
    const newResetAt = new Date(
      newWindowStart.getTime() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("whatsapp_rate_limits") as any)
      .update({
        query_count: 0,
        window_start: newWindowStart.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("phone_hash", phoneHash);

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX,
      max: RATE_LIMIT_MAX,
      windowStart: newWindowStart,
      resetAt: newResetAt,
      currentCount: 0,
    };
  }

  // Within current window
  const currentCount = data.query_count || 0;
  const remaining = Math.max(0, RATE_LIMIT_MAX - currentCount);
  const allowed = currentCount < RATE_LIMIT_MAX;

  return {
    allowed,
    remaining,
    max: RATE_LIMIT_MAX,
    windowStart,
    resetAt: windowEnd,
    currentCount,
  };
}

/**
 * Increment query count after successful processing
 */
export async function incrementUsage(phoneHash: string): Promise<void> {
  const sb = getSupabase();
  const now = new Date();

  // Try to increment existing record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("whatsapp_rate_limits") as any)
    .select("query_count")
    .eq("phone_hash", phoneHash)
    .single();

  if (data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("whatsapp_rate_limits") as any)
      .update({
        query_count: (data.query_count || 0) + 1,
        updated_at: now.toISOString(),
      })
      .eq("phone_hash", phoneHash);
  } else {
    // Create new record with count = 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("whatsapp_rate_limits") as any).insert({
      phone_hash: phoneHash,
      query_count: 1,
      window_start: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }
}

/**
 * Format rate limit info for display in WhatsApp message
 */
export function formatRateLimitMessage(info: RateLimitInfo): string {
  const timeString = info.resetAt.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `_Queries today: ${info.currentCount}/${info.max}. Resets at ${timeString} tomorrow._`;
}

/**
 * Format rate limit exceeded message
 */
export function formatRateLimitExceededMessage(info: RateLimitInfo): string {
  const now = new Date();
  const msUntilReset = info.resetAt.getTime() - now.getTime();
  const hoursUntilReset = Math.ceil(msUntilReset / (1000 * 60 * 60));

  const timeString = info.resetAt.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `You've reached your daily limit of ${info.max} queries. 🚫

Your query count resets at ${timeString} tomorrow (~${hoursUntilReset} hours).

For urgent questions, contact:
📧 bom@siaoa.co.in
📞 +91-77957 00320

${formatRateLimitMessage(info)}`;
}

/**
 * Format warning when user is running low
 */
export function formatRateLimitWarning(info: RateLimitInfo): string {
  if (info.remaining <= 3 && info.remaining > 0) {
    return `⚠️ *Heads up:* You have ${info.remaining} quer${info.remaining === 1 ? "y" : "ies"} remaining today.`;
  }
  return "";
}
