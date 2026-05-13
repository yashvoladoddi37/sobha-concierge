import crypto from "crypto";

/**
 * Verify Meta WhatsApp webhook signature
 * Meta sends X-Hub-Signature-256 header containing HMAC-SHA256 of raw body
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) {
    console.warn("[WhatsApp] Missing signature header");
    return false;
  }

  // Expected format: "sha256=<base64_hash>"
  const expectedSignature = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  const computed = crypto
    .createHmac("sha256", appSecret)
    .update(body, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "base64"),
      Buffer.from(computed, "base64")
    );
  } catch {
    // Length mismatch or invalid base64
    return false;
  }
}

/**
 * Verify webhook GET request from Meta
 * Meta sends: hub.mode, hub.verify_token, hub.challenge
 */
export function verifyWebhookGet(
  mode: string | null,
  verifyToken: string | null,
  expectedToken: string
): boolean {
  if (mode !== "subscribe") {
    return false;
  }
  return verifyToken === expectedToken;
}
