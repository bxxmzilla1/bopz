"use client";

import { useEffect, useRef, useState } from "react";

export type LandingVideo = { url: string; poster?: string | null };
type Background = { videos: LandingVideo[]; opacity: number };

/** The background the admin picked in Settings, or null when none is set. */
export function useLandingBackground(): Background | null {
  const [background, setBackground] = useState<Background | null>(null);
  useEffect(() => {
    fetch("/api/landing")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.videos) && data.videos.length) setBackground(data);
      })
      .catch(() => {});
  }, []);
  return background;
}

/** A full-screen `.screen` that shows the landing background behind its content when one is set. */
export function LandingScreen({ children }: { children: React.ReactNode }) {
  const background = useLandingBackground();
  return (
    <main className={background ? "screen landing" : "screen"}>
      {background && <LandingBackground videos={background.videos} opacity={background.opacity} />}
      {children}
    </main>
  );
}

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
