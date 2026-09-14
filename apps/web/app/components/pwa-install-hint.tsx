"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaInstallHintProps = {
  storageKey?: string;
  message?: string;
  variant?: "customer" | "provider" | "runner";
};

export function PwaInstallHint({
  storageKey = "picki-pwa-dismiss",
  message = "Cài Picki lên màn hình chính để mở nhanh như app.",
  variant = "customer",
}: PwaInstallHintProps) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "1") setDismissed(true);

    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [storageKey]);

  if (dismissed || !deferred) return null;

  async function install() {
    const prompt = deferred;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setDeferred(null);
  }

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
    setDeferred(null);
  }

  const hintClass =
    variant === "provider"
      ? "pwa-install-hint provider-install-hint"
      : variant === "runner"
        ? "pwa-install-hint runner-install-hint"
        : "pwa-install-hint";

  return (
    <div className={hintClass}>
      <p>{message}</p>
      <div className="pwa-install-actions">
        <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={() => void dismiss()}>
          Để sau
        </button>
        <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void install()}>
          Cài đặt
        </button>
      </div>
    </div>
  );
}
