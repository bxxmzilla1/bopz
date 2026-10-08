import { NextResponse } from "next/server";
import { authenticateAdmin, serviceClient } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLES = {
  devices: { table: "push_subscriptions", column: "id" },
  history: { table: "notifications", column: "id" },
  clicks: { table: "link_clicks", column: "id" },
} as const;

type Target = keyof typeof TABLES;

export async function POST(req: Request) {
  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const auth = await authenticateAdmin(req, supabase);
  if ("response" in auth) return auth.response;

  let input: { targets?: unknown };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const targets = Array.isArray(input.targets)
    ? (input.targets.filter((t) => typeof t === "string" && t in TABLES) as Target[])
    : [];
  if (!targets.length) return NextResponse.json({ error: "Nothing to reset" }, { status: 400 });

  const removed: Partial<Record<Target, number>> = {};
  for (const target of targets) {
    const { table, column } = TABLES[target];
    const { count, error } = await supabase.from(table).delete({ count: "exact" }).not(column, "is", null);
    if (error) return NextResponse.json({ error: `${target}: ${error.message}` }, { status: 500 });
    removed[target] = count ?? 0;
  }

  return NextResponse.json({ removed });
}
