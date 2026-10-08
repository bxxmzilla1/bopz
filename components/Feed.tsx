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
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("id,title,description,storage_path,likes_count,created_at,link_url,link_label")
        .order("created_at", { ascending: false })
        .limit(CATALOG_LIMIT);
      if (error) throw error;
      const rows = data ?? [];

      const urls: (string | null)[] = [];
      for (let i = 0; i < rows.length; i += SIGN_BATCH) {
        const chunk = rows.slice(i, i + SIGN_BATCH);
        const { data: signed } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrls(
          chunk.map((r) => r.storage_path),
          SIGNED_URL_TTL
        );
        chunk.forEach((_, j) => urls.push(signed?.[j]?.signedUrl ?? null));
      }

      const { data: likes } = await supabase.from("likes").select("video_id").eq("user_id", userId);

      const map: Record<string, FeedVideo> = {};
      rows.forEach((r, i) => (map[r.id] = { ...r, url: urls[i] }));

      // Forget deleted videos so the seen list doesn't grow forever.
      const remembered = loadSeen(userId);
      seen.current = new Set([...remembered].filter((id) => map[id]));
      saveSeen(userId, seen.current);

      const unseen = rows.map((r) => r.id).filter((id) => !seen.current.has(id));
      const first = unseen.length ? unseen : shuffle(rows.map((r) => r.id));

      pass.current = 0;
      appendedAt.current = -1;
      setById(map);
      setLiked(new Set((likes ?? []).map((l) => l.video_id)));
      setQueue(first.map((id) => ({ key: `0-${id}`, id })));
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
      if (document.visibilityState !== "visible" || Date.now() - last < 10 * 60 * 1000) return;
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
    const ids = Object.keys(byId);
    if (!ids.length || active < queue.length - 3 || appendedAt.current === queue.length) return;
    appendedAt.current = queue.length;

    const next = shuffle(ids);
    const lastId = queue[queue.length - 1]?.id;
    if (next.length > 1 && next[0] === lastId) [next[0], next[1]] = [next[1], next[0]];

    pass.current += 1;
    const p = pass.current;
    setQueue((q) => [...q, ...next.map((id) => ({ key: `${p}-${id}`, id }))]);
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
        <span className="brand">Bopz</span>
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
              />
            );
          })
        )}
      </div>
    </>
  );
}
