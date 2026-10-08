import { getSupabase, VIDEO_BUCKET } from "./supabase";

/** Grabs the first frame of a video as a small JPEG so it matches where playback starts. Returns null if the browser can't decode it. */
export function captureThumbnail(src: string, { crossOrigin = false, width = 360 } = {}): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let done = false;
    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };
    const timer = window.setTimeout(() => finish(null), 20_000);

    if (crossOrigin) video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      video.currentTime = 0.001;
    };
    video.onseeked = () => {
      const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 16 / 9;
      const w = Math.min(width, video.videoWidth || width);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = Math.round(w * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return finish(null);
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.78);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    video.src = src;
  });
}

export async function uploadThumbnail(path: string, blob: Blob): Promise<boolean> {
  const { error } = await getSupabase()
    .storage.from(VIDEO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
  return !error;
}

// The "_f0" suffix marks first-frame thumbnails; older mid-video ones get regenerated.
export const thumbPathFor = (videoPath: string) => `thumbs/${videoPath.replace(/\.[^.]+$/, "")}_f0.jpg`;
export const isCurrentThumb = (thumbPath?: string | null) => !!thumbPath && thumbPath.endsWith("_f0.jpg");
