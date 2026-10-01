"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isMarketVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";

type StockStatus = "UNSET" | "AVAILABLE" | "SOLD_OUT" | "HIDDEN" | string;

type SellItem = {
  offeringId: string;
  name: string;
  imageUrl: string | null;
  priceVnd: number;
  priceOverrideVnd: number | null;
  status: StockStatus;
  remaining: number | null;
  featured?: boolean;
};

type MenuItem = {
  id: string;
  offeringId: string | null;
  name: string;
  status: string;
  remaining: number | null;
  selfCook: boolean;
  shared: boolean;
};

type Board = {
  date: string;
  orders: { fresh: number; cooking: number; waitingRunner: number };
  sellNow: SellItem[];
  sellNowEnabled: boolean;
  breakfast: { serviceDate: string | null; items: MenuItem[] } | null;
  lunch: { serviceDate: string | null; items: MenuItem[] } | null;
  dinner: { serviceDate: string | null; items: MenuItem[] } | null;
};

function qtyLabel(status: string, remaining: number | null, unsetLabel = "Không giới hạn") {
  if (status === "HIDDEN" || status === "PAUSED") return "Ẩn hôm nay";
  if (status === "SOLD_OUT" || remaining === 0) return "Hết";
  if (remaining == null || status === "UNSET") return unsetLabel;
  return `${remaining} còn`;
}

