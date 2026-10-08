"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { pushSupported } from "@/lib/push";

// After sign-in, the auth listener in app/page.tsx swaps this screen for the feed,
// and the feed subscribes the device to push if permission was granted.
export default function Onboarding() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);

    // iOS only shows the permission prompt when it's requested directly from a tap,
    // so it must be the first thing this handler does.
    if (pushSupported() && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.warn("Notification permission request failed", err);
      }
    }

    const { error: signInError } = await getSupabase().auth.signInAnonymously();
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <img className="logo" src="/icons/192" alt="" />
      <h1>Welcome to Bopz</h1>
      <p className="lead">
        No email, no password. Tap below to create an anonymous account and start watching. Allow notifications so you
        don&apos;t miss anything.
      </p>
      <button className="btn-primary" onClick={start} disabled={busy}>
        {busy ? "Setting things up…" : "Start Watching"}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
