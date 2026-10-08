"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { isStandalone } from "@/lib/device";
import InstallGate from "@/components/InstallGate";
import Onboarding from "@/components/Onboarding";
import Feed from "@/components/Feed";

type Phase = { name: "loading" } | { name: "install" } | { name: "onboard" } | { name: "feed"; userId: string };

// Lets you test the full flow in a normal browser tab while running `npm run dev`.
const ALLOW_BROWSER = process.env.NODE_ENV === "development";

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });

  useEffect(() => {
    if (!isStandalone() && !ALLOW_BROWSER) {
      setPhase({ name: "install" });
      return;
    }

    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setPhase(user ? { name: "feed", userId: user.id } : { name: "onboard" });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setPhase({ name: "feed", userId: session.user.id });
      else setPhase({ name: "onboard" });
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (phase.name === "loading") {
    return (
      <main className="screen">
        <div className="spinner" />
      </main>
    );
  }
  if (phase.name === "install") return <InstallGate />;
  if (phase.name === "onboard") return <Onboarding />;
  return <Feed key={phase.userId} userId={phase.userId} />;
}
