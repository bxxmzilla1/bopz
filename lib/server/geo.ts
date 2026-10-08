export type Geo = { city: string | null; region: string | null; country: string | null };

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  return ip || null;
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    ip.startsWith("fe80:")
  );
}

/** Looks up city/region/country with ipinfo. Returns null if the lookup fails or the IP is private. */
export async function lookupIp(ip: string | null): Promise<Geo | null> {
  if (!ip || isPrivateIp(ip)) return null;
  const token = process.env.IPINFO_TOKEN;
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { city?: string; region?: string; country?: string; bogon?: boolean };
    if (json.bogon) return null;
    return { city: json.city || null, region: json.region || null, country: json.country || null };
  } catch {
    return null;
  }
}
