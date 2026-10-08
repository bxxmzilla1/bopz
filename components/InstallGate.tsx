"use client";

import { useEffect, useState } from "react";
import { getPlatform, type Platform } from "@/lib/device";
import { AddBoxIcon, MenuDotsIcon, ShareIcon } from "./Icons";
import { LandingScreen } from "./LandingBackground";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallGate() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(getPlatform());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  }

  return (
    <LandingScreen>
      <img className="logo" src="/icons/192" alt="" />
      <h1>Get Bopz</h1>

      {installed ? (
        <p className="lead">
          Installed! Open <b>Bopz</b> from your home screen to start watching.
        </p>
      ) : (
        <>
          <p className="lead">
            Videos can only be watched in the app. Add Bopz to your home screen, then open it from there.
          </p>

          {installEvent ? (
            <button className="btn-primary" onClick={install}>
              Add to Home Screen
            </button>
          ) : platform === "ios" ? (
            <>
              <ol className="steps">
                <li>
                  <span className="step-num">1</span>
                  <span>
                    Tap the <b>Share</b> button <ShareIcon className="inline-icon" /> in Safari&apos;s toolbar
                  </span>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <span>
                    Choose <b>Add to Home Screen</b> <AddBoxIcon className="inline-icon" />
                    <span className="step-note">
                      Don&apos;t see it? Tap <b>View More</b> at the bottom of the menu.
                    </span>
                  </span>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <span>
                    Open <b>Bopz</b> from your home screen
                  </span>
                </li>
              </ol>
            </>
          ) : platform === "android" ? (
            <ol className="steps">
              <li>
                <span className="step-num">1</span>
                <span>
                  Tap the browser menu <MenuDotsIcon className="inline-icon" />
                </span>
              </li>
              <li>
                <span className="step-num">2</span>
                <span>
                  Choose <b>Install app</b> or <b>Add to Home screen</b>
                </span>
              </li>
              <li>
                <span className="step-num">3</span>
                <span>
                  Open <b>Bopz</b> from your home screen
                </span>
              </li>
            </ol>
          ) : (
            <p className="hint">
              Open this page on your phone, or use your browser&apos;s <b>Install app</b> option in the address bar.
            </p>
          )}
        </>
      )}
    </LandingScreen>
  );
}
