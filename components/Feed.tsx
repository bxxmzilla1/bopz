"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";
import { pushSupported, subscribeToPush } from "@/lib/push";
import VideoCard, { type FeedVideo } from "./VideoCard";

const PAGE_SIZE = 8;
const SIGNED_URL_TTL = 60 * 60 * 6;

export default function Feed({ userId }: { userId: string }) {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetching = useRef(false);
  const pendingLikes = useRef<Set<string>>(new Set());

  const loadPage = useCallback(async (offset: number) => {
    if (fetching.current) return;
    fetching.current = true;
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("id,title,description,storage_path,likes_count,created_at,link_url,link_label")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;

      const rows = data ?? [];
      setHasMore(rows.length === PAGE_SIZE);
      if (rows.length === 0) return;

      const [signed, likes] = await Promise.all([
        supabase.storage.from(VIDEO_BUCKET).createSignedUrls(
          rows.map((r) => r.storage_path),
          SIGNED_URL_TTL
        ),
        supabase
          .from("likes")
          .select("video_id")
          .eq("user_id", userId)
          .in(
            "video_id",
            rows.map((r) => r.id)
          ),
      ]);

      const page: FeedVideo[] = rows.map((r, i) => ({
        ...r,
        url: signed.data?.[i]?.signedUrl ?? null,
      }));

      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...page.filter((v) => !seen.has(v.id))];
      });
      if (likes.data?.length) {
        setLiked((prev) => {
          const next = new Set(prev);
          likes.data.forEach((l) => next.add(l.video_id));
          return next;
        });
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Couldn't load videos. Pull down or reopen the app to retry.");
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

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
  }, [videos.length]);

  useEffect(() => {
    if (hasMore && videos.length > 0 && active >= videos.length - 3) {
      loadPage(videos.length);
    }
  }, [active, videos.length, hasMore, loadPage]);

  function applyLike(id: string, value: boolean) {
    setLiked((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, likes_count: Math.max(0, v.likes_count + (value ? 1 : -1)) } : v))
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
        ) : videos.length === 0 ? (
          <div className="feed-empty">
            <b style={{ color: "#fff", fontSize: 18 }}>{error ? "Something went wrong" : "No videos yet"}</b>
            <span>{error ?? "Check back soon. We'll notify you when something new drops."}</span>
          </div>
        ) : (
          videos.map((video, i) => (
            <VideoCard
              key={video.id}
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
          ))
        )}
      </div>
    </>
  );
}
