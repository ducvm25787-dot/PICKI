"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type ChatMessage = {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  mine: boolean;
  senderRole?: "SELLER" | "BUYER" | null;
};

type ChatConversation = {
  id: string;
  messages: ChatMessage[];
};

type Props = {
  listingId: string;
  compact?: boolean;
};

function senderLabel(role: ChatMessage["senderRole"]): string | null {
  switch (role) {
    case "SELLER":
      return "Người đăng";
    case "BUYER":
      return "Bạn";
    default:
      return null;
  }
}

const BUBBLE_STYLE = {
  mine: {
    row: { justifyContent: "flex-end" as const },
    bubble: {
      background: "#e85d04",
      border: "1px solid #dc2f02",
      color: "#fff",
      borderRadius: "14px 14px 4px 14px",
    },
    time: { color: "rgba(255, 255, 255, 0.78)" },
  },
  theirs: {
    row: { justifyContent: "flex-start" as const },
    bubble: {
      background: "#e8edf3",
      border: "1px solid #b8c4d4",
      color: "#1a1a1a",
      borderRadius: "14px 14px 14px 4px",
    },
    time: { color: "#64748b" },
  },
};

export function ClassifiedChat({ listingId, compact = false }: Props) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ChatConversation>(`/messages/classifieds/${listingId}`);
      setConversation(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được chat");
    }
  }, [listingId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!conversation || !text.trim()) return;
    setSending(true);
    try {
      await api(`/messages/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text.trim() }),
      });
      setText("");
      await load();
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <div className={compact ? "order-chat compact" : "order-chat"}>
        <p className="stat">{error}</p>
      </div>
    );
  }

  return (
    <div className={compact ? "order-chat compact" : "order-chat"}>
      {!compact ? <p className="section-title">Chat liên hệ</p> : null}
      <div className="order-chat-messages">
        {!conversation || conversation.messages.length === 0 ? (
          <p className="stat">Chưa có tin nhắn. Hỏi về đồ hoặc hẹn lấy tại đây.</p>
        ) : (
          conversation.messages.map((m) => {
            const side = m.mine ? "mine" : "theirs";
            const styles = BUBBLE_STYLE[side];
            const label = side === "theirs" ? senderLabel(m.senderRole) : null;
            return (
              <div
                key={m.id}
                className={`order-chat-row ${side}`}
                style={{ display: "flex", width: "100%", ...styles.row }}
              >
                <div
                  className={`order-chat-bubble ${side}`}
                  style={{
                    maxWidth: "78%",
                    padding: "8px 12px",
                    lineHeight: 1.4,
                    ...styles.bubble,
                  }}
                >
                  {label ? <span className="order-chat-sender">{label}</span> : null}
                  <p style={{ margin: "0 0 4px", fontSize: 14 }}>{m.body}</p>
                  <time
                    dateTime={m.createdAt}
                    style={{
                      display: "block",
                      fontSize: 10,
                      textAlign: "right",
                      ...styles.time,
                    }}
                  >
                    {new Date(m.createdAt).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form className="order-chat-form" onSubmit={(e) => void send(e)}>
        <input
          type="text"
          value={text}
          maxLength={2000}
          placeholder="Nhắn tin…"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn" disabled={sending || !text.trim()} style={{ width: "auto" }}>
          {sending ? "…" : "Gửi"}
        </button>
      </form>
    </div>
  );
}
