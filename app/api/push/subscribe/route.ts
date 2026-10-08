import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/admin";
import { clientIp, lookupIp } from "@/lib/server/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saving goes through the server so the device's IP and location can be recorded.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: { endpoint?: unknown; p256dh?: unknown; auth?: unknown; user_agent?: unknown };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { endpoint, p256dh, auth } = input;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const userAgent = typeof input.user_agent === "string" ? input.user_agent.slice(0, 400) : null;

  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = userData.user.id;

  const ip = clientIp(req);
  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("ip,city,region,country")
    .eq("endpoint", endpoint)
    .maybeSingle();

  // Only call ipinfo when the IP changed or the location is still unknown.
  const geo =
    existing && existing.ip === ip && existing.country
      ? { city: existing.city, region: existing.region, country: existing.country }
      : (await lookupIp(ip)) ?? {
          city: existing?.city ?? null,
          region: existing?.region ?? null,
          country: existing?.country ?? null,
        };

  const base = {
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase
    .from("push_subscriptions")
    .upsert({ ...base, ip, ...geo }, { onConflict: "endpoint" });
  // The location columns may not exist yet if the migration hasn't run; still save the device.
  if (error && /column|schema cache/i.test(error.message)) {
    ({ error } = await supabase.from("push_subscriptions").upsert(base, { onConflict: "endpoint" }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // An anonymous account lives in a single installed app, so any other endpoint
  // belonging to this user is an outdated subscription from the same device.
  await supabase.from("push_subscriptions").delete().eq("user_id", userId).neq("endpoint", endpoint);

  return new NextResponse(null, { status: 204 });
}
