import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db/supabase";

export const maxDuration = 10;

export async function GET() {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("document_chunks")
      .select("id")
      .limit(1);

    if (error) {
      console.error("[health] Supabase query failed:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      supabase: "reachable",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[health] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
