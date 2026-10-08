import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Square app icons, a padded maskable icon for Android, and a cropped wordmark for headers.
const VARIANTS = ["96", "180", "192", "512", "512-maskable", "wordmark"] as const;
type Variant = (typeof VARIANTS)[number];

// The wordmark's bounding box inside the 1024×1024 logo.
const LOGO = 1024;
const MARK = { x: 60, y: 300, w: 920, h: 420 };

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return VARIANTS.map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const variant: Variant = (VARIANTS as readonly string[]).includes(raw) ? (raw as Variant) : "192";
  const logo = await readFile(join(process.cwd(), "app/icons/logo.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;

  if (variant === "wordmark") {
    const width = 360;
    const scale = width / MARK.w;
    const height = Math.round(MARK.h * scale);
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden" }}>
          <img
            src={src}
            width={LOGO * scale}
            height={LOGO * scale}
            style={{ position: "absolute", left: -MARK.x * scale, top: -MARK.y * scale }}
          />
        </div>
      ),
      { width, height }
    );
  }

  const size = variant === "512-maskable" ? 512 : Number(variant);
  // Zoom in so the wordmark fills the icon; the maskable icon keeps Android's safe zone instead.
  const zoom = variant === "512-maskable" ? 0.82 : 1.1;
  const drawn = size * zoom;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#000" }}>
        <img
          src={src}
          width={drawn}
          height={drawn}
          style={{ position: "absolute", left: (size - drawn) / 2, top: (size - drawn) / 2 }}
        />
      </div>
    ),
    { width: size, height: size }
  );
}
