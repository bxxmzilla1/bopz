import { NextResponse } from "next/server";
import { authenticateAdmin, serviceClient } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let supabase;
  try {
    supabase = serviceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const auth = await authenticateAdmin(req, supabase);
  if ("response" in auth) return auth.response;

  const { count, error } = await supabase
    .from("push_subscriptions")
    .delete({ count: "exact" })
    .not("id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ removed: count ?? 0 });
}
