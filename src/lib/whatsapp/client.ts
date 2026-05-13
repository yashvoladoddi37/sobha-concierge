import type { SendMessageRequest, SendMessageResponse } from "./types";

const META_API_VERSION = "v18.0";
const META_BASE_URL = "https://graph.facebook.com";

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN environment variable");
  }
  return token;
}

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID environment variable");
  }
  return id;
}

/**
 * Send a text message to a WhatsApp user via Meta Cloud API
 * Includes exponential backoff for rate limiting (429 errors)
 */
export async function sendTextMessage(
  to: string,
  text: string,
  retryCount = 0,
  maxRetries = 3
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  const url = `${META_BASE_URL}/${META_API_VERSION}/${phoneNumberId}/messages`;

  const payload: SendMessageRequest = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      body: text,
      preview_url: false,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      // Rate limited by Meta - exponential backoff
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(
          `[WhatsApp] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return sendTextMessage(to, text, retryCount + 1, maxRetries);
      }
      return { success: false, error: "Meta API rate limit exceeded after retries" };
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[WhatsApp] Meta API error:", response.status, errorData);
      return {
        success: false,
        error: `Meta API error ${response.status}: ${errorData}`,
      };
    }

    const data: SendMessageResponse = await response.json();
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    console.error("[WhatsApp] Failed to send message:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
