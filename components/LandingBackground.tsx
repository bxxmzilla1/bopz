"use client";

import { useEffect, useRef, useState } from "react";

export type LandingVideo = { url: string; poster?: string | null };

/** Plays the videos one after another, forever, under a black overlay. */
export default function LandingBackground({ videos, opacity }: { videos: LandingVideo[]; opacity: number }) {
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const current = videos.length ? videos[index % videos.length] : null;

  useEffect(() => {
    setIndex(0);
  }, [videos.map((v) => v.url).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, [current?.url]);

  return (
    <div className="landing-bg" aria-hidden="true">
      {current && (
        <video
          ref={videoRef}
          key={current.url}
          src={current.url}
          poster={current.poster ?? undefined}
          autoPlay
          muted
          playsInline
          loop={videos.length === 1}
          preload="auto"
          onEnded={() => setIndex((i) => (i + 1) % videos.length)}
        />
      )}
      <div className="landing-overlay" style={{ opacity }} />
    </div>
  );
}
