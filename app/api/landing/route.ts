import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_TTL = 60 * 60 * 6;
const EMPTY = { videos: [], opacity: 0.6 };

// Landing visitors aren't signed in and the videos bucket is private, so links are signed here.
export async function GET() {
  try {
    const supabase = serviceClient();
    const { data: settings, error } = await supabase
      .from("landing_settings")
      .select("video_ids,overlay_opacity")
      .eq("id", 1)
      .maybeSingle();
    if (error || !settings) return NextResponse.json(EMPTY);

    const ids = ((settings.video_ids ?? []) as string[]).slice(0, 3);
    const opacity = Number(settings.overlay_opacity ?? 0.6);
    if (!ids.length) return NextResponse.json({ videos: [], opacity });

    const { data: rows } = await supabase.from("videos").select("*").in("id", ids);
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as { storage_path: string; thumb_path?: string | null }[];

    const paths = ordered.flatMap((r) => [r.storage_path, r.thumb_path ?? r.storage_path]);
    const { data: signed } = await supabase.storage.from("videos").createSignedUrls(paths, URL_TTL);
    const videos = ordered
      .map((r, i) => ({
        url: signed?.[i * 2]?.signedUrl ?? null,
        poster: r.thumb_path ? signed?.[i * 2 + 1]?.signedUrl ?? null : null,
      }))
      .filter((v) => v.url);

    return NextResponse.json(
      { videos, opacity },
      // Signed links last 6 hours, so a few minutes of caching is safe and spares the database.
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch {
    return NextResponse.json(EMPTY);
  }
}
