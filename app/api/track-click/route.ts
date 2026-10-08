import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sent with navigator.sendBeacon, which can't set headers, so the token travels in the body.
export async function POST(req: Request) {
  let input: { video_id?: unknown; token?: unknown };
  try {
    input = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof input.token !== "string") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { data, error } = await supabase.auth.getUser(input.token);
  if (error || !data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const videoId = typeof input.video_id === "string" && UUID.test(input.video_id) ? input.video_id : null;
  const { error: insertError } = await supabase.from("link_clicks").insert({ video_id: videoId, user_id: data.user.id });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
