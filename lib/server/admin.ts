import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verifies the bearer token belongs to an admin. Returns the user, or an error response to send back. */
export async function authenticateAdmin(
  req: Request,
  supabase: SupabaseClient
): Promise<{ user: User } | { response: NextResponse }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { user: data.user };
}
