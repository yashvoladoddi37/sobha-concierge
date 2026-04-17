import { getSupabase } from "@/lib/db/supabase";

export async function POST(req: Request) {
  const body = await req.json();
  const { messageId, rating, query, response } = body;

  if (!messageId || !rating || !["up", "down"].includes(rating)) {
    return new Response("Invalid feedback", { status: 400 });
  }

  const sb = getSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from as any)("chat_feedback").upsert(
    {
      message_id: messageId,
      rating,
      query: query?.slice(0, 2000),
      response: response?.slice(0, 5000),
    },
    { onConflict: "message_id" }
  );

  if (error) {
    console.error("Feedback insert error:", error.message);
    return new Response("Failed to save feedback", { status: 500 });
  }

  return Response.json({ ok: true });
}
