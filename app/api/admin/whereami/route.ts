import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The admin's own country, so the allowlist page can warn before locking yourself out of the app. */
export function GET(req: Request) {
  return NextResponse.json({ country: req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null });
}
