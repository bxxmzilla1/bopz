"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
