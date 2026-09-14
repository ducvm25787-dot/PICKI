"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const enablePushDev = process.env.NEXT_PUBLIC_ENABLE_PUSH === "true";

    // Local dev: gỡ SW cũ trừ khi test push (NEXT_PUBLIC_ENABLE_PUSH=true).
    if (process.env.NODE_ENV === "development" && !enablePushDev) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      });
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW optional */
    });
  }, []);

  return null;
}
