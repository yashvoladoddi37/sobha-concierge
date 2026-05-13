/**
 * Meta WhatsApp Cloud API webhook payload types
 * Based on Meta Graph API v18.0 webhook structure
 */

// Main webhook payload structure
export interface WebhookPayload {
  object: "whatsapp_business_account";
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookValue;
  field: "messages" | string;
}

export interface WebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WebhookContact[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
}

export interface WebhookContact {
  wa_id: string;
  profile: {
    name: string;
  };
}

// Message types
export type WebhookMessage =
  | TextMessage
  | MediaMessage
  | LocationMessage
  | UnknownMessage;

interface BaseMessage {
  id: string;
  from: string; // Phone number (with country code)
  timestamp: string; // Unix timestamp
  type: string;
}

export interface TextMessage extends BaseMessage {
  type: "text";
  text: {
    body: string;
  };
}

export interface MediaMessage extends BaseMessage {
  type: "image" | "video" | "audio" | "document" | "sticker";
  [key: string]: unknown;
}

export interface LocationMessage extends BaseMessage {
  type: "location";
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

export interface UnknownMessage extends BaseMessage {
  type: string;
}

// Status update types
export interface WebhookStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin?: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
}

// Type guards
export function isTextMessage(message: WebhookMessage): message is TextMessage {
  return message.type === "text";
}

export function isMediaMessage(message: WebhookMessage): message is MediaMessage {
  return ["image", "video", "audio", "document", "sticker"].includes(message.type);
}

export function isLocationMessage(message: WebhookMessage): message is LocationMessage {
  return message.type === "location";
}

// Meta API request/response types
export interface SendMessageRequest {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: {
    body: string;
    preview_url?: boolean;
  };
}

export interface SendMessageResponse {
  messaging_product: "whatsapp";
  contacts: [
    {
      input: string;
      wa_id: string;
    }
  ];
  messages: [
    {
      id: string;
    }
  ];
}

// Internal types
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  max: number;
  windowStart: Date;
  resetAt: Date;
  currentCount: number;
}
