"use client";

import { useEffect } from "react";

// Registers /sw.js in production builds. In development the worker is removed
// instead: dev chunk URLs aren't content-hashed, so a cache-first worker left
// over from a `next start` on the same origin would serve stale code.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.warn("[sw] registration failed; the app still works without it", err));
  }, []);

  return null;
}
