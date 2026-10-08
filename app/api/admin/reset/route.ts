import { NextResponse } from "next/server";
import { authenticateAdmin, serviceClient } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLES = {
  history: { table: "notifications", column: "id" },
  clicks: { table: "link_clicks", column: "id" },
} as const;

type Target = keyof typeof TABLES | "devices";
const TARGETS: readonly string[] = ["devices", ...Object.keys(TABLES)];

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
    ? (input.targets.filter((t) => typeof t === "string" && TARGETS.includes(t)) as Target[])
    : [];
  if (!targets.length) return NextResponse.json({ error: "Nothing to reset" }, { status: 400 });

  const removed: Partial<Record<Target, number>> = {};
  for (const target of targets) {
    if (target === "devices") {
      // Devices are never deleted, so they keep receiving notifications; the counter restarts from now.
      const { error } = await supabase
        .from("admin_settings")
        .upsert({ id: 1, devices_reset_at: new Date().toISOString() });
      if (error) {
        const hint = /admin_settings|schema cache/i.test(error.message)
          ? "Run the device counter SQL in Supabase first."
          : error.message;
        return NextResponse.json({ error: `devices: ${hint}` }, { status: 500 });
      }
      continue;
    }
    const { table, column } = TABLES[target];
    const { count, error } = await supabase.from(table).delete({ count: "exact" }).not(column, "is", null);
    if (error) return NextResponse.json({ error: `${target}: ${error.message}` }, { status: 500 });
    removed[target] = count ?? 0;
  }

  return NextResponse.json({ removed });
}
