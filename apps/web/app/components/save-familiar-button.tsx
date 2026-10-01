"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export function SaveFamiliarButton({ locationId }: { locationId: string }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ favorites: { locationId: string }[] }>("/me/favorites")
      .then((res) => {
        if (cancelled) return;
        setSaved(res.favorites.some((row) => row.locationId === locationId));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  async function toggle() {
    setNote(null);
    try {
      if (saved) {
        await api(`/me/favorites/${locationId}`, { method: "DELETE" });
        setSaved(false);
      } else {
        await api("/me/favorites", {
          method: "POST",
          body: JSON.stringify({ locationId }),
        });
        setSaved(true);
      }
    } catch (err: unknown) {
      setNote(err instanceof Error ? err.message : "Đăng nhập để lưu chỗ quen");
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn btn-secondary" disabled={!ready} onClick={() => void toggle()}>
        {saved ? "Đã lưu chỗ quen" : "Lưu chỗ quen"}
      </button>
      {note ? <p className="stat">{note}</p> : null}
    </div>
  );
}
