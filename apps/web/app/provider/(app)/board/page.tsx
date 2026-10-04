"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isFoodBreakfastVertical, isMarketVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";
import { DISCOVERY_SURFACE_LABEL, type DiscoverySurface } from "@picki/shared";

type StockStatus = "UNSET" | "AVAILABLE" | "SOLD_OUT" | "HIDDEN" | string;

type SellItem = {
  offeringId: string;
  name: string;
  imageUrl: string | null;
  priceVnd: number;
  priceOverrideVnd: number | null;
  status: StockStatus;
  remaining: number | null;
  suggestedSurface?: DiscoverySurface;
  alcoholRestricted?: boolean;
  previousQty?: number | null;
};

type Spotlight = {
  id: string;
  updateType: string;
  title: string;
  description: string | null;
  offeringId: string | null;
  offeringName: string | null;
  promoPriceVnd: number | null;
  suggestedSurface: DiscoverySurface | null;
  approvedSurface: DiscoverySurface | null;
  status: string;
  createdAt: string;
};

function surfaceLabel(value: string | null | undefined) {
  if (value && value in DISCOVERY_SURFACE_LABEL) {
    return DISCOVERY_SURFACE_LABEL[value as DiscoverySurface];
  }
  return "Chờ hệ thống gợi ý";
}

