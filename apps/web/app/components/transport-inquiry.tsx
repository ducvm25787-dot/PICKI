"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

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
  /** Prefill từ nút dịch vụ (vd. sân bay) */
  draftPrefill?: string | null;
  /** Đổi khi bấm lại cùng dịch vụ để re-apply draft */
  draftKey?: number;
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

export function TransportInquiry({ locationId, draftPrefill, draftKey = 0 }: Props) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ChatConversation>(`/messages/transport/${locationId}`);
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
    if (draftPrefill && draftKey > 0) {
      setText(draftPrefill);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [draftPrefill, draftKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  async function send() {
    const body = text.trim();
    if (!body) {
      setError("Nhập tin nhắn — giờ đón, điểm đến, số người…");
      return;
    }
    setSending(true);
    setError(null);
    try {
      let conv = conversation;
      if (!conv) {
        conv = await api<ChatConversation>(`/messages/transport/${locationId}`);
        setConversation(conv);
      }
      await api(`/messages/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được");
    } finally {
      setSending(false);
    }
  }

  return (
    <div id="transport-chat" className="card" style={{ marginBottom: 16 }}>
      <p className="section-title">Nhắn nhà xe</p>
      <p className="stat" style={{ margin: "0 0 12px" }}>
        Gửi tin trong Pickee — giờ đón, điểm đến, số chỗ. Nhà xe nhận chuông thông báo và trả lời
        tại đây (không nhảy Zalo).
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
                  {m.body ? (
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 14 }}>{m.body}</p>
                  ) : null}
                  <p className="stat" style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.8 }}>
                    {new Date(m.createdAt).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.mine ? "" : " · Nhà xe"}
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
          ref={textareaRef}
          value={text}
          rows={3}
          maxLength={2000}
          placeholder="VD: Mai 5h sáng đón CT12 đi Nội Bài, 3 người…"
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>

      {error ? (
        <p className="stat" style={{ color: "#c0392b", marginBottom: 8 }}>
          {error}
        </p>
      ) : null}

      <button type="button" className="btn" disabled={sending} onClick={() => void send()}>
        {sending ? "Đang gửi…" : "Gửi tin nhắn"}
      </button>
    </div>
  );
}
