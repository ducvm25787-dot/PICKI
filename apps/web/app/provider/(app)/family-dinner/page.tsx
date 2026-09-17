"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FdCutoffCountdown } from "../../../components/fd-cutoff-countdown";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { isHomeCookVertical } from "../../../../lib/providers";
import { api } from "../../../../lib/api";
import {
  FD_CATEGORY_LABEL,
  FD_CATEGORY_ORDER,
  FD_DEFAULT_PRICE,
  FD_DEFAULT_SLOTS,
  FD_MAX_SLOTS,
  FD_MENU_REQUIRED,
  FD_SUGGESTIONS,
  fdAllowsSelfCookCategory,
  fdFormatCookPlanQty,
  fdIsPastCutoff,
  fdLateMaxCapacity,
  type FdRequiredCategory,
} from "../../../../lib/family-dinner";

type OpsResponse = {
  serviceDate: string;
  settings: {
    enabled: boolean;
    cutoffTime: string;
    dailyCapacity: number | null;
    receivingOpenedAt?: string | null;
  } | null;
  menu: {
    id: string;
    status: string;
    publishedAt: string | null;
    copiedFromServiceDate?: string | null;
  } | null;
  items: {
    id: string;
    category: string;
    name: string;
    priceVnd: number;
    status: string;
    remainingCapacity: number | null;
    allowsSelfCook?: boolean;
  }[];
  windows: {
    id: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    remainingCapacity: number;
    paidOrders: number;
  }[];
  liveProduction: {
    confirmedOrders: number;
    byMenuItem: { menuItemId: string; quantity: number; selfCookQuantity?: number }[];
  };
  batch: {
    id: string;
    status: string;
    confirmedOrders: number;
    lockedAt: string | null;
    itemTotals: {
      menuItemId: string;
      confirmedQuantity: number;
      remainingQuantity: number;
    }[];
  } | null;
};

type LateOffer = {
  id: string;
  title: string;
  priceVnd: number;
  capacity: number;
  remainingCapacity: number;
  etaMinutes: number;
  status: string;
  items?: { name: string; category: string }[];
};

type DraftDish = { name: string; priceVnd: number; allowsSelfCook: boolean };
type TabId = "menu" | "plan" | "production" | "late";

const CATS = Object.keys(FD_SUGGESTIONS) as FdRequiredCategory[];

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

function padDrafts(cat: FdRequiredCategory, rows: DraftDish[]): DraftDish[] {
  if (rows.length === 0) {
    return [{ name: "", priceVnd: FD_DEFAULT_PRICE[cat], allowsSelfCook: false }];
  }
  return rows.slice(0, FD_MAX_SLOTS[cat]);
}

function emptyDrafts(): Record<FdRequiredCategory, DraftDish[]> {
  return {
    MAIN: padDrafts("MAIN", []),
    SIDE: padDrafts("SIDE", []),
    VEGETABLE: padDrafts("VEGETABLE", []),
    SOUP: padDrafts("SOUP", []),
    RICE: padDrafts("RICE", []),
  };
}

function emptyLocked(): Record<FdRequiredCategory, boolean> {
  return { MAIN: false, SIDE: false, VEGETABLE: false, SOUP: false, RICE: false };
}

function allLocked(): Record<FdRequiredCategory, boolean> {
  return { MAIN: true, SIDE: true, VEGETABLE: true, SOUP: true, RICE: true };
}

function editUsedKey(locationId: string, serviceDate: string) {
  return `fd-menu-edit-used:${locationId}:${serviceDate}`;
}

function publishCountKey(locationId: string, serviceDate: string) {
  return `fd-menu-publish-count:${locationId}:${serviceDate}`;
}

export default function ProviderFamilyDinnerPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const [ops, setOps] = useState<OpsResponse | null>(null);
  const [lateOffers, setLateOffers] = useState<LateOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cutoffDraft, setCutoffDraft] = useState("16:00");
  const [cutoffLocked, setCutoffLocked] = useState(false);
  const [drafts, setDrafts] = useState(emptyDrafts);
  const [sectionLocked, setSectionLocked] = useState(emptyLocked);
  const [menuEditing, setMenuEditing] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [receivingHighlight, setReceivingHighlight] = useState(false);
  const receivingRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<TabId>("menu");
  const [menuEditUsed, setMenuEditUsed] = useState(false);
  const [publishCount, setPublishCount] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [lateTitle, setLateTitle] = useState("Mâm tối muộn");
  const [latePrice, setLatePrice] = useState("289000");
  const [lateCapacity, setLateCapacity] = useState("4");
  const [lateEta, setLateEta] = useState("25");
  const [selectedLateItems, setSelectedLateItems] = useState<string[]>([]);
  const [copiedBannerDismissed, setCopiedBannerDismissed] = useState(false);

  const isHomeCook = isHomeCookVertical(activeLocation?.providerType);
  const serviceDate = ops?.serviceDate ?? "";
  const cutoffTime = (ops?.settings?.cutoffTime ?? cutoffDraft).slice(0, 5);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const pastCutoff =
    Boolean(serviceDate && cutoffTime) && fdIsPastCutoff(serviceDate, cutoffTime, nowTick);

  const itemNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of ops?.items ?? []) m.set(i.id, i.name);
    return m;
  }, [ops?.items]);

  /** Thống kê món theo đơn PAID — luôn ưu tiên live trong giờ nhận; sau chốt dùng batch + giữ selfCook live. */
  const planRows = useMemo(() => {
    const qtyById = new Map<string, { confirmed: number; remaining: number; selfCook: number }>();
    if (ops?.batch?.status === "LOCKED" && ops.batch.itemTotals.length) {
      for (const t of ops.batch.itemTotals) {
        qtyById.set(t.menuItemId, {
          confirmed: t.confirmedQuantity,
          remaining: t.remainingQuantity,
          selfCook: 0,
        });
      }
    } else {
      for (const t of ops?.liveProduction.byMenuItem ?? []) {
        qtyById.set(t.menuItemId, {
          confirmed: t.quantity,
          remaining: t.quantity,
          selfCook: t.selfCookQuantity ?? 0,
        });
      }
    }
    // Overlay self-cook từ live (kể cả sau chốt — batch không lưu cột này).
    for (const t of ops?.liveProduction.byMenuItem ?? []) {
      const existing = qtyById.get(t.menuItemId);
      const sc = t.selfCookQuantity ?? 0;
      if (existing) {
        existing.selfCook = sc;
      } else {
        qtyById.set(t.menuItemId, {
          confirmed: t.quantity,
          remaining: t.quantity,
          selfCook: sc,
        });
      }
    }
    const rows = (ops?.items ?? []).map((item) => {
      const q = qtyById.get(item.id);
      return {
        menuItemId: item.id,
        name: item.name,
        category: item.category,
        confirmedQuantity: q?.confirmed ?? 0,
        remainingQuantity: q?.remaining ?? 0,
        selfCookQuantity: q?.selfCook ?? 0,
      };
    });
    const catRank = (c: string) => {
      const i = FD_CATEGORY_ORDER.indexOf(c as (typeof FD_CATEGORY_ORDER)[number]);
      return i >= 0 ? i : 99;
    };
    return rows.sort(
      (a, b) =>
        catRank(a.category) - catRank(b.category) ||
        b.confirmedQuantity - a.confirmedQuantity ||
        a.name.localeCompare(b.name, "vi"),
    );
  }, [ops]);

  const productionRows = planRows;

  const lateMaxCapacity = useMemo(() => {
    const selected = planRows.filter((r) => selectedLateItems.includes(r.menuItemId));
    return fdLateMaxCapacity(
      selected.map((r) => ({ remainingQuantity: r.remainingQuantity, quantityPerTray: 1 })),
    );
  }, [planRows, selectedLateItems]);

  const canPublish = FD_MENU_REQUIRED.every((c) =>
    drafts[c].some((d) => d.name.trim().length >= 2),
  );

  const confirmSummary = useMemo(() => {
    return FD_MENU_REQUIRED.map((cat) => ({
      cat,
      dishes: drafts[cat]
        .map((d) => ({
          name: d.name.trim(),
          priceVnd: d.priceVnd || FD_DEFAULT_PRICE[cat],
          allowsSelfCook: d.allowsSelfCook,
        }))
        .filter((d) => d.name.length >= 2),
    })).filter((g) => g.dishes.length > 0);
  }, [drafts]);

  const load = useCallback(async (opts?: { preserveDrafts?: boolean }) => {
    if (!locationId || !isHomeCook) return;
    setError(null);
    try {
      const opsRes = await api<OpsResponse>(
        `/provider/locations/${locationId}/family-dinner/ops`,
      );
      setOps(opsRes);
      setCutoffDraft(opsRes.settings?.cutoffTime?.slice(0, 5) ?? "16:00");
      // Chỉ khóa sau khi đã mở nhận đơn (enabled), không khóa chỉ vì có default cutoff.
      setCutoffLocked(Boolean(opsRes.settings?.enabled));

      const published = opsRes.menu?.status === "PUBLISHED" && opsRes.items.length > 0;
      if (!opts?.preserveDrafts) {
        const next = emptyDrafts();
        for (const cat of CATS) {
          const rows = opsRes.items
            .filter((i) => i.category === cat)
            .map((r) => ({
              name: r.name,
              priceVnd: r.priceVnd,
              allowsSelfCook: Boolean(r.allowsSelfCook),
            }));
          next[cat] = padDrafts(cat, rows);
        }
        setDrafts(next);
        setMenuEditing(!published);
        setSectionLocked(published ? allLocked() : emptyLocked());
        setShowConfirm(false);
      }

      const editKey = editUsedKey(locationId, opsRes.serviceDate);
      const pubKey = publishCountKey(locationId, opsRes.serviceDate);
      setMenuEditUsed(sessionStorage.getItem(editKey) === "1");
      setPublishCount(Number(sessionStorage.getItem(pubKey) ?? (published ? "1" : "0")) || 0);

      const lateRes = await api<{ offers: LateOffer[] }>(
        `/provider/locations/${locationId}/family-dinner/late-offers?serviceDate=${opsRes.serviceDate}`,
      ).catch(() => ({ offers: [] as LateOffer[] }));
      setLateOffers(lateRes.offers);

      setSelectedLateItems((prev) => {
        if (prev.length > 0) return prev;
        return (opsRes.batch?.itemTotals ?? [])
          .filter((t) => t.remainingQuantity > 0)
          .slice(0, 4)
          .map((r) => r.menuItemId);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được Bữa tối");
      setOps(null);
    }
  }, [locationId, isHomeCook]);

  useEffect(() => {
    void load();
  }, [load]);

  const productionLocked = ops?.batch?.status === "LOCKED" || !!ops?.batch?.lockedAt;
  const confirmedOrders = ops?.batch?.confirmedOrders ?? ops?.liveProduction.confirmedOrders ?? 0;
  const menuPublished = ops?.menu?.status === "PUBLISHED";
  const receivingOpen = Boolean(ops?.settings?.enabled);
  /** Hết giờ nhận đơn → mở kế hoạch nấu (kể cả khi đã chốt). */
  const canOpenPlan = Boolean(menuPublished && pastCutoff);
  /** Sửa menu chỉ 1 lần sau lần đăng đầu. */
  const canEditMenuOnce = menuPublished && !menuEditing && publishCount < 2 && !menuEditUsed;
  const copiedFrom = ops?.menu?.copiedFromServiceDate ?? null;

  useEffect(() => {
    setCopiedBannerDismissed(false);
  }, [copiedFrom, serviceDate]);


  // Poll live stats trong giờ nhận đơn / tab kế hoạch
  useEffect(() => {
    if (!locationId || !isHomeCook || !menuPublished) return;
    if (pastCutoff && tab !== "plan") return;
    const t = setInterval(() => {
      void api<OpsResponse>(`/provider/locations/${locationId}/family-dinner/ops`)
        .then((opsRes) => setOps(opsRes))
        .catch(() => undefined);
    }, 15_000);
    return () => clearInterval(t);
  }, [locationId, isHomeCook, menuPublished, pastCutoff, tab]);

  async function saveCutoff() {
    if (!locationId || cutoffLocked) return;
    if (!menuPublished) {
      setError("Đăng menu trước, rồi mới mở giờ nhận đơn.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/settings`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: true, cutoffTime: cutoffDraft }),
      });
      setCutoffLocked(true);
      setSuccessMsg("Đã mở nhận đơn — đồng hồ đếm ngược đang chạy. Khách có thể đặt ngay.");
      await load({ preserveDrafts: true });
      window.setTimeout(() => {
        receivingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở nhận đơn được");
    } finally {
      setBusy(false);
    }
  }

  function saveSection(cat: FdRequiredCategory) {
    const filled = drafts[cat].filter((d) => d.name.trim().length >= 2);
    if (filled.length < 1) {
      setError(`${FD_CATEGORY_LABEL[cat]} cần ít nhất 1 món có tên để lưu`);
      return;
    }
    setError(null);
    setDrafts((prev) => ({
      ...prev,
      [cat]: filled.slice(0, FD_MAX_SLOTS[cat]),
    }));
    setSectionLocked((prev) => ({ ...prev, [cat]: true }));
  }

  function editSection(cat: FdRequiredCategory) {
    if (!menuEditing) {
      setError("Bấm «Sửa menu» trước khi sửa từng nhóm.");
      return;
    }
    if (productionLocked) {
      setError("Đã chốt kế hoạch nấu — mở lại chốt nấu trước.");
      return;
    }
    setError(null);
    setSectionLocked((prev) => ({ ...prev, [cat]: false }));
  }

  function requestPublish() {
    if (!canPublish) {
      setError("Mỗi nhóm cần ít nhất 1 món (Chính / Phụ / Rau / Canh / Cơm).");
      return;
    }
    if (productionLocked) {
      setError("Đã chốt kế hoạch nấu — mở lại chốt nấu trước khi sửa menu.");
      return;
    }
    setError(null);
    setShowConfirm(true);
  }

  async function publishMenu() {
    if (!locationId) {
      setError("Chưa chọn cửa hàng");
      return;
    }
    if (productionLocked) {
      setError("Đã chốt kế hoạch nấu — mở lại chốt nấu trước khi sửa menu.");
      return;
    }
    if (!canPublish) {
      setError("Mỗi nhóm cần ít nhất 1 món có tên.");
      return;
    }
    const items: {
      category: string;
      name: string;
      priceVnd: number;
      sortOrder: number;
      allowsSelfCook?: boolean;
    }[] = [];
    for (const cat of CATS) {
      drafts[cat].forEach((d, idx) => {
        const name = d.name.trim();
        if (name.length < 2) return;
        items.push({
          category: cat,
          name,
          priceVnd: d.priceVnd || FD_DEFAULT_PRICE[cat],
          sortOrder: idx,
          allowsSelfCook: fdAllowsSelfCookCategory(cat) ? d.allowsSelfCook : false,
        });
      });
    }
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/menu`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setMenuEditing(false);
      setSectionLocked(allLocked());
      setShowConfirm(false);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const cat of CATS) {
          next[cat] = prev[cat]
            .filter((d) => d.name.trim().length >= 2)
            .slice(0, FD_MAX_SLOTS[cat]);
        }
        return next;
      });
      const nextCount = Math.min(publishCount + 1, 2);
      setPublishCount(nextCount);
      const dateKey = serviceDate || ops?.serviceDate || "";
      if (dateKey) {
        sessionStorage.setItem(publishCountKey(locationId, dateKey), String(nextCount));
      }
      const opsRes = await api<OpsResponse>(
        `/provider/locations/${locationId}/family-dinner/ops`,
      );
      setOps(opsRes);
      setMenuEditing(false);
      setSectionLocked(allLocked());
      setSuccessMsg(
        "Đã đăng menu thành công. Bước tiếp: chọn giờ và bấm «Mở nhận đơn tới giờ này».",
      );
      setReceivingHighlight(true);
      // Cuộn lên phần Nhận đơn hôm nay
      window.setTimeout(() => {
        receivingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      window.setTimeout(() => setReceivingHighlight(false), 4500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Đăng menu thất bại";
      setError(msg);
      await load({ preserveDrafts: true }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  function startEditMenu() {
    if (!canEditMenuOnce) {
      setError("Chỉ được sửa menu một lần trong ngày để tránh loạn đơn.");
      return;
    }
    if (productionLocked) {
      setError("Đã chốt kế hoạch nấu — mở lại chốt nấu trước.");
      return;
    }
    setError(null);
    setMenuEditing(true);
    setSectionLocked(emptyLocked());
    setShowConfirm(false);
    setMenuEditUsed(true);
    if (locationId && serviceDate) {
      sessionStorage.setItem(editUsedKey(locationId, serviceDate), "1");
    }
  }

  async function unlockProductionOnly() {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/unlock`, {
        method: "POST",
        body: JSON.stringify({ serviceDate: serviceDate || undefined }),
      });
      const opsRes = await api<OpsResponse>(
        `/provider/locations/${locationId}/family-dinner/ops`,
      );
      setOps(opsRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở lại chốt được");
    } finally {
      setBusy(false);
    }
  }

  async function lockProduction() {
    if (!locationId || !serviceDate) return;
    if (!pastCutoff) {
      setError("Chỉ chốt kế hoạch nấu sau khi hết giờ nhận đơn.");
      return;
    }
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/lock`, {
        method: "POST",
        body: JSON.stringify({ serviceDate }),
      });
      await load({ preserveDrafts: true });
      setTab("production");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chốt nấu thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function createLateOffer() {
    if (!locationId || selectedLateItems.length === 0) return;
    const maxCap = lateMaxCapacity;
    if (maxCap < 1) {
      setError("Không còn suất nấu sẵn để mở mâm muộn");
      return;
    }
    const requested = Number(lateCapacity) || maxCap;
    const capacity = Math.min(Math.max(1, requested), maxCap);
    const etaMinutes = Math.min(180, Math.max(5, Number(lateEta) || 25));
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/late-offers`, {
        method: "POST",
        body: JSON.stringify({
          title: lateTitle,
          priceVnd: Number(latePrice),
          capacity,
          etaMinutes,
          items: selectedLateItems.map((menuItemId) => ({
            menuItemId,
            quantityPerTray: 1,
          })),
        }),
      });
      setLateCapacity(String(capacity));
      await load({ preserveDrafts: true });
      setSuccessMsg(`Đã tạo mâm tối muộn · ${capacity} suất · ~${etaMinutes} phút`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tạo mâm muộn thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function closeLateOffer(offerId: string) {
    if (!locationId) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/family-dinner/late-offers/${offerId}/close`, {
        method: "POST",
        body: "{}",
      });
      await load({ preserveDrafts: true });
      setSuccessMsg("Đã đóng mâm — suất còn lại trả về kho nấu");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đóng mâm thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function copyLastMenuIntoDrafts() {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        sourceServiceDate: string;
        items: {
          category: string;
          name: string;
          priceVnd: number;
          allowsSelfCook?: boolean;
        }[];
      }>(`/provider/locations/${locationId}/family-dinner/copy-last-menu`, {
        method: "POST",
        body: JSON.stringify({ publish: false, serviceDate }),
      });
      const next = emptyDrafts();
      for (const cat of CATS) {
        const rows = res.items
          .filter((i) => i.category === cat)
          .map((r) => ({
            name: r.name,
            priceVnd: r.priceVnd,
            allowsSelfCook: Boolean(r.allowsSelfCook),
          }));
        next[cat] = padDrafts(cat, rows);
      }
      setDrafts(next);
      setMenuEditing(true);
      setSectionLocked(emptyLocked());
      setShowConfirm(false);
      setSuccessMsg(`Đã chép menu từ ${res.sourceServiceDate} — kiểm tra rồi đăng.`);
      setTab("menu");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không chép được menu");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(cat: FdRequiredCategory, idx: number, patch: Partial<DraftDish>) {
    setDrafts((prev) => {
      const rows = [...prev[cat]];
      rows[idx] = { ...rows[idx]!, ...patch };
      return { ...prev, [cat]: rows };
    });
  }

  function addDraftRow(cat: FdRequiredCategory) {
    if (drafts[cat].length >= FD_MAX_SLOTS[cat]) return;
    setDrafts((prev) => ({
      ...prev,
      [cat]: [
        ...prev[cat],
        { name: "", priceVnd: FD_DEFAULT_PRICE[cat], allowsSelfCook: false },
      ],
    }));
  }

  function removeDraftRow(cat: FdRequiredCategory, idx: number) {
    setDrafts((prev) => {
      const rows = prev[cat].filter((_, i) => i !== idx);
      if (rows.length === 0) {
        return {
          ...prev,
          [cat]: [{ name: "", priceVnd: FD_DEFAULT_PRICE[cat], allowsSelfCook: false }],
        };
      }
      return { ...prev, [cat]: rows };
    });
  }

  function fillEmptySlotFromSuggestion(cat: FdRequiredCategory, name: string) {
    setDrafts((prev) => {
      const rows = [...prev[cat]];
      const emptyIdx = rows.findIndex((r) => !r.name.trim());
      if (emptyIdx >= 0) {
        rows[emptyIdx] = { ...rows[emptyIdx]!, name };
        return { ...prev, [cat]: rows };
      }
      if (rows.length < FD_MAX_SLOTS[cat]) {
        return {
          ...prev,
          [cat]: [...rows, { name, priceVnd: FD_DEFAULT_PRICE[cat], allowsSelfCook: false }],
        };
      }
      return prev;
    });
  }

  if (!isHomeCook) {
    return (
      <ProviderPageShell title="Bữa tối ấm cúng">
        <p className="muted">Tab này dành cho bếp HOME_COOK.</p>
      </ProviderPageShell>
    );
  }

  const tabBtn = (id: TabId, label: string, enabled = true) => (
    <button
      key={id}
      type="button"
      className={tab === id ? "btn" : "btn btn-secondary"}
      style={{
        width: "auto",
        padding: "8px 12px",
        fontSize: 13,
        opacity: enabled ? 1 : 0.45,
      }}
      disabled={!enabled}
      onClick={() => enabled && setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <ProviderPageShell title="Bữa tối ấm cúng">
      <div className="stack" style={{ gap: 16, paddingBottom: 96 }}>
        {error ? <p className="error">{error}</p> : null}
        {successMsg ? (
          <p
            style={{
              margin: 0,
              padding: "12px 14px",
              borderRadius: 8,
              background: "#d8f3dc",
              color: "#1b4332",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ✓ {successMsg}
          </p>
        ) : null}

        <section
          ref={receivingRef}
          className="card"
          style={
            receivingHighlight
              ? {
                  outline: "2px solid #2d6a4f",
                  boxShadow: "0 0 0 4px rgba(45, 106, 79, 0.15)",
                }
              : undefined
          }
        >
          <p className="section-title">Nhận đơn hôm nay</p>
          {menuPublished ? (
            <p
              style={{
                margin: "0 0 10px",
                padding: "8px 10px",
                borderRadius: 8,
                background: "#d8f3dc",
                color: "#1b4332",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              ✓ Menu đã đăng · {serviceDate}
              {!receivingOpen ? " — mở giờ nhận đơn bên dưới" : ""}
            </p>
          ) : null}
          {!menuPublished ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Đăng menu xong rồi mới mở giờ nhận đơn. Có thể soạn menu cả buổi sáng — khi sẵn sàng
              quay lại đây bấm mở nhận đơn.
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Chọn giờ chốt đơn rồi bấm mở — khách thấy bếp ngay và đồng hồ đếm ngược bắt đầu chạy.
              Chỉ set 1 lần trong ngày.
            </p>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Nhận đơn tới
              </span>
              <input
                type="time"
                value={cutoffDraft}
                disabled={!menuPublished || cutoffLocked || busy}
                onChange={(e) => setCutoffDraft(e.target.value)}
                style={
                  !menuPublished || cutoffLocked
                    ? { opacity: 0.7, background: "#f3f3f3" }
                    : undefined
                }
              />
            </label>
            {cutoffLocked || receivingOpen ? (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Đang nhận đơn · chốt {cutoffTime} — không đổi lại trong ngày.
              </p>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy || !menuPublished}
                onClick={() => void saveCutoff()}
              >
                Mở nhận đơn tới giờ này
              </button>
            )}
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            {!menuPublished ? "Chưa đăng menu hôm nay" : null}
            {receivingOpen ? `Đang nhận tới ${cutoffTime}` : ""}
            {receivingOpen && pastCutoff ? " · ĐÃ HẾT GIỜ NHẬN" : ""}
          </p>
          {receivingOpen && serviceDate && cutoffTime ? (
            <FdCutoffCountdown
              serviceDate={serviceDate}
              cutoffTime={cutoffTime}
              publishedAt={ops?.settings?.receivingOpenedAt ?? ops?.menu?.publishedAt}
            />
          ) : null}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              style={{
                width: "100%",
                fontSize: 15,
                padding: "12px 14px",
                opacity: canOpenPlan ? 1 : 0.45,
              }}
              disabled={!canOpenPlan || busy}
              onClick={() => setTab("plan")}
            >
              {canOpenPlan
                ? productionLocked
                  ? "Xem kế hoạch nấu (đã chốt)"
                  : "Kế hoạch nấu — xem & chốt"
                : "Kế hoạch nấu (sau giờ chốt đơn)"}
            </button>
          </div>
        </section>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabBtn("menu", "Menu")}
          {tabBtn("plan", "Kế hoạch nấu", canOpenPlan || productionLocked)}
          {tabBtn("production", "Sản xuất", menuPublished && (pastCutoff || productionLocked))}
          {tabBtn("late", "Tối muộn", productionLocked)}
        </div>

        {tab === "menu" ? (
          <section className="card">
            <p className="section-title">Menu tối nay</p>
            {ops?.menu?.copiedFromServiceDate && !copiedBannerDismissed ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  background: "#fff8e8",
                  borderRadius: 8,
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <span>
                  Menu hôm nay lấy từ <strong>{ops.menu.copiedFromServiceDate}</strong> — kiểm tra
                  giá/món rồi mở nhận đơn.
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "auto", padding: "4px 8px", fontSize: 12, flexShrink: 0 }}
                  onClick={() => setCopiedBannerDismissed(true)}
                >
                  Đã xem
                </button>
              </div>
            ) : null}
            {menuEditing && !menuPublished ? (
              <div style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "100%" }}
                  disabled={busy}
                  onClick={() => void copyLastMenuIntoDrafts()}
                >
                  Chép menu gần nhất vào form
                </button>
                <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                  Điền sẵn món/giá từ lần đăng trước — chưa đăng lên app.
                </p>
              </div>
            ) : null}
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {menuEditing
                ? "Điền món → kiểm tra lại → Xác nhận Menu. Tick «Cho phép tự nấu» — khách chọn Nấu sẵn / Tự nấu (cùng giá)."
                : canEditMenuOnce
                  ? "Menu đã khóa. Được sửa 1 lần trong ngày."
                  : "Menu đã khóa — không sửa thêm trong ngày."}
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {menuEditing
                ? "Điền món → kiểm tra lại → Xác nhận Menu. Sửa menu chỉ được 1 lần sau khi đã đăng."
                : canEditMenuOnce
                  ? "Menu đã khóa. Được sửa 1 lần trong ngày."
                  : "Menu đã khóa — không sửa thêm trong ngày."}
            </p>

            {CATS.map((cat) => {
              const fieldsLocked = !menuEditing || sectionLocked[cat] || showConfirm;
              const usedNames = new Set(drafts[cat].map((d) => d.name.trim()).filter(Boolean));
              const unusedSuggestions = FD_SUGGESTIONS[cat].filter((s) => !usedNames.has(s));
              return (
                <div
                  key={cat}
                  style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eee" }}
                >
                  <p style={{ margin: "0 0 12px", fontWeight: 700 }}>
                    {FD_CATEGORY_LABEL[cat]}{" "}
                    <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>
                      (tối đa {FD_MAX_SLOTS[cat]}, khuyến nghị {FD_DEFAULT_SLOTS[cat]})
                    </span>
                  </p>
                  {drafts[cat].map((row, idx) => (
                    <div
                      key={`${cat}-${idx}`}
                      style={{
                        display: "grid",
                        gap: 6,
                        marginBottom: 12,
                        padding: "10px 12px",
                        background: "#fafafa",
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#666", minWidth: 28 }}>
                          {idx + 1}.
                        </span>
                        <input
                          style={{ flex: 1 }}
                          placeholder={`Tên ${FD_CATEGORY_LABEL[cat].toLowerCase()}`}
                          value={row.name}
                          disabled={fieldsLocked}
                          onChange={(e) => updateDraft(cat, idx, { name: e.target.value })}
                        />
                        {!fieldsLocked ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
                            onClick={() => removeDraftRow(cat, idx)}
                          >
                            Xóa
                          </button>
                        ) : null}
                      </div>
                      <label
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          fontSize: 13,
                          marginLeft: 36,
                        }}
                      >
                        Giá
                        <input
                          inputMode="numeric"
                          style={{ width: 120 }}
                          value={row.priceVnd}
                          disabled={fieldsLocked}
                          onChange={(e) =>
                            updateDraft(cat, idx, { priceVnd: Number(e.target.value) || 0 })
                          }
                        />
                        đ
                      </label>
                      {fdAllowsSelfCookCategory(cat) ? (
                        <label
                          className="stat"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                            margin: 0,
                            opacity: fieldsLocked ? 0.7 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={row.allowsSelfCook}
                            disabled={fieldsLocked}
                            onChange={(e) =>
                              updateDraft(cat, idx, { allowsSelfCook: e.target.checked })
                            }
                          />
                          Cho phép tự nấu
                        </label>
                      ) : null}
                    </div>
                  ))}
                  {menuEditing && !showConfirm ? (
                    <>
                      {!sectionLocked[cat] ? (
                        <>
                          {drafts[cat].length < FD_MAX_SLOTS[cat] ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ width: "auto", marginBottom: 10 }}
                              onClick={() => addDraftRow(cat)}
                            >
                              + Thêm {FD_CATEGORY_LABEL[cat].toLowerCase()}
                            </button>
                          ) : null}
                          {unusedSuggestions.length > 0 ? (
                            <div style={{ marginBottom: 12 }}>
                              <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>
                                Gợi ý:
                              </p>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {unusedSuggestions.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                                    onClick={() => fillEmptySlotFromSuggestion(cat, s)}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="btn"
                            style={{ width: "auto" }}
                            onClick={() => saveSection(cat)}
                          >
                            Lưu {FD_CATEGORY_LABEL[cat].toLowerCase()}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ width: "auto" }}
                          onClick={() => editSection(cat)}
                        >
                          Sửa {FD_CATEGORY_LABEL[cat].toLowerCase()}
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              );
            })}

            {showConfirm ? (
              <div
                style={{
                  marginTop: 20,
                  padding: 16,
                  border: "2px solid #222",
                  borderRadius: 10,
                  background: "#fafafa",
                }}
              >
                <p style={{ margin: "0 0 8px", fontWeight: 700 }}>Kiểm tra lần cuối trước khi đăng</p>
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  Tổng {confirmSummary.reduce((n, g) => n + g.dishes.length, 0)} món · chốt đơn{" "}
                  {cutoffTime}
                </p>
                {confirmSummary.map((g) => (
                  <div key={g.cat} style={{ marginBottom: 10 }}>
                    <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 14 }}>
                      {FD_CATEGORY_LABEL[g.cat]}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                      {g.dishes.map((d) => (
                        <li key={d.name}>
                          {d.name} · {formatVnd(d.priceVnd)}
                          {d.allowsSelfCook ? " · có tự nấu" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ width: "100%", fontSize: 16, padding: "14px 16px" }}
                    disabled={busy}
                    onClick={() => void publishMenu()}
                  >
                    Xác nhận Menu và đăng
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: "100%" }}
                    disabled={busy}
                    onClick={() => setShowConfirm(false)}
                  >
                    Quay lại sửa
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "2px solid #e8e8e8",
                  position: "sticky",
                  bottom: 64,
                  background: "#fff",
                  paddingBottom: 8,
                  zIndex: 4,
                }}
              >
                {menuEditing ? (
                  <>
                    {!canPublish ? (
                      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                        Mỗi nhóm cần ≥1 món (Chính / Phụ / Rau / Canh / Cơm) để đăng.
                      </p>
                    ) : null}
                    {productionLocked ? (
                      <div style={{ marginBottom: 10 }}>
                        <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
                          Đã chốt nấu — mở lại trước khi đăng lại menu.
                        </p>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ width: "100%", marginBottom: 8 }}
                          disabled={busy}
                          onClick={() => void unlockProductionOnly()}
                        >
                          Mở lại chốt nấu
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="btn"
                      style={{ width: "100%", fontSize: 16, padding: "14px 16px" }}
                      disabled={busy || productionLocked || !canPublish}
                      onClick={() => requestPublish()}
                    >
                      {menuPublished
                        ? "Cập nhật menu — kiểm tra lại"
                        : "Đăng menu — kiểm tra lại"}
                    </button>
                  </>
                ) : canEditMenuOnce ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: "100%", fontSize: 16, padding: "14px 16px" }}
                    disabled={busy}
                    onClick={() => startEditMenu()}
                  >
                    Sửa menu (1 lần)
                  </button>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 13, textAlign: "center" }}>
                    Menu đã khóa — không sửa thêm hôm nay.
                  </p>
                )}
              </div>
            )}
          </section>
        ) : null}

        {tab === "plan" ? (
          <section className="card">
            <p className="section-title">Kế hoạch nấu</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {pastCutoff
                ? "Hết giờ nhận đơn — xem lại khối lượng rồi chốt. Tự nấu = khách nhận nguyên liệu (không nấu trong bếp)."
                : "Đang nhận đơn — số lượng cập nhật theo đơn PAID (15 giây/lần)."}
            </p>
            <p style={{ margin: "0 0 12px", fontWeight: 600 }}>
              Tổng mâm / đơn PAID: {ops?.liveProduction.confirmedOrders ?? confirmedOrders}
              {productionLocked ? " · ĐÃ CHỐT" : ""}
            </p>
            {(ops?.windows?.length ?? 0) > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>Theo khung giao</p>
                <div style={{ display: "grid", gap: 4 }}>
                  {ops!.windows.map((w) => (
                    <div
                      key={w.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        padding: "6px 8px",
                        background: "#f5f5f5",
                        borderRadius: 6,
                      }}
                    >
                      <span>
                        {w.startsAt.slice(0, 5)}–{w.endsAt.slice(0, 5)}
                      </span>
                      <strong>{w.paidOrders} đơn</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {FD_CATEGORY_ORDER.map((cat) => {
              const rows = planRows.filter((r) => r.category === cat);
              if (!rows.length) return null;
              return (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{FD_CATEGORY_LABEL[cat]}</p>
                  <div style={{ display: "grid", gap: 6 }}>
                    {rows.map((row) => (
                      <div
                        key={row.menuItemId}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "8px 10px",
                          background: "#fafafa",
                          borderRadius: 8,
                        }}
                      >
                        <span>{row.name}</span>
                        <strong style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {fdFormatCookPlanQty(row.confirmedQuantity, row.selfCookQuantity)}
                          {productionLocked && row.remainingQuantity >= 0
                            ? ` · còn ${row.remainingQuantity}`
                            : ""}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!planRows.some((r) => r.confirmedQuantity > 0) ? (
              <p className="muted">Chưa có đơn PAID — khi khách trả tiền, số lượng hiện ở đây.</p>
            ) : null}
            <div style={{ marginTop: 16 }}>
              {productionLocked ? (
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%" }}
                  onClick={() => setTab("production")}
                >
                  Sang Sản xuất
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  style={{
                    width: "100%",
                    fontSize: 16,
                    padding: "14px 16px",
                    opacity: pastCutoff ? 1 : 0.45,
                  }}
                  disabled={busy || !pastCutoff || !menuPublished}
                  onClick={() => void lockProduction()}
                >
                  {pastCutoff ? "Chốt kế hoạch nấu" : "Chốt sau khi hết giờ nhận đơn"}
                </button>
              )}
            </div>
          </section>
        ) : null}

        {tab === "production" ? (
          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div>
                <p className="section-title" style={{ marginBottom: 4 }}>
                  Sản xuất
                </p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Đơn PAID: {confirmedOrders} · {ops?.batch?.status ?? "PLANNING"}
                  {productionLocked ? " · ĐÃ CHỐT NẤU" : ""}
                </p>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  Nấu sẵn = bếp làm · Tự nấu = giao nguyên liệu (không đếm vào kho tối muộn)
                </p>
              </div>
              {productionLocked ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void unlockProductionOnly()}
                >
                  Mở lại chốt nấu
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!pastCutoff}
                  onClick={() => setTab("plan")}
                >
                  Về kế hoạch nấu
                </button>
              )}
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {productionRows
                .filter((r) => r.confirmedQuantity > 0 || productionLocked)
                .map((row) => (
                  <div
                    key={row.menuItemId}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                  >
                    <span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {FD_CATEGORY_LABEL[row.category as FdRequiredCategory] ?? row.category} ·{" "}
                      </span>
                      {row.name}
                    </span>
                    <strong style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {fdFormatCookPlanQty(row.confirmedQuantity, row.selfCookQuantity)}
                      {productionLocked ? ` · còn ${row.remainingQuantity}` : ""}
                    </strong>
                  </div>
                ))}
              {!productionRows.some((r) => r.confirmedQuantity > 0) ? (
                <p className="muted">Chưa có đơn PAID.</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === "late" ? (
          <section className="card">
            <p className="section-title">Bữa tối muộn</p>
            {!productionLocked ? (
              <p className="muted">Chốt kế hoạch nấu trước khi mở mâm bán nhanh.</p>
            ) : (
              <>
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  Chỉ dùng suất <strong>nấu sẵn còn lại</strong> (đã trừ phần khách tự nấu).
                </p>
                <input
                  value={lateTitle}
                  onChange={(e) => setLateTitle(e.target.value)}
                  placeholder="Tên mâm"
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13 }}>
                    Giá{" "}
                    <input
                      value={latePrice}
                      onChange={(e) => setLatePrice(e.target.value)}
                      inputMode="numeric"
                      style={{ width: 100 }}
                    />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    Số suất{" "}
                    <input
                      value={lateCapacity}
                      onChange={(e) => setLateCapacity(e.target.value)}
                      inputMode="numeric"
                      style={{ width: 64 }}
                    />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    ETA (phút){" "}
                    <input
                      value={lateEta}
                      onChange={(e) => setLateEta(e.target.value)}
                      inputMode="numeric"
                      style={{ width: 56 }}
                    />
                  </label>
                </div>
                {selectedLateItems.length > 0 ? (
                  <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                    Tối đa theo món đã chọn: <strong>{lateMaxCapacity}</strong> suất
                    {Number(lateCapacity) > lateMaxCapacity
                      ? " — sẽ cắt về mức tối đa khi tạo"
                      : ""}
                  </p>
                ) : null}
                <p className="muted" style={{ fontSize: 13 }}>
                  Chọn món trong mâm (còn = suất nấu sẵn):
                </p>
                {productionRows
                  .filter((i) => i.remainingQuantity > 0)
                  .map((i) => {
                    const checked = selectedLateItems.includes(i.menuItemId);
                    return (
                      <label
                        key={i.menuItemId}
                        style={{ display: "flex", gap: 8, alignItems: "center" }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedLateItems((prev) =>
                              checked
                                ? prev.filter((id) => id !== i.menuItemId)
                                : [...prev, i.menuItemId],
                            )
                          }
                        />
                        {i.name} (còn {i.remainingQuantity}
                        {i.selfCookQuantity > 0 ? ` · đã trừ ${i.selfCookQuantity} tự nấu` : ""})
                      </label>
                    );
                  })}
                {!productionRows.some((i) => i.remainingQuantity > 0) ? (
                  <p className="muted">Không còn suất nấu sẵn — không mở được mâm muộn.</p>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 12 }}
                  disabled={busy || selectedLateItems.length === 0 || lateMaxCapacity < 1}
                  onClick={() => void createLateOffer()}
                >
                  Tạo mâm bán nhanh
                </button>
                {lateOffers.length > 0 ? (
                  <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: "none" }}>
                    {lateOffers.map((o) => (
                      <li
                        key={o.id}
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid #eee",
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div>
                          <strong>{o.title}</strong>
                          {o.status === "CLOSED" ? (
                            <span className="muted"> · đã đóng</span>
                          ) : null}{" "}
                          · {formatVnd(o.priceVnd)} · còn {o.remainingCapacity}/{o.capacity} · ~
                          {o.etaMinutes} phút
                        </div>
                        {o.items?.length ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {o.items.map((i) => i.name).join(" · ")}
                          </div>
                        ) : null}
                        {o.status === "ACTIVE" ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: "auto", justifySelf: "start", fontSize: 13 }}
                            disabled={busy}
                            onClick={() => void closeLateOffer(o.id)}
                          >
                            Đóng mâm
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </div>
    </ProviderPageShell>
  );
}
