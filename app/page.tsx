"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { isStandalone } from "@/lib/device";
import { pushSupported, removeOwnSubscriptions } from "@/lib/push";
import InstallGate from "@/components/InstallGate";
import Onboarding from "@/components/Onboarding";
import Feed from "@/components/Feed";

type Permission = NotificationPermission | "unsupported";

// Lets you test the full flow in a normal browser tab while running `npm run dev`.
const ALLOW_BROWSER = process.env.NODE_ENV === "development";

function readPermission(): Permission {
  return pushSupported() ? Notification.permission : "unsupported";
}

export default function Home() {
  const [standalone, setStandalone] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [permission, setPermission] = useState<Permission>("default");

  const refreshPermission = useCallback(() => setPermission(readPermission()), []);

  useEffect(() => {
    const ok = isStandalone() || ALLOW_BROWSER;
    setStandalone(ok);
    if (!ok) return;

    refreshPermission();
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    // Pick up changes made in the phone's Settings while the app was in the background.
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshPermission();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshPermission);

    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: "notifications" })
      .then((s) => {
        status = s;
        s.onchange = refreshPermission;
      })
      .catch(() => {});

    return () => {
      listener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshPermission);
      if (status) status.onchange = null;
    };
  }, [refreshPermission]);

  useEffect(() => {
    if (userId && (permission === "denied" || permission === "unsupported")) {
      removeOwnSubscriptions().catch(() => {});
    }
  }, [userId, permission]);

  if (standalone === null || (standalone && userId === undefined)) {
    return (
      <main className="screen">
        <div className="spinner" />
      </main>
    );
  }
  if (!standalone) return <InstallGate />;

  if (!userId || permission !== "granted") {
    return <Onboarding hasAccount={!!userId} permission={permission} onPermissionChange={refreshPermission} />;
  }
  return <Feed key={userId} userId={userId} />;
}
