"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isContactLiveOnlyShop, isMarketVertical, isPharmacyVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";

type ConversationRow = {
  id: string;
  contextType: string;
  contextId: string;
  title: string;
  lastMessage: {
    body: string;
    createdAt: string;
    attachmentUrls?: string[];
  } | null;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  body: string;
  attachmentUrls?: string[];
  createdAt: string;
  mine: boolean;
};

type ChatConversation = {
  id: string;
  messages: ChatMessage[];
};

export default function ProviderChatsPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const isPharmacy = isPharmacyVertical(activeLocation?.providerType);
  const isMarket = isMarketVertical(activeLocation?.providerType);
  const contactLiveOnly = isContactLiveOnlyShop(activeLocation?.providerType);
  const inquiryContext = isPharmacy ? "PHARMACY" : isMarket ? "MARKET" : null;
  const searchParams = useSearchParams();
  const focusId = searchParams.get("id");

  const [list, setList] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(focusId);
  const [thread, setThread] = useState<ChatConversation | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    if (!inquiryContext) return;
    const res = await api<{ conversations: ConversationRow[] }>("/messages/conversations");
    const rows = res.conversations.filter(
      (c) => c.contextType === inquiryContext && (!locationId || c.contextId === locationId),
    );
    setList(rows);
    if (!activeId && rows[0]) {
      setActiveId(rows[0].id);
    }
  }, [inquiryContext, locationId, activeId]);

  const loadThread = useCallback(async (id: string) => {
    const data = await api<ChatConversation>(`/messages/conversations/${id}`);
    setThread(data);
  }, []);

  useEffect(() => {
    void loadList().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Lỗi tải hộp thư");
    });
  }, [loadList]);

  useEffect(() => {
    if (focusId) setActiveId(focusId);
  }, [focusId]);

  useEffect(() => {
    if (!activeId) return;
    void loadThread(activeId);
    const t = setInterval(() => void loadThread(activeId), 8000);
    return () => clearInterval(t);
  }, [activeId, loadThread]);

  async function sendReply() {
    if (!activeId || !reply.trim()) return;
    setBusy(true);
    try {
      await api(`/messages/conversations/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      await loadThread(activeId);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được");
    } finally {
      setBusy(false);
    }
  }

  if (!contactLiveOnly) {
    return (
      <ProviderPageShell title="Hỏi hàng">
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Tab này dành cho nhà thuốc / tạp hóa — nhận câu hỏi kèm ảnh từ khách trong Zone.
          </p>
        </div>
      </ProviderPageShell>
    );
  }

  return (
    <ProviderPageShell title="Hỏi hàng">
      {error ? (
        <p className="stat" style={{ color: "#c0392b", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {list.length === 0 ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Chưa có khách hỏi thuốc. Khi khách gửi tin + ảnh từ trang nhà thuốc, tin hiện ở đây và
            chuông thông báo trên Picki (không tự mở Zalo).
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="card">
            <p className="section-title">Hội thoại</p>
            <div className="provider-list">
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="provider-card"
                  style={{
                    textAlign: "left",
                    width: "100%",
                    border:
                      activeId === c.id ? "2px solid var(--accent, #e85d04)" : undefined,
                    cursor: "pointer",
                    background: "transparent",
                  }}
                  onClick={() => {
                    setActiveId(c.id);
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{c.title}</strong>
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    {c.lastMessage?.body ?? "—"}
                    {(c.lastMessage?.attachmentUrls?.length ?? 0) > 0
                      ? ` · ${String(c.lastMessage!.attachmentUrls!.length)} ảnh`
                      : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {thread ? (
            <div className="card">
              <p className="section-title">Chi tiết</p>
              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {thread.messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.mine ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: 12,
                      background: m.mine ? "#e85d04" : "#e8edf3",
                      color: m.mine ? "#fff" : "#1a1a1a",
                    }}
                  >
                    {m.body && m.body !== "(kèm ảnh)" ? (
                      <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 14 }}>{m.body}</p>
                    ) : null}
                    {(m.attachmentUrls ?? []).map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt=""
                        style={{
                          width: 80,
                          height: 80,
                          objectFit: "cover",
                          borderRadius: 8,
                          marginTop: 6,
                          display: "block",
                        }}
                      />
                    ))}
                    <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.8 }}>
                      {new Date(m.createdAt).toLocaleString("vi-VN")}
                    </p>
                  </div>
                ))}
              </div>
              <textarea
                value={reply}
                rows={2}
                placeholder="Trả lời khách…"
                onChange={(e) => {
                  setReply(e.target.value);
                }}
                style={{ width: "100%", marginBottom: 8, padding: 10 }}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || !reply.trim()}
                onClick={() => void sendReply()}
              >
                {busy ? "Đang gửi…" : "Gửi trả lời"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </ProviderPageShell>
  );
}
