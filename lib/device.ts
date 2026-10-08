export type Platform = "ios" | "android" | "desktop";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function iosMajorVersion(): number | null {
  const match = navigator.userAgent.match(/OS (\d+)_\d+/);
  if (match && /iPhone|iPad|iPod/.test(navigator.userAgent)) return Number(match[1]);
  return null;
}

/**
 * Builds a link that opens in the phone's real browser app instead of the in-app browser
 * panel installed web apps use. iOS needs the x-safari-https scheme (iOS 17+); Android
 * needs an intent:// URL, which falls back to the plain link if nothing handles it.
 */
export function externalHref(url: string): string {
  if (typeof window === "undefined" || !isStandalone()) return url;
  const platform = getPlatform();

  if (platform === "ios") {
    const version = iosMajorVersion();
    // iPads report a desktop user agent without an iOS version; those are on iPadOS 13+.
    if (version !== null && version < 17) return url;
    return url.replace(/^https?:\/\//i, (scheme) => `x-safari-${scheme.toLowerCase()}`);
  }

  if (platform === "android") {
    try {
      const u = new URL(url);
      const scheme = u.protocol.replace(":", "");
      // The fragment is dropped because intent:// URLs use "#Intent" for their parameters.
      return (
        `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${scheme};` +
        `action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;` +
        `S.browser_fallback_url=${encodeURIComponent(url)};end`
      );
    } catch {
      return url;
    }
  }

  return url;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}