export default function ProviderBoardPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const market = isMarketVertical(activeLocation?.providerType);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!locationId) return;
    const next = await api<Board>(`/provider/locations/${locationId}/board`);
    setBoard(next);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [load]);

  async function run(path: string, body: unknown, ok: string) {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api<Board | { copied: number; sourceDate: string | null; board: Board }>(
        `/provider/locations/${locationId}${path}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if ("board" in res) {
        setBoard(res.board);
        setNote(
          res.copied > 0
            ? `Đã lấy số lượng từ ${res.sourceDate}. ${res.copied} món.`
            : "Chưa có ngày trước để dùng lại. Đặt số trên từng món.",
        );
      } else {
        setBoard(res);
        setNote(ok);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProviderPageShell title="Hôm nay">
      <h1 className="section-title">Hôm nay</h1>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {note ? <p style={{ color: "#2d6a4f" }}>{note}</p> : null}
      {!board ? <p className="tagline">Đang tải…</p> : null}
      {board ? (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong>{board.orders.fresh}</strong> đơn mới · <strong>{board.orders.cooking}</strong>{" "}
              {market ? "đang soạn" : "đang làm"} ·{" "}
              <strong>{board.orders.waitingRunner}</strong> chờ runner
            </p>
            <div className="board-row">
              <Link href="/provider" className="btn btn-secondary">
                Xem đơn
              </Link>
              <Link href="/provider/live" className="btn btn-secondary">
                {market ? "Trạng thái cửa hàng" : "Trạng thái quán"}
              </Link>
            </div>
          </div>

          <div className="board-row" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void run("/board/copy", {}, "")}
            >
              Chép số lượng hôm qua
            </button>
          </div>

          {board.sellNowEnabled ? (
            <section style={{ marginBottom: 18 }}>
              <h2 className="section-title">{market ? "Hôm nay bán" : "Bán ngay"}</h2>
              {board.sellNow.length === 0 ? (
                <p className="tagline">
                  {market ? "Chưa có sản phẩm. " : "Chưa có món. "}
                  <Link href="/provider/products">{market ? "Thêm sản phẩm" : "Thêm món"}</Link>
                </p>
              ) : (
                board.sellNow.map((item) => (
                  <article key={item.offeringId} className="card" style={{ marginBottom: 8 }}>
                    <strong>{item.name}</strong>
                    <p style={{ margin: "4px 0 8px" }}>
                      {formatVnd(item.priceOverrideVnd ?? item.priceVnd)} ·{" "}
                      {qtyLabel(item.status, item.remaining, market ? "Chưa mở bán hôm nay" : "Không giới hạn")}
                      {item.priceOverrideVnd != null ? ` · giá gốc ${formatVnd(item.priceVnd)}` : ""}
                    </p>
                    <TodayPrice
                      item={item}
                      busy={busy}
                      onSave={(priceVnd) =>
                        run("/board/stock", { offeringId: item.offeringId, action: "price", priceVnd }, "Đã lưu giá hôm nay")
                      }
                    />
                    <div className="board-row">
                      <AddQty
                        busy={busy}
                        onAdd={(quantity) =>
                          run(
                            "/board/stock",
                            { offeringId: item.offeringId, action: "add", quantity },
                            "Đã bổ sung",
                          )
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void run("/board/stock", { offeringId: item.offeringId, action: "sold_out" }, "Đã báo hết")
                        }
                      >
                        Hết
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            "/board/stock",
                            {
                              offeringId: item.offeringId,
                              action: item.status === "HIDDEN" ? "show" : "hide",
                            },
                            item.status === "HIDDEN" ? "Đã bật lại" : "Đã ẩn hôm nay",
                          )
                        }
                      >
                        {item.status === "HIDDEN" ? "Bật lại" : "Ẩn hôm nay"}
                      </button>
                      {market ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              "/board/stock",
                              { offeringId: item.offeringId, action: item.featured ? "unfeature" : "feature" },
                              item.featured ? "Đã bỏ nổi bật" : "Đã đẩy nổi bật",
                            )
                          }
                        >
                          {item.featured ? "Bỏ nổi bật" : "Nổi bật"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </section>
          ) : null}

          <MenuSection
            title="Ăn sáng"
            section={board.breakfast}
            busy={busy}
            channel="breakfast"
            onRun={run}
          />
          <MenuSection
            title="Bữa trưa"
            section={board.lunch}
            busy={busy}
            channel="lunch"
            onRun={run}
          />
          <MenuSection
            title="Bữa tối"
            section={board.dinner}
            busy={busy}
            channel="dinner"
            onRun={run}
          />
        </>
      ) : null}
    </ProviderPageShell>
  );
}

function TodayPrice({
  item,
  busy,
  onSave,
}: {
  item: SellItem;
  busy: boolean;
  onSave: (priceVnd: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(item.priceOverrideVnd != null ? String(item.priceOverrideVnd) : "");
  useEffect(() => {
    setValue(item.priceOverrideVnd != null ? String(item.priceOverrideVnd) : "");
  }, [item.priceOverrideVnd]);
  return (
    <div className="board-row" style={{ marginBottom: 8 }}>
      <label className="field" style={{ margin: 0, minWidth: 120 }}>
        <span>Giá hôm nay</span>
        <input
          inputMode="numeric"
          value={value}
          placeholder="Giữ giá gốc"
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => {
          const digits = value.replace(/\D/g, "");
          void onSave(digits ? Number(digits) : null);
        }}
      >
        Lưu giá
      </button>
    </div>
  );
}

function AddQty({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (quantity: number) => Promise<void>;
}) {
  const [qty, setQty] = useState("1");
  const parsed = Number(qty);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 500;

  function bump(delta: number) {
    const base = valid ? parsed : 1;
    setQty(String(Math.min(500, Math.max(1, base + delta))));
  }

  return (
    <div className="qty-stepper">
      <button type="button" className="btn btn-secondary" aria-label="Giảm" disabled={busy} onClick={() => bump(-1)}>
        −
      </button>
      <input
        type="number"
        min={1}
        max={500}
        inputMode="numeric"
        aria-label="Số lượng bổ sung"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <button type="button" className="btn btn-secondary" aria-label="Tăng" disabled={busy} onClick={() => bump(1)}>
        +
      </button>
      <button
        type="button"
        className="btn"
        disabled={busy || !valid}
        onClick={() => void onAdd(parsed)}
      >
        Bổ sung
      </button>
    </div>
  );
}

function MenuSection({
  title,
  section,
  busy,
  channel,
  onRun,
}: {
  title: string;
  section: Board["breakfast"];
  busy: boolean;
  channel: "breakfast" | "lunch" | "dinner";
  onRun: (path: string, body: unknown, ok: string) => Promise<void>;
}) {
  if (!section) return null;
  return (
    <section style={{ marginBottom: 18 }}>
      <h2 className="section-title">
        {title}
        {section.serviceDate ? ` · ${section.serviceDate}` : ""}
      </h2>
      <p className="tagline">Suất riêng của kênh này, chưa trừ kho bán ngay.</p>
      {section.items.length === 0 ? (
        <p className="tagline">Chưa có menu đã đăng.</p>
      ) : (
        section.items.map((item) => (
          <article key={item.id} className="card" style={{ marginBottom: 8 }}>
            <strong>{item.name}</strong>
            <p style={{ margin: "4px 0 8px" }}>
              {qtyLabel(item.status, item.remaining)}
              {item.selfCook ? " · Nấu sẵn / Tự nấu" : ""}
            </p>
            <div className="board-row">
              <AddQty
                busy={busy}
                onAdd={(quantity) =>
                  onRun(
                    "/board/menu-stock",
                    { channel, menuItemId: item.id, action: "add", quantity },
                    "Đã bổ sung",
                  )
                }
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  void onRun("/board/menu-stock", { channel, menuItemId: item.id, action: "sold_out" }, "Đã báo hết")
                }
              >
                Hết
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  void onRun(
                    "/board/menu-stock",
                    {
                      channel,
                      menuItemId: item.id,
                      action: item.status === "PAUSED" || item.status === "HIDDEN" ? "show" : "hide",
                    },
                    "Đã cập nhật",
                  )
                }
              >
                {item.status === "PAUSED" || item.status === "HIDDEN" ? "Bật lại" : "Ẩn hôm nay"}
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
