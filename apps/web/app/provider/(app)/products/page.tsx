"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";
import { isMarketVertical } from "../../../../lib/providers";
import type { FoodProduct } from "./product-form";

export default function ProviderProductsPage() {
  const { locationId, activeLocation } = useProviderLocation();
  const market = isMarketVertical(activeLocation?.providerType);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [draftBeerAllowed, setDraftBeerAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FoodProduct | null>(null);
  const [undo, setUndo] = useState<{
    product: FoodProduct;
    previousStatus: "ACTIVE" | "ARCHIVED";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!locationId || !pendingDelete || busy) return;
    const product = pendingDelete;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ previousStatus?: "ACTIVE" | "ARCHIVED" }>(
        `/provider/locations/${locationId}/products/${product.id}`,
        { method: "DELETE" },
      );
      setPendingDelete(null);
      setUndo({
        product,
        previousStatus: res.previousStatus === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
      });
      setProducts((rows) => rows.filter((row) => row.id !== product.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được");
    } finally {
      setBusy(false);
    }
  }

  async function undoDelete() {
    if (!locationId || !undo || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/provider/locations/${locationId}/products/${undo.product.id}/restore`, {
        method: "POST",
        body: JSON.stringify({ status: undo.previousStatus }),
      });
      setUndo(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không hoàn tác được");
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<{ products: FoodProduct[]; draftBeer?: { allowed: boolean } }>(
      `/provider/locations/${locationId}/products`,
    );
    setProducts(res.products);
    setDraftBeerAllowed(res.draftBeer?.allowed === true);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [load]);

  return (
    <ProviderPageShell title="Sản phẩm">
      <div className="board-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1 className="section-title" style={{ margin: 0 }}>
          Sản phẩm
        </h1>
        <Link href="/provider/products/new" className="btn" style={{ width: "auto" }}>
          {market ? "Thêm sản phẩm" : "Thêm món"}
        </Link>
      </div>
      {market ? (
        <p className="tagline">Sản phẩm giữ trong catalog. Hôm nay bán bao nhiêu thì nhập ở tab Hôm nay.</p>
      ) : (
        <p className="tagline">Một món tạo một lần. Sáng, tối và bán ngay dùng chung món này.</p>
      )}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {pendingDelete ? (
        <div
          className="card"
          role="alertdialog"
          aria-labelledby="delete-product-title"
          style={{ marginBottom: 12, borderColor: "#b91c1c" }}
        >
          <p id="delete-product-title" style={{ margin: "0 0 8px" }}>
            <strong>Xóa “{pendingDelete.name}”?</strong>
          </p>
          <p className="stat" style={{ margin: "0 0 12px" }}>
            Món sẽ ra khỏi danh sách bán. Bấm Hoàn tác ngay sau đó nếu xóa nhầm.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setPendingDelete(null)}
            >
              Hủy
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? "…" : "Xóa"}
            </button>
          </div>
        </div>
      ) : null}
      {undo ? (
        <div
          className="card"
          style={{
            marginBottom: 12,
            background: "#e8f8ef",
            borderColor: "#9fd4b5",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <p style={{ margin: 0 }}>Đã xóa “{undo.product.name}”.</p>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", flexShrink: 0 }}
            disabled={busy}
            onClick={() => void undoDelete()}
          >
            {busy ? "…" : "Hoàn tác"}
          </button>
        </div>
      ) : null}
      {draftBeerAllowed && locationId ? (
        <DraftBeerForm locationId={locationId} onSaved={() => void load()} />
      ) : null}
      {products.map((product) => (
        <article
          key={product.id}
          className="card"
          style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}
        >
        <Link
          href={product.alcoholRestricted ? "#bia-hoi" : `/provider/products/${product.id}`}
          style={{ display: "flex", gap: 12, textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              width={64}
              height={64}
              style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
            />
          ) : (
            <span
              aria-hidden
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                background: "#f3efe8",
                flexShrink: 0,
              }}
            />
          )}
          <span>
            <strong>{product.name}</strong>
            <span style={{ display: "block", marginTop: 4 }}>
              {formatVnd(product.priceVnd)} / {product.unit}
              {product.categoryName ? ` · ${product.categoryName}` : ""}
              {product.active ? "" : " · Đã tắt"}
            </span>
            {product.alcoholRestricted ? (
              <span className="stat" style={{ display: "block" }}>
                Sửa ở mục Bia hơi
              </span>
            ) : null}
            {!market && product.onBreakfastMenu ? (
              <span className="stat" style={{ display: "block" }}>
                Có trên menu sáng
              </span>
            ) : null}
          </span>
        </Link>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", flexShrink: 0 }}
            disabled={busy}
            onClick={() => setPendingDelete(product)}
          >
            Xóa
          </button>
        </article>
      ))}
    </ProviderPageShell>
  );
}

const VOLUMES = ["500ml", "1L", "2L", "5L", "10L"] as const;

function DraftBeerForm({ locationId, onSaved }: { locationId: string; onSaved: () => void }) {
  const [prices, setPrices] = useState<Record<string, string>>({
    "500ml": "",
    "1L": "",
    "2L": "",
    "5L": "",
    "10L": "",
  });
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<{
      prices: Record<string, number> | null;
      active: boolean;
    }>(`/provider/locations/${locationId}/draft-beer`)
      .then((row) => {
        if (!row.prices) return;
        setPrices({
          "500ml": String(row.prices["500ml"] ?? ""),
          "1L": String(row.prices["1L"] ?? ""),
          "2L": String(row.prices["2L"] ?? ""),
          "5L": String(row.prices["5L"] ?? ""),
          "10L": String(row.prices["10L"] ?? ""),
        });
        setActive(row.active);
      })
      .catch(() => undefined);
  }, [locationId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const body = {
      active,
      prices: {
        "500ml": Number(prices["500ml"]),
        "1L": Number(prices["1L"]),
        "2L": Number(prices["2L"]),
        "5L": Number(prices["5L"]),
        "10L": Number(prices["10L"]),
      },
    };
    try {
      await api(`/provider/locations/${locationId}/draft-beer`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setMessage("Đã lưu bia hơi");
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Không lưu được");
    }
  }

  return (
    <form id="bia-hoi" className="card" style={{ marginBottom: 12 }} onSubmit={(event) => void save(event)}>
      <strong>Bia hơi</strong>
      <p className="stat" style={{ margin: "4px 0 8px" }}>
        Một món, năm dung tích. Rót tại quán sau khi khách thanh toán.
      </p>
      {VOLUMES.map((volume) => (
        <label key={volume} className="field">
          {volume} (đ)
          <input
            inputMode="numeric"
            value={prices[volume] ?? ""}
            onChange={(event) => setPrices((prev) => ({ ...prev, [volume]: event.target.value }))}
            required
          />
        </label>
      ))}
      <label className="field" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Đang bán
      </label>
      {message ? <p className="stat">{message}</p> : null}
      <button className="btn" type="submit">
        Lưu bia hơi
      </button>
    </form>
  );
}