function spotlightStatus(status: string, approvedSurface: string | null) {
  if (status === "PENDING_REVIEW") return "Chờ duyệt";
  if (status === "ACTIVE" && approvedSurface) return "Đã lên trang chủ";
  if (status === "ACTIVE") return "Chưa gắn mục";
  if (status === "REJECTED") return "Không duyệt";
  return status;
}

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
  spotlights?: Spotlight[];
  morning?: {
    serviceDate: string;
    enabled: boolean;
    cutoffTime: string | null;
    prepareLeadMinutes: number | null;
    slots: { startsAt: string; endsAt: string }[];
    items: {
      offeringId: string;
      name: string;
      unit: string;
      priceVnd: number;
      status: StockStatus;
      remaining: number | null;
    }[];
  } | null;
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
  const foodShop = isFoodBreakfastVertical(activeLocation?.providerType);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [programOfferingId, setProgramOfferingId] = useState("");
  const [programTitle, setProgramTitle] = useState("");
  const [programNote, setProgramNote] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [confirmProgram, setConfirmProgram] = useState(false);
  const [day, setDay] = useState<"today" | "morning">("today");

  const load = useCallback(async () => {
    if (!locationId) return;
    const next = await api<Board>(`/provider/locations/${locationId}/board`);
    setBoard(next);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [load]);

  async function run(path: string, body: unknown, ok: string) {
    if (!locationId) return false;
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
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không lưu được");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProviderPageShell title="Hôm nay">
      <h1 className="section-title">Hôm nay</h1>
      {market && board?.morning ? (
        <div className="location-tabs" role="tablist" aria-label="Ngày bán">
          <button type="button" className="location-tab" aria-selected={day === "today"} onClick={() => setDay("today")}>
            Hôm nay
          </button>
          <button type="button" className="location-tab" aria-selected={day === "morning"} onClick={() => setDay("morning")}>
            Sáng mai
          </button>
        </div>
      ) : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {note ? <p style={{ color: "#2d6a4f" }}>{note}</p> : null}
      {!board ? <p className="tagline">Đang tải…</p> : null}
      {board ? (
        <>
          {day === "today" && (foodShop || market) && board.sellNowEnabled ? (
            <section style={{ marginBottom: 18 }}>
              <h2 className="section-title">Đẩy Hôm nay</h2>
              <p className="tagline">
                Chọn một {market ? "sản phẩm" : "món"}. Hệ thống gợi ý mục trên trang chủ. Ops duyệt, đổi mục, hoặc từ chối.
              </p>
              <div className="card" style={{ marginBottom: 8 }}>
                <label className="field">
                  <span>{market ? "Sản phẩm trong kho" : "Món trong kho"}</span>
                  <select
                    value={programOfferingId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setProgramOfferingId(id);
                      setConfirmProgram(false);
                      const picked = board.sellNow.find((item) => item.offeringId === id);
                      if (picked && !programTitle.trim()) setProgramTitle(picked.name);
                    }}
                  >
                    <option value="">Chọn món</option>
                    {board.sellNow
                      .filter((item) => !item.alcoholRestricted)
                      .map((item) => (
                        <option key={item.offeringId} value={item.offeringId}>
                          {item.name} · {formatVnd(item.priceVnd)}
                        </option>
                      ))}
                  </select>
                </label>
                {programOfferingId ? (
                  <p className="stat" style={{ marginTop: 0 }}>
                    Gợi ý: {surfaceLabel(board.sellNow.find((item) => item.offeringId === programOfferingId)?.suggestedSurface)}
                  </p>
                ) : null}
                <label className="field">
                  <span>Giá khuyến mại, nếu có</span>
                  <input
                    inputMode="numeric"
                    value={promoPrice}
                    placeholder="Để trống nếu giữ giá gốc"
                    onChange={(e) => {
                      setPromoPrice(e.target.value.replace(/[^\d]/g, ""));
                      setConfirmProgram(false);
                    }}
                  />
                  <span className="stat">
                    {(() => {
                      const picked = board.sellNow.find((item) => item.offeringId === programOfferingId);
                      const next = Number(promoPrice);
                      if (!promoPrice) return "Không bắt buộc. Có giá mới thì trang chủ gạch giá gốc.";
                      if (!picked) return "Chọn món trước.";
                      if (!Number.isInteger(next) || next <= 0 || next >= picked.priceVnd) {
                        return `Phải thấp hơn giá gốc ${formatVnd(picked.priceVnd)}.`;
                      }
                      return `Giá gốc ${formatVnd(picked.priceVnd)} → ${formatVnd(next)}. Khách trả giá mới sau khi được duyệt.`;
                    })()}
                  </span>
                </label>
                <label className="field">
                  <span>Tiêu đề trên trang chủ</span>
                  <input
                    value={programTitle}
                    maxLength={120}
                    onChange={(e) => {
                      setProgramTitle(e.target.value);
                      setConfirmProgram(false);
                    }}
                  />
                </label>
                <label className="field">
                  <span>Mô tả ngắn</span>
                  <textarea
                    value={programNote}
                    maxLength={1000}
                    rows={3}
                    onChange={(e) => setProgramNote(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </label>
                {confirmProgram ? (
                  <div role="alertdialog" aria-labelledby="spotlight-confirm" style={{ marginBottom: 8 }}>
                    <p id="spotlight-confirm" style={{ margin: "0 0 8px" }}>
                      <strong>Đẩy “{programTitle.trim()}” lên trang chủ?</strong>
                    </p>
                    <p className="stat" style={{ margin: "0 0 8px" }}>
                      Hệ thống gợi ý {surfaceLabel(board.sellNow.find((item) => item.offeringId === programOfferingId)?.suggestedSurface)}.
                      Ops duyệt, đổi mục, hoặc từ chối. Khách chưa thấy món này.
                      {promoPrice
                        ? ` Giá khuyến mại ${formatVnd(Number(promoPrice))} chỉ áp dụng sau khi được duyệt.`
                        : ""}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => setConfirmProgram(false)}
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            "/board/spotlights",
                            {
                              offeringId: programOfferingId,
                              title: programTitle.trim(),
                              description: programNote.trim() || undefined,
                              ...(promoPrice ? { promoPriceVnd: Number(promoPrice) } : {}),
                            },
                            "Đã gửi. Chờ duyệt trước khi lên trang chủ",
                          ).then((ok) => {
                            if (!ok) return;
                            setConfirmProgram(false);
                            setProgramTitle("");
                            setProgramNote("");
                            setPromoPrice("");
                            setProgramOfferingId("");
                          })
                        }
                      >
                        Xác nhận đẩy
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      busy ||
                      !programOfferingId ||
                      !programTitle.trim() ||
                      (promoPrice.length > 0 &&
                        !(
                          Number(promoPrice) > 0 &&
                          Number(promoPrice) <
                            (board.sellNow.find((item) => item.offeringId === programOfferingId)?.priceVnd ?? 0)
                        ))
                    }
                    onClick={() => setConfirmProgram(true)}
                  >
                    Đẩy Hôm nay
                  </button>
                )}
              </div>
              {(board.spotlights ?? []).length === 0 ? (
                <p className="tagline">Chưa có chương trình nào hôm nay.</p>
              ) : (
                (board.spotlights ?? []).map((item) => (
                  <article key={item.id} className="card" style={{ marginBottom: 8 }}>
                    <strong>{item.title}</strong>
                    <p style={{ margin: "4px 0 0" }}>
                      {surfaceLabel(item.approvedSurface ?? item.suggestedSurface)}
                      {item.offeringName ? ` · ${item.offeringName}` : ""}
                      {item.promoPriceVnd ? ` · ${formatVnd(item.promoPriceVnd)}` : ""} · {spotlightStatus(item.status, item.approvedSurface)}
                    </p>
                    {item.description ? <p className="stat">{item.description}</p> : null}
                    {item.status === "PENDING_REVIEW" || item.status === "ACTIVE" ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: 8 }}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            `/board/spotlights/${item.id}/withdraw`,
                            {},
                            item.status === "ACTIVE" ? "Đã gỡ khỏi trang chủ" : "Đã rút bài chờ duyệt",
                          )
                        }
                      >
                        {item.status === "ACTIVE" ? "Gỡ khỏi trang chủ" : "Rút bài"}
                      </button>
                    ) : null}
                  </article>
                ))
              )}
              {board.sellNow.length === 0 ? (
                <p className="tagline">
                  Chưa có món trong kho. <Link href="/provider/products">Tạo ở Sản phẩm</Link> rồi chọn tại đây.
                </p>
              ) : null}
            </section>
          ) : null}

          {day === "today" && board.sellNowEnabled ? (
            <section style={{ marginBottom: 18 }}>
              <h2 className="section-title">{market ? "Hôm nay bán" : foodShop ? "Đang bán hôm nay" : "Bán ngay"}</h2>
              {foodShop ? (
                <p className="tagline">
                  Hết: khách vẫn thấy món, không đặt thêm được. Ẩn: khách không thấy món hôm nay.
                  Số hôm qua hiện trên từng món. Bổ sung là làm thêm, không thay số đã chép.
                </p>
              ) : null}
              {(foodShop
                ? board.sellNow.filter(
                    (item) => item.status === "AVAILABLE" || item.status === "SOLD_OUT",
                  )
                : board.sellNow
              ).length === 0 ? (
                <p className="tagline">
                  {market ? "Chưa có sản phẩm. " : foodShop ? "Chưa có món còn hàng. " : "Chưa có món. "}
                  <Link href="/provider/products">{market ? "Thêm sản phẩm" : "Thêm món"}</Link>
                </p>
              ) : (
                (foodShop
                  ? board.sellNow.filter(
                      (item) => item.status === "AVAILABLE" || item.status === "SOLD_OUT",
                    )
                  : board.sellNow
                ).map((item) => (
                  <article key={item.offeringId} className="card" style={{ marginBottom: 8 }}>
                    <strong>{item.name}</strong>
                    <p style={{ margin: "4px 0 8px" }}>
                      {formatVnd(item.priceOverrideVnd ?? item.priceVnd)} ·{" "}
                      {qtyLabel(item.status, item.remaining, market ? "Chưa mở bán hôm nay" : "Chưa đặt số")}
                      {item.previousQty != null ? ` · hôm qua ${item.previousQty}` : ""}
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
                      {item.previousQty != null ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              "/board/stock",
                              { offeringId: item.offeringId, action: "set", quantity: item.previousQty },
                              `Đã chép ${item.previousQty} từ hôm qua`,
                            )
                          }
                        >
                          Chép {item.previousQty} hôm qua
                        </button>
                      ) : null}
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
                    </div>
                  </article>
                ))
              )}
              {foodShop ? (
                <AddToday
                  items={board.sellNow.filter(
                    (item) => item.status === "UNSET" || item.status === "HIDDEN",
                  )}
                  busy={busy}
                  onAdd={(offeringId, quantity) =>
                    run(
                      "/board/stock",
                      { offeringId, action: "set", quantity },
                      "Đã thêm món hôm nay",
                    )
                  }
                />
              ) : null}
            </section>
          ) : null}

          {market && day === "morning" && board.morning ? (
            <MorningShelf
              morning={board.morning}
              busy={busy}
              onSaveSettings={(body) => run("/board/morning", body, "Đã lưu Sáng mai giao")}
              onStock={(offeringId, action, quantity) =>
                run(
                  "/board/stock",
                  {
                    offeringId,
                    action,
                    quantity,
                    serviceDate: board.morning?.serviceDate,
                  },
                  action === "hide" ? "Đã tắt món sáng mai" : "Đã mở bán sáng mai",
                )
              }
            />
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

function AddToday({
  items,
  busy,
  onAdd,
}: {
  items: SellItem[];
  busy: boolean;
  onAdd: (offeringId: string, quantity: number) => Promise<boolean | undefined>;
}) {
  const [offeringId, setOfferingId] = useState(items[0]?.offeringId ?? "");
  const [qty, setQty] = useState("10");
  const picked = items.find((item) => item.offeringId === offeringId) ?? items[0];
  const parsed = Number(qty);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 500;
  if (items.length === 0) return null;
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="section-title" style={{ marginTop: 0 }}>
        Thêm món hôm nay
      </p>
      <label className="field">
        <span>Món trong kho</span>
        <select value={picked?.offeringId ?? ""} onChange={(e) => setOfferingId(e.target.value)}>
          {items.map((item) => (
            <option key={item.offeringId} value={item.offeringId}>
              {item.name}
              {item.status === "HIDDEN" ? " · đang ẩn" : ""}
              {item.previousQty != null ? ` · hôm qua ${item.previousQty}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="board-row">
        <label className="field" style={{ margin: 0, minWidth: 120 }}>
          <span>Số bán hôm nay</span>
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn"
          style={{ width: "auto" }}
          disabled={busy || !valid || !picked}
          onClick={() => picked && void onAdd(picked.offeringId, parsed)}
        >
          Thêm
        </button>
        {picked?.previousQty != null ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto" }}
            disabled={busy}
            onClick={() => void onAdd(picked.offeringId, picked.previousQty!)}
          >
            Chép {picked.previousQty} hôm qua
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TodayPrice({
  item,
  busy,
  onSave,
}: {
  item: SellItem;
  busy: boolean;
  onSave: (priceVnd: number | null) => Promise<boolean | undefined>;
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
  onAdd: (quantity: number) => Promise<boolean | undefined>;
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
  onRun: (path: string, body: unknown, ok: string) => Promise<boolean | undefined>;
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

const SLOT_CHOICES = [
  ["06:00", "06:30"],
  ["06:30", "07:00"],
  ["07:00", "07:30"],
  ["07:30", "08:00"],
  ["08:00", "08:30"],
] as const;

function MorningShelf({
  morning,
  busy,
  onSaveSettings,
  onStock,
}: {
  morning: NonNullable<Board["morning"]>;
  busy: boolean;
  onSaveSettings: (body: {
    enabled: boolean;
    cutoffTime: string;
    prepareLeadMinutes: number;
    slots: { startsAt: string; endsAt: string }[];
  }) => Promise<boolean | undefined>;
  onStock: (offeringId: string, action: "set" | "hide", quantity?: number) => Promise<boolean | undefined>;
}) {
  const [cutoffTime, setCutoffTime] = useState(morning.cutoffTime ?? "");
  const [lead, setLead] = useState(morning.prepareLeadMinutes != null ? String(morning.prepareLeadMinutes) : "");
  const [slots, setSlots] = useState(morning.slots);
  const leadMinutes = Number(lead);
  const settingsReady =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime) &&
    Number.isInteger(leadMinutes) &&
    leadMinutes >= 0 &&
    leadMinutes <= 240 &&
    slots.length > 0;

  return (
    <section style={{ marginBottom: 18 }}>
      <h2 className="section-title">Sáng mai · {morning.serviceDate}</h2>
      <p className="tagline">Bật món và nhập số lượng ngày mai. Khách đặt tối nay, giao đúng khung giờ sáng.</p>
      {!morning.enabled ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>Giờ chốt nhận đơn tối trước</span>
            <input value={cutoffTime} placeholder="21:30" onChange={(event) => setCutoffTime(event.target.value)} />
          </label>
          <label className="field">
            <span>Phút được chuẩn bị trước khung giao</span>
            <input value={lead} inputMode="numeric" placeholder="30" onChange={(event) => setLead(event.target.value)} />
          </label>
          <p className="stat">Khung giao sáng</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {SLOT_CHOICES.map(([startsAt, endsAt]) => {
              const on = slots.some((slot) => slot.startsAt === startsAt && slot.endsAt === endsAt);
              return (
                <button
                  key={startsAt}
                  type="button"
                  className={on ? "btn" : "btn btn-secondary"}
                  style={{ width: "auto" }}
                  onClick={() =>
                    setSlots((current) =>
                      on
                        ? current.filter((slot) => !(slot.startsAt === startsAt && slot.endsAt === endsAt))
                        : [...current, { startsAt, endsAt }],
                    )
                  }
                >
                  {startsAt}–{endsAt}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !settingsReady}
            onClick={() =>
              void onSaveSettings({
                enabled: true,
                cutoffTime,
                prepareLeadMinutes: leadMinutes,
                slots,
              })
            }
          >
            Bật Sáng mai giao
          </button>
        </div>
      ) : (
        <p className="stat">
          Chốt đơn {morning.cutoffTime} tối trước · chuẩn bị trước {morning.prepareLeadMinutes} phút ·{" "}
          {morning.slots.map((slot) => `${slot.startsAt}–${slot.endsAt}`).join(" · ")}
        </p>
      )}
      {morning.enabled
        ? morning.items.map((item) => (
            <MorningRow key={item.offeringId} item={item} busy={busy} onStock={onStock} />
          ))
        : null}
    </section>
  );
}

function MorningRow({
  item,
  busy,
  onStock,
}: {
  item: NonNullable<Board["morning"]>["items"][number];
  busy: boolean;
  onStock: (offeringId: string, action: "set" | "hide", quantity?: number) => Promise<boolean | undefined>;
}) {
  const open = item.status === "AVAILABLE" && item.remaining != null;
  const [qty, setQty] = useState(item.remaining != null && item.remaining > 0 ? String(item.remaining) : "");
  const parsed = Number(qty);
  return (
    <article className="card" style={{ marginBottom: 8 }}>
      <div className="board-row" style={{ alignItems: "center" }}>
        <strong style={{ flex: 1 }}>{item.name}</strong>
        <label className="stat" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={open}
            disabled={busy}
            onChange={() => {
              if (open) {
                void onStock(item.offeringId, "hide");
                return;
              }
              const quantity = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
              setQty(String(quantity));
              void onStock(item.offeringId, "set", quantity);
            }}
          />
          Bật
        </label>
        <input
          value={qty}
          inputMode="numeric"
          disabled={busy}
          onChange={(event) => setQty(event.target.value)}
          onBlur={() => {
            if (!open) return;
            if (!Number.isInteger(parsed) || parsed < 1 || parsed === item.remaining) return;
            void onStock(item.offeringId, "set", parsed);
          }}
          style={{ width: 72 }}
        />
        <span className="stat">{item.unit}</span>
      </div>
      <p className="stat" style={{ margin: "6px 0 0" }}>{formatVnd(item.priceVnd)}</p>
    </article>
  );
}
