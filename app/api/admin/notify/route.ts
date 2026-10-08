import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush, { type PushSubscription, type WebPushError } from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export async function POST(req: Request) {
  let supabase;
  try {
    supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    webpush.setVapidDetails(env("VAPID_SUBJECT"), env("NEXT_PUBLIC_VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let input: { title?: unknown; body?: unknown; url?: unknown };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 500) : "";
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  const url = rawUrl.startsWith("/") && !rawUrl.startsWith("//") ? rawUrl : "/";
  if (!title && !body) return NextResponse.json({ error: "Enter a title or a message" }, { status: 400 });

  const subscriptions: SubscriptionRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    subscriptions.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const { data: log } = await supabase
    .from("notifications")
    .insert({ title, body, url, created_by: auth.user.id })
    .select("id")
    .single();

  const payload = JSON.stringify({ title, body, url, tag: log?.id });
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((s) => {
        const sub: PushSubscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        return webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24, urgency: "high" });
      })
    );
    results.forEach((result, j) => {
      if (result.status === "fulfilled") {
        sent++;
        return;
      }
      failed++;
      const status = (result.reason as WebPushError)?.statusCode;
      if (status === 404 || status === 410) expired.push(batch[j].id);
    });
  }

  if (expired.length) {
    await supabase.from("push_subscriptions").delete().in("id", expired);
  }
  if (log?.id) {
    await supabase.from("notifications").update({ sent_count: sent, failed_count: failed }).eq("id", log.id);
  }

  return NextResponse.json({ total: subscriptions.length, sent, failed, removed: expired.length });
}
