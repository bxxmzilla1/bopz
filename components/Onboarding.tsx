"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { pushSupported } from "@/lib/push";
import { getPlatform, type Platform } from "@/lib/device";
import { LandingScreen } from "./LandingBackground";

type Props = {
  /** True when the visitor already has an account and only needs to turn notifications back on. */
  hasAccount: boolean;
  permission: NotificationPermission | "unsupported";
  onPermissionChange: () => void;
};

// After sign-in with notifications allowed, app/page.tsx swaps this screen for the feed.
export default function Onboarding({ hasAccount, permission, onPermissionChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("desktop");

  useEffect(() => setPlatform(getPlatform()), []);

  async function start() {
    setBusy(true);
    setError(null);

    // iOS only shows the permission prompt when it's requested directly from a tap,
    // so it must be the first thing this handler does.
    let result: NotificationPermission = Notification.permission;
    if (result === "default") {
      try {
        result = await Notification.requestPermission();
      } catch (err) {
        console.warn("Notification permission request failed", err);
      }
    }

    if (result !== "granted") {
      setBusy(false);
      onPermissionChange();
      return;
    }

    if (!hasAccount) {
      const { error: signInError } = await getSupabase().auth.signInAnonymously();
      if (signInError) {
        setError(signInError.message);
        setBusy(false);
        return;
      }
    }
    onPermissionChange();
  }

  if (permission === "unsupported" || !pushSupported()) {
    return (
      <LandingScreen>
        <img className="logo" src="/icons/192" alt="" />
        <h1>Update required</h1>
        <p className="lead">
          Bopz needs notifications, which this device doesn&apos;t support.
          {platform === "ios"
            ? " Update your iPhone to iOS 16.4 or newer, then open Bopz from your home screen."
            : " Try a recent version of Chrome, Edge, Firefox, or Safari."}
        </p>
      </LandingScreen>
    );
  }

  if (permission === "denied") {
    return (
      <LandingScreen>
        <img className="logo" src="/icons/192" alt="" />
        <h1>Turn on notifications</h1>
        <p className="lead">Notifications are required to use Bopz. They&apos;re currently blocked.</p>
        <ol className="steps">
          {platform === "ios" ? (
            <>
              <li>
                <span className="step-num">1</span>
                <span>
                  Open the <b>Settings</b> app
                </span>
              </li>
              <li>
                <span className="step-num">2</span>
                <span>
                  Tap <b>Notifications</b>, then <b>Bopz</b>
                </span>
              </li>
              <li>
                <span className="step-num">3</span>
                <span>
                  Turn on <b>Allow Notifications</b> and come back here
                </span>
              </li>
            </>
          ) : (
            <>
              <li>
                <span className="step-num">1</span>
                <span>
                  Long-press the <b>Bopz</b> icon and tap <b>App info</b>
                </span>
              </li>
              <li>
                <span className="step-num">2</span>
                <span>
                  Tap <b>Notifications</b> and turn them on
                </span>
              </li>
              <li>
                <span className="step-num">3</span>
                <span>Come back to Bopz</span>
              </li>
            </>
          )}
        </ol>
        <button className="btn-primary" onClick={onPermissionChange}>
          I turned them on
        </button>
      </LandingScreen>
    );
  }

  return (
    <LandingScreen>
      <img className="logo" src="/icons/192" alt="" />
      <h1>{hasAccount ? "Turn on notifications" : "Welcome to Bopz"}</h1>
      <p className="lead">
        {hasAccount
          ? "Notifications are required to keep watching. Tap below and choose Allow."
          : "To use Bopz, you must allow notifications. Without them, the app won't work. Tap below and choose Allow when asked."}
      </p>
      <button className="btn-primary" onClick={start} disabled={busy}>
        {busy ? "Setting things up…" : hasAccount ? "Turn On Notifications" : "Allow Notifications & Start"}
      </button>
      {error && <p className="error">{error}</p>}
    </LandingScreen>
  );
}
