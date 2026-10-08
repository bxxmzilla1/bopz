"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { externalHref, formatCount } from "@/lib/device";
import { HeartIcon, PlayIcon, SoundOffIcon, SoundOnIcon } from "./Icons";

export type FeedVideo = {
  id: string;
  title: string | null;
  description: string | null;
  storage_path: string;
  likes_count: number;
  created_at: string;
  link_url: string | null;
  link_label: string | null;
  thumb_path?: string | null;
  url: string | null;
  thumb_url?: string | null;
};

type Props = {
  video: FeedVideo;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  liked: boolean;
  onMutedChange: (muted: boolean) => void;
  onToggleLike: () => void;
  onLike: () => void;
  onLinkClick: () => void;
};

type Burst = { key: number; x: number; y: number };

const DOUBLE_TAP_MS = 260;

export default function VideoCard({
  video,
  index,
  active,
  near,
  muted,
  liked,
  onMutedChange,
  onToggleLike,
  onLike,
  onLinkClick,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tapTimer = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [frameShown, setFrameShown] = useState(false);
  const src = near && video.url ? video.url : undefined;

  useEffect(() => {
    setFrameShown(false);
  }, [src]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // "playing" can fire before anything is painted (black flash on iOS), and the first frames can
  // stutter while decoding warms up, so keep the thumbnail until a couple of frames have advanced.
  function handlePlaying() {
    const el = videoRef.current;
    if (!el || frameShown) return;
    if (!("requestVideoFrameCallback" in el)) {
      setFrameShown(true);
      return;
    }
    let frames = 0;
    const onFrame = () => {
      frames += 1;
      if (frames >= 2) setFrameShown(true);
      else el.requestVideoFrameCallback(onFrame);
    };
    el.requestVideoFrameCallback(onFrame);
  }

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!active) {
      el.pause();
      return;
    }
    el.muted = muted;
    setPaused(false);
    if (!frameShown && el.currentTime > 0) el.currentTime = 0;
    el.play().catch(() => {
      // Browsers block unmuted autoplay without a recent tap; fall back to muted.
      el.muted = true;
      onMutedChange(true);
      el.play().catch(() => setPaused(true));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, video.url]);

  useEffect(() => () => {
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
  }, []);

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPaused(false);
    } else {
      el.pause();
      setPaused(true);
    }
  }

  function handleTap(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = null;
      const key = Date.now() + Math.random();
      setBursts((b) => [...b, { key, x, y }]);
      window.setTimeout(() => setBursts((b) => b.filter((item) => item.key !== key)), 850);
      onLike();
      return;
    }

    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null;
      const el = videoRef.current;
      if (muted && el && !el.paused) {
        el.muted = false;
        onMutedChange(false);
      } else {
        togglePlay();
      }
    }, DOUBLE_TAP_MS);
  }

  return (
    <section className="slide" data-index={index}>
      <video
        ref={videoRef}
        src={src}
        poster={near ? video.thumb_url ?? undefined : undefined}
        loop
        playsInline
        muted
        preload={near ? "auto" : "none"}
        disablePictureInPicture
        controls={false}
        onPlaying={handlePlaying}
      />
      {near && video.thumb_url && (
        <img className={frameShown ? "slide-thumb hidden" : "slide-thumb"} src={video.thumb_url} alt="" decoding="async" />
      )}

      <div className="tap-layer" onClick={handleTap}>
        {bursts.map((b) => (
          <div key={b.key} style={{ position: "absolute", left: b.x, top: b.y }}>
            <HeartIcon className="burst" />
          </div>
        ))}
      </div>

      {paused && <PlayIcon className="paused-icon" />}

      {(video.title || video.description) && <div className="shade" />}

      {(video.title || video.description) && (
        <div className={video.link_url ? "caption has-cta" : "caption"}>
          {video.title && <h2>{video.title}</h2>}
          {video.description && <p>{video.description}</p>}
        </div>
      )}

      {video.link_url && (
        <div className="cta-wrap">
          <a
            className="cta"
            href={video.link_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              onLinkClick();
              const href = externalHref(video.link_url!);
              if (href !== video.link_url) {
                e.preventDefault();
                window.location.href = href;
              }
            }}
          >
            {video.link_label || "Open"}
          </a>
        </div>
      )}

      <div className="rail">
        <button className="rail-btn" onClick={onToggleLike} aria-label={liked ? "Unheart" : "Heart"} aria-pressed={liked}>
          <HeartIcon className={liked ? "heart-on" : undefined} />
          <span>{formatCount(video.likes_count)}</span>
        </button>
        <button
          className="rail-btn small"
          onClick={() => onMutedChange(!muted)}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
      </div>
    </section>
  );
}
