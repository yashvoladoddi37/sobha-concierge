import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { retrieve } from "@/lib/rag/retriever";
import {
  routeQuery,
  condenseForRetrieval,
} from "@/lib/rag/query-router";
import {
  SYSTEM_PROMPT_WHATSAPP,
  buildPromptWithContext,
} from "@/lib/rag/prompt-whatsapp";
import {
  verifyWebhookSignature,
  verifyWebhookGet,
} from "@/lib/whatsapp/verify";
import {
  sendTextMessage,
} from "@/lib/whatsapp/client";
import {
  checkRateLimit,
  incrementUsage,
  hashPhone,
  formatRateLimitMessage,
  formatRateLimitExceededMessage,
  formatRateLimitWarning,
} from "@/lib/whatsapp/ratelimit";
import {
  getRecentMessages,
  storeMessage,
  isNewUser,
  toCondenseFormat,
} from "@/lib/whatsapp/conversation";
import {
  isTextMessage,
  type WebhookPayload,
  type WebhookMessage,
} from "@/lib/whatsapp/types";

// Welcome message for new users
const WELCOME_MESSAGE = `Hey! I'm Sobha Concierge — your AI assistant for Sobha Indraprastha. 🏠

Ask me about bylaws, penalties, meeting decisions, parking, pets, maintenance — anything in the apartment docs. Every answer comes with citations.

Try: "What are the parking rules?" or "What was decided in the last board meeting?"`;

// Error message for non-text inputs
const NON_TEXT_MESSAGE = `I can only read text messages right now. Please type your question! 😊`;

// Error message for processing failures
const ERROR_MESSAGE = `Something went wrong on my end. Please try again, or contact SIAOA at bom@siaoa.co.in or call +91-77957 00320.`;

// Maximum response length (leave room for rate limit footer)
const MAX_RESPONSE_LENGTH = 3500;

/**
 * GET /api/whatsapp
 * Meta webhook verification endpoint
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expectedToken) {
    console.error("[WhatsApp] Missing WHATSAPP_VERIFY_TOKEN");
    return new NextResponse("Configuration error", { status: 500 });
  }

  const isValid = verifyWebhookGet(mode, verifyToken, expectedToken);
  if (!isValid) {
    console.warn("[WhatsApp] Webhook verification failed", { mode, verifyToken });
    return new NextResponse("Verification failed", { status: 403 });
  }

  // Return the challenge to confirm verification
  return new NextResponse(challenge, { status: 200 });
}

/**
 * POST /api/whatsapp
 * Main webhook handler for incoming messages
 */
export async function POST(request: NextRequest) {
  // Vercel-specific logging
  console.error("[WhatsApp] POST request received - Vercel log");
  
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("[WhatsApp] Missing WHATSAPP_APP_SECRET");
    return new NextResponse(JSON.stringify({ error: "Missing WHATSAPP_APP_SECRET" }), { status: 500 });
  }

  // Get raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("X-Hub-Signature-256");

  // Verify webhook signature
  console.log("[WhatsApp] Verifying signature...");
  const isValid = verifyWebhookSignature(rawBody, signature, appSecret);
  console.log("[WhatsApp] Signature valid:", isValid);
  
  if (!isValid) {
    console.warn("[WhatsApp] Signature verification failed");
    // Return debug info to help troubleshoot
    return new NextResponse(JSON.stringify({ 
      debug: "signature_failed",
      hasSecret: !!appSecret,
      hasSignature: !!signature,
      bodyLength: rawBody.length
    }), { status: 200 });
  }

  // Parse payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[WhatsApp] Invalid JSON payload");
    return new NextResponse("Invalid payload", { status: 400 });
  }

  // Process each entry and change (usually just one)
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;

      const value = change.value;
      if (!value.messages?.length) continue;

      for (const message of value.messages) {
        await processMessage(message);
      }
    }
  }

  // Always return 200 OK quickly
  return new NextResponse("OK", { status: 200 });
}

/**
 * Process a single incoming message
 */
