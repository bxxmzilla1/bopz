"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";
import { pushSupported, subscribeToPush } from "@/lib/push";
import VideoCard, { type FeedVideo } from "./VideoCard";

const CATALOG_LIMIT = 1000;
const SIGN_BATCH = 100;
const SIGNED_URL_TTL = 60 * 60 * 6;
// Coming back after this long counts as a new visit and rebuilds the feed.
const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;

type Entry = { key: string; id: string };

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const seenKey = (userId: string) => `bopz-seen-${userId}`;

function loadSeen(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey(userId)) || "[]"));
  } catch {
    return new Set();
  }
}

function saveSeen(userId: string, seen: Set<string>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...seen]));
  } catch {
    // Storage full or unavailable; the feed still works, it just can't remember.
  }
}

type AdSettings = { link_url: string | null; link_label: string | null; every_n: number };

export default function Feed({ userId }: { userId: string }) {
  const [byId, setById] = useState<Record<string, FeedVideo>>({});
  const [queue, setQueue] = useState<Entry[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pendingLikes = useRef<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const pass = useRef(0);
  const appendedAt = useRef(-1);
  const regularIds = useRef<string[]>([]);
  const adIds = useRef<string[]>([]);
  const adEvery = useRef(0);
  const adQueue = useRef<string[]>([]);
  const sinceAd = useRef(0);
  const adCount = useRef(0);
  const lastAd = useRef<string | null>(null);
  const openId = useRef<string | null>(null);

  function nextAd(): string | null {
    const ids = adIds.current;
    if (!ids.length) return null;
    if (!adQueue.current.length) {
      const next = shuffle(ids);
      if (next.length > 1 && next[0] === lastAd.current) [next[0], next[1]] = [next[1], next[0]];
      adQueue.current = next;
    }
    const id = adQueue.current.shift()!;
    lastAd.current = id;
    return id;
  }

  // Slots an ad in after every `adEvery` regular videos; the count carries over between passes.
  function withAds(ids: string[], p: number): Entry[] {
    const out: Entry[] = [];
    for (const id of ids) {
      out.push({ key: `${p}-${id}`, id });
      sinceAd.current += 1;
      if (sinceAd.current < adEvery.current) continue;
      sinceAd.current = 0;
      const adId = nextAd();
      if (adId) {
        adCount.current += 1;
        out.push({ key: `ad${adCount.current}-${adId}`, id: adId });
      }
    }
    return out;
  }
  const loadingRef = useRef(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => (tokenRef.current = data.session?.access_token ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      tokenRef.current = session?.access_token ?? null;
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // sendBeacon survives the app switching to the browser right after the tap.
  function trackLinkClick(videoId: string) {
    const token = tokenRef.current;
    if (!token) return;
    const payload = JSON.stringify({ video_id: videoId, token });
    const sent = navigator.sendBeacon?.("/api/track-click", new Blob([payload], { type: "text/plain" }));
    if (!sent) fetch("/api/track-click", { method: "POST", body: payload, keepalive: true }).catch(() => {});
  }

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const fromUrl = new URLSearchParams(window.location.search).get("v");
    if (fromUrl) {
      openId.current = fromUrl;
      window.history.replaceState(null, "", window.location.pathname);
    }
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(CATALOG_LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as Omit<FeedVideo, "url" | "thumb_url">[];

      const sign = async (paths: string[]) => {
        const out: (string | null)[] = [];
        for (let i = 0; i < paths.length; i += SIGN_BATCH) {
          const chunk = paths.slice(i, i + SIGN_BATCH);
          const { data: signed } = await supabase.storage
            .from(VIDEO_BUCKET)
            .createSignedUrls(chunk, SIGNED_URL_TTL);
          chunk.forEach((_, j) => out.push(signed?.[j]?.signedUrl ?? null));
        }
        return out;
      };
      const withThumb = rows.filter((r) => r.thumb_path);
      const [urls, thumbs] = await Promise.all([
        sign(rows.map((r) => r.storage_path)),
        sign(withThumb.map((r) => r.thumb_path!)),
      ]);
      const thumbById = new Map(withThumb.map((r, i) => [r.id, thumbs[i]]));

      const [{ data: likes }, { data: ad }] = await Promise.all([
        supabase.from("likes").select("video_id").eq("user_id", userId),
        supabase.from("ad_settings").select("link_url,link_label,every_n").eq("id", 1).maybeSingle(),
      ]);
      const adSettings = ad as AdSettings | null;

      const map: Record<string, FeedVideo> = {};
      rows.forEach((r, i) => {
        const shared = r.is_ad ? { link_url: adSettings?.link_url ?? null, link_label: adSettings?.link_label ?? null } : {};
        map[r.id] = { ...r, ...shared, url: urls[i], thumb_url: thumbById.get(r.id) ?? null };
      });

      // Forget deleted videos so the seen list doesn't grow forever.
      const remembered = loadSeen(userId);
      seen.current = new Set([...remembered].filter((id) => map[id]));
      saveSeen(userId, seen.current);

      const regular = rows.filter((r) => !r.is_ad).map((r) => r.id);
      const ads = rows.filter((r) => r.is_ad).map((r) => r.id);
      // With no regular videos, the ads are all there is to watch, so show them as the feed.
      regularIds.current = regular.length ? regular : ads;
      adIds.current = regular.length ? ads : [];
      adEvery.current = Math.max(1, adSettings?.every_n ?? 5);
      // Unseen ads first (newest first), then random cycles.
      adQueue.current = adIds.current.filter((id) => !seen.current.has(id));
      sinceAd.current = 0;
      adCount.current = 0;

      const unseen = regularIds.current.filter((id) => !seen.current.has(id));
      let first = unseen.length ? unseen : shuffle(regularIds.current);

      // A tapped notification can name a video to open first.
      const target = openId.current;
      openId.current = null;
      if (target && map[target]) first = [target, ...first.filter((id) => id !== target)];

      pass.current = 0;
      appendedAt.current = -1;
      setById(map);
      setLiked(new Set((likes ?? []).map((l) => l.video_id)));
      setQueue(withAds(first, 0));
      setActive(0);
      containerRef.current?.scrollTo({ top: 0 });
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Couldn't load videos. Close and reopen the app to retry.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // The service worker posts this when a notification is tapped while the app is already open.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "open-video" && typeof e.data.id === "string") {
        openId.current = e.data.id;
        load();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load]);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > NEW_VISIT_AFTER_MS) {
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  // Re-saving the subscription doubles as a "last seen" heartbeat for the admin's device count.
  useEffect(() => {
    let last = 0;
    const sync = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60 * 1000) return;
      if (pushSupported() && Notification.permission === "granted") {
        last = Date.now();
        subscribeToPush().catch(() => {});
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root, threshold: 0.6 }
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [queue.length]);

  useEffect(() => {
    const id = queue[active]?.id;
    if (id && !seen.current.has(id)) {
      seen.current.add(id);
      saveSeen(userId, seen.current);
    }
  }, [active, queue, userId]);

  // Near the end, append another full pass of every video in a fresh random order.
  useEffect(() => {
    const ids = regularIds.current;
    if (!ids.length || active < queue.length - 3 || appendedAt.current === queue.length) return;
    appendedAt.current = queue.length;

    const next = shuffle(ids);
    const lastId = queue[queue.length - 1]?.id;
    if (next.length > 1 && next[0] === lastId) [next[0], next[1]] = [next[1], next[0]];

    pass.current += 1;
    const entries = withAds(next, pass.current);
    setQueue((q) => [...q, ...entries]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, queue, byId]);

  function applyLike(id: string, value: boolean) {
    setLiked((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
    setById((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], likes_count: Math.max(0, prev[id].likes_count + (value ? 1 : -1)) } } : prev
    );
  }

  async function setLike(id: string, value: boolean) {
    if (pendingLikes.current.has(id) || liked.has(id) === value) return;
    pendingLikes.current.add(id);
    applyLike(id, value);

    const supabase = getSupabase();
    const { error } = value
      ? await supabase.from("likes").insert({ video_id: id, user_id: userId })
      : await supabase.from("likes").delete().eq("video_id", id).eq("user_id", userId);

    // 23505 = already liked (e.g. from another tab), so the optimistic state is correct.
    if (error && error.code !== "23505") {
      console.error(error);
      applyLike(id, !value);
    }
    pendingLikes.current.delete(id);
  }

  return (
    <>
      <div className="topbar">
        <img className="brand wordmark" src="/icons/wordmark" alt="Bopz" />
      </div>

      <div className="feed" ref={containerRef}>
        {loading ? (
          <div className="feed-empty">
            <div className="spinner" />
          </div>
        ) : queue.length === 0 ? (
          <div className="feed-empty">
            <b style={{ color: "#fff", fontSize: 18 }}>{error ? "Something went wrong" : "No videos yet"}</b>
            <span>{error ?? "Check back soon. We'll notify you when something new drops."}</span>
          </div>
        ) : (
          queue.map((entry, i) => {
            const video = byId[entry.id];
            if (!video) return null;
            return (
              <VideoCard
                key={entry.key}
                video={video}
                index={i}
                active={i === active}
                near={Math.abs(i - active) <= 2}
                muted={muted}
                liked={liked.has(video.id)}
                onMutedChange={setMuted}
                onToggleLike={() => setLike(video.id, !liked.has(video.id))}
                onLike={() => setLike(video.id, true)}
                onLinkClick={() => trackLinkClick(video.id)}
              />
            );
          })
        )}
      </div>
    </>
  );
}
