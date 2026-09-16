"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  ClassifiedPhotoPicker,
  type ClassifiedPhoto,
} from "./classified-photo-picker";

type ChatMessage = {
  id: string;
  senderUserId: string;
  body: string;
  attachmentUrls?: string[];
  createdAt: string;
  mine: boolean;
  senderRole?: string | null;
};

type ChatConversation = {
  id: string;
  messages: ChatMessage[];
};

type Props = {
  locationId: string;
};

const BUBBLE = {
  mine: {
    row: { justifyContent: "flex-end" as const },
    bubble: {
      background: "#e85d04",
      border: "1px solid #dc2f02",
      color: "#fff",
      borderRadius: "14px 14px 4px 14px",
    },
  },
  theirs: {
    row: { justifyContent: "flex-start" as const },
    bubble: {
      background: "#e8edf3",
      border: "1px solid #b8c4d4",
      color: "#1a1a1a",
      borderRadius: "14px 14px 14px 4px",
    },
  },
};

export function PharmacyInquiry({ locationId }: Props) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<ClassifiedPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ChatConversation>(`/messages/pharmacies/${locationId}`);
      setConversation(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được hội thoại");
    }
  }, [locationId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  async function send() {
    const body = text.trim();
    const photoUrls = photos.map((p) => p.url);
    if (!body && photoUrls.length === 0) {
      setError("Nhập câu hỏi hoặc kèm ảnh thuốc/sản phẩm");
      return;
    }
    setSending(true);
    setError(null);
    try {
      let conv = conversation;
      if (!conv) {
        conv = await api<ChatConversation>(`/messages/pharmacies/${locationId}`);
        setConversation(conv);
      }
      await api(`/messages/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: body || undefined,
          photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
        }),
      });
      setText("");
      setPhotos([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="section-title">Hỏi nhà thuốc</p>
      <p className="stat" style={{ margin: "0 0 12px" }}>
        Gửi tin + ảnh (tối đa 3) — ví dụ &quot;Mình có thuốc/sản phẩm này không?&quot; Nhà thuốc nhận
        trong Picki (chuông thông báo), trả lời ngay tại đây. Không nhảy sang Zalo.
      </p>

      {conversation && conversation.messages.length > 0 ? (
        <div
          style={{
            maxHeight: 280,
            overflowY: "auto",
            marginBottom: 12,
            padding: "4px 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {conversation.messages.map((m) => {
            const style = m.mine ? BUBBLE.mine : BUBBLE.theirs;
            return (
              <div key={m.id} style={{ display: "flex", ...style.row }}>
                <div style={{ ...style.bubble, padding: "8px 12px", maxWidth: "85%" }}>
                  {m.body && m.body !== "(kèm ảnh)" ? (
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 14 }}>{m.body}</p>
                  ) : null}
                  {(m.attachmentUrls ?? []).length > 0 ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {m.attachmentUrls!.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url}
                          src={url}
                          alt=""
                          style={{
                            width: 72,
                            height: 72,
                            objectFit: "cover",
                            borderRadius: 8,
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                  <p className="stat" style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.8 }}>
                    {new Date(m.createdAt).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.mine ? "" : " · Nhà thuốc"}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      ) : null}

      <label className="field">
        <span>Tin nhắn</span>
        <textarea
          value={text}
          rows={3}
          maxLength={2000}
          placeholder="VD: Nhà thuốc còn Panadol không? / Có sữa Ensure này không?"
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>

      <div className="field">
        <ClassifiedPhotoPicker photos={photos} onChange={setPhotos} disabled={sending} />
      </div>

      {error ? (
        <p className="stat" style={{ color: "#c0392b", marginBottom: 8 }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="btn"
        disabled={sending}
        onClick={() => void send()}
      >
        {sending ? "Đang gửi…" : "Gửi cho nhà thuốc"}
      </button>
    </div>
  );
}
