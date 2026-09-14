"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type ChatMessage = {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

type ChatConversation = {
  id: string;
  messages: ChatMessage[];
};

type Props = {
  orderId: string;
  /** API path prefix — customer uses /messages/orders, provider/runner same */
  compact?: boolean;
};

export function OrderChat({ orderId, compact = false }: Props) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ChatConversation>(`/messages/orders/${orderId}`);
      setConversation(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được chat");
    }
  }, [orderId]);

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
      {!compact ? <p className="section-title">Chat đơn hàng</p> : null}
      <div className="order-chat-messages">
        {!conversation || conversation.messages.length === 0 ? (
          <p className="stat">Chưa có tin nhắn. Hỏi quán hoặc runner tại đây.</p>
        ) : (
          conversation.messages.map((m) => (
            <div
              key={m.id}
              className={m.mine ? "order-chat-bubble mine" : "order-chat-bubble"}
            >
              <p>{m.body}</p>
              <time dateTime={m.createdAt}>
                {new Date(m.createdAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))
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
