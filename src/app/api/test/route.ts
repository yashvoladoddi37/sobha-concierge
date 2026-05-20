import { NextResponse } from "next/server";

export async function GET() {
  console.log("[TEST] Simple test endpoint called");
  return NextResponse.json({ 
    message: "Test endpoint working",
    timestamp: new Date().toISOString(),
    env: {
      hasWhatsAppToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
      hasAppSecret: !!process.env.WHATSAPP_APP_SECRET,
      hasPhoneId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    }
  });
}

export async function POST() {
  console.log("[TEST] POST request received");
  return NextResponse.json({ 
    message: "POST test working",
    timestamp: new Date().toISOString()
  });
}