async function processMessage(message: WebhookMessage): Promise<void> {
  // Ignore non-text messages
  if (!isTextMessage(message)) {
    await sendTextMessage(
      message.from,
      NON_TEXT_MESSAGE
    );
    return;
  }

  const phoneHash = hashPhone(message.from);
  const text = message.text.body.trim();

  console.log("[WhatsApp] Received message:", {
    from: message.from.slice(-4), // Log last 4 digits only
    text: text.slice(0, 50),
    phoneHash: phoneHash.slice(0, 8),
  });

  // Check rate limit
  console.log("[WhatsApp] Checking rate limit...");
  const rateLimit = await checkRateLimit(phoneHash);
  console.log("[WhatsApp] Rate limit result:", { allowed: rateLimit.allowed, remaining: rateLimit.remaining });
  
  if (!rateLimit.allowed) {
    console.log("[WhatsApp] Rate limit exceeded for", phoneHash.slice(0, 8));
    await sendTextMessage(
      message.from,
      formatRateLimitExceededMessage(rateLimit)
    );
    return;
  }

  // Check if new user
  console.log("[WhatsApp] Checking if new user...");
  const isNew = await isNewUser(phoneHash);
  console.log("[WhatsApp] Is new user:", isNew);

  // Load conversation context
  console.log("[WhatsApp] Loading conversation context...");
  const recentMessages = await getRecentMessages(phoneHash);
  console.log("[WhatsApp] Loaded", recentMessages.length, "messages");

  // Build response
  let responseText: string;

  try {
    console.log("[WhatsApp] Generating response...");
    // For new users, prepend welcome message
    if (isNew && recentMessages.length === 0) {
      console.log("[WhatsApp] New user flow - generating with welcome");
      const answer = await generateResponse(text, recentMessages);
      responseText = `${WELCOME_MESSAGE}\n\n${answer}`;
    } else {
      console.log("[WhatsApp] Existing user flow");
      responseText = await generateResponse(text, recentMessages);
    }

    // Append rate limit warning if running low (only if not exceeding)
    const warning = formatRateLimitWarning(rateLimit);
    if (warning) {
      responseText += `\n\n${warning}`;
    }

    // Append rate limit footer
    responseText += `\n\n${formatRateLimitMessage(rateLimit)}`;

    // Truncate if too long
    if (responseText.length > MAX_RESPONSE_LENGTH) {
      responseText =
        responseText.slice(0, MAX_RESPONSE_LENGTH - 100) +
        "\n\n... (continued on web: sobha-chatbot.vercel.app)";
    }
  } catch (err) {
    console.error("[WhatsApp] Error generating response:", err);
    responseText = ERROR_MESSAGE;
  }

  // Send response
  console.log("[WhatsApp] Sending response...");
  const sendResult = await sendTextMessage(message.from, responseText);
  console.log("[WhatsApp] Send result:", { success: sendResult.success, error: sendResult.error });

  if (sendResult.success) {
    // Store conversation history
    console.log("[WhatsApp] Storing conversation history...");
    await storeMessage(phoneHash, "user", text);
    await storeMessage(phoneHash, "assistant", responseText);

    // Increment usage count
    console.log("[WhatsApp] Incrementing usage...");
    await incrementUsage(phoneHash);

    console.log("[WhatsApp] Response sent successfully");
  } else {
    console.error("[WhatsApp] Failed to send response:", sendResult.error);
  }
}

/**
 * Generate AI response using existing RAG pipeline
 */
async function generateResponse(
  query: string,
  history: { role: "user" | "assistant"; content: string; timestamp: Date }[]
): Promise<string> {
  // Convert to format expected by query router
  const historyForCondense = toCondenseFormat(history);

  // Condense multi-turn into standalone query
  const searchQuery = condenseForRetrieval([
    ...historyForCondense,
    { role: "user", content: query },
  ]);

  // Route query to get doc type filter
  const { docTypeFilter } = await routeQuery(searchQuery);

  // Retrieve relevant documents
  const results = await retrieve(searchQuery, {
    topK: 20,
    rerankTopK: 5,
    docTypeFilter: docTypeFilter ?? undefined,
  });

  // Build prompt with context
  const augmentedQuery = buildPromptWithContext(query, results);

  // Generate response (non-streaming for WhatsApp)
  const { text } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    system: SYSTEM_PROMPT_WHATSAPP,
    messages: [
      // Include recent history for context
      ...historyForCondense.slice(-4).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: augmentedQuery },
    ],
    temperature: 0.2,
  });

  return text;
}
