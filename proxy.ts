import { NextResponse, type NextRequest } from "next/server";

const CACHE_MS = 60_000;
let cache: { codes: Set<string>; at: number } | null = null;

async function allowedCountries(): Promise<Set<string> | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.codes;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/allowed_countries?select=code`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return cache?.codes ?? null;
    const rows = (await res.json()) as { code: string }[];
    cache = { codes: new Set(rows.map((r) => r.code.toUpperCase())), at: Date.now() };
    return cache.codes;
  } catch {
    // Fail open: a Supabase hiccup shouldn't lock everyone out.
    return cache?.codes ?? null;
  }
}

const BLOCKED_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Bopz</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div><img src="/icons/192" alt="" width="80" height="80" style="border-radius:20px;margin-bottom:20px"><h1 style="font-size:24px;margin:0 0 8px">Not available in your country</h1>
<p style="color:rgba(255,255,255,.65);max-width:320px;line-height:1.5;margin:0 auto">Bopz isn't available where you are right now.</p></div></body></html>`;

export async function proxy(req: NextRequest) {
  // Vercel sets this header from the visitor's IP. It's absent in local development.
  const country = req.headers.get("x-vercel-ip-country")?.toUpperCase();
  if (!country) return NextResponse.next();

  const allowed = await allowedCountries();
  if (!allowed || allowed.size === 0 || allowed.has(country)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not available in your country" }, { status: 403 });
  }
  return new NextResponse(BLOCKED_HTML, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = {
  // The admin dashboard, its APIs, and static assets are never blocked.
  matcher: ["/((?!admin|api/admin|_next/static|_next/image|icons|favicon.ico).*)"],
};
