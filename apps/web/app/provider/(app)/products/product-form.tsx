"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClassifiedPhotoPicker,
  type ClassifiedPhoto,
} from "../../../components/classified-photo-picker";
import { api } from "../../../../lib/api";

export const FOOD_UNITS = ["phần", "tô", "đĩa", "ly", "suất", "cái"] as const;

export type FoodOptionGroup = {
  name: string;
  kind: "SINGLE" | "MULTI";
  options: { name: string; priceDeltaVnd: number }[];
};

export type FoodProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  unit: string;
  prepTimeMinutes: number | null;
  categoryId: string | null;
  categoryName: string | null;
  active: boolean;
  priceVnd: number;
  onBreakfastMenu: boolean;
  optionGroups?: FoodOptionGroup[];
};

type Category = { id: string; name: string };

export function ProductForm({
  locationId,
  product,
}: {
  locationId: string;
  product?: FoodProduct;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? String(product.priceVnd) : "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [unit, setUnit] = useState(product?.unit || "phần");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [prep, setPrep] = useState(product?.prepTimeMinutes ? String(product.prepTimeMinutes) : "");
  const [active, setActive] = useState(product?.active ?? true);
  const [groups, setGroups] = useState<FoodOptionGroup[]>(product?.optionGroups ?? []);
  const [photos, setPhotos] = useState<ClassifiedPhoto[]>(
    product?.imageUrl ? [{ url: product.imageUrl, previewUrl: product.imageUrl, sizeLabel: "" }] : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ categories: Category[] }>(`/provider/locations/${locationId}/product-categories`)
      .then((res) => setCategories(res.categories))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải nhóm món"));
  }, [locationId]);

  async function save() {
    const priceVnd = Number(price.replace(/\D/g, ""));
    if (!name.trim() || !Number.isFinite(priceVnd)) {
      setError("Nhập tên và giá");
      return;
    }
    const prepTimeMinutes = prep.trim() ? Number(prep) : null;
    if (prepTimeMinutes != null && (!Number.isFinite(prepTimeMinutes) || prepTimeMinutes < 1)) {
      setError("Thời gian nấu chưa đúng");
      return;
    }
    const body = {
      name: name.trim(),
      priceVnd,
      description: description.trim() || null,
      imageUrl: photos[0]?.url ?? null,
      unit,
      categoryId: categoryId || null,
      prepTimeMinutes,
      optionGroups: groups
        .map((group) => ({
          name: group.name.trim(),
          kind: group.kind,
          options: group.options
            .map((option) => ({
              name: option.name.trim(),
              priceDeltaVnd: Number(option.priceDeltaVnd) || 0,
            }))
            .filter((option) => option.name),
        }))
        .filter((group) => group.name && group.options.length > 0),
      ...(product ? { active } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      if (product) {
        await api(`/provider/locations/${locationId}/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api(`/provider/locations/${locationId}/products`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      router.push("/provider/products");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      <label className="field">
        Tên món
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gà hầm thuốc bắc" />
      </label>
      <label className="field">
        Mô tả ngắn
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Nước dùng ninh xương, ăn kèm rau"
        />
      </label>
      <ClassifiedPhotoPicker photos={photos} onChange={setPhotos} maxPhotos={1} disabled={busy} />
      <label className="field">
        Giá (đồng)
        <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="45000" />
      </label>
      <label className="field">
        Đơn vị
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          {FOOD_UNITS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nhóm
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Chưa chọn</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Lựa chọn</span>
        <p className="tagline" style={{ margin: "0 0 8px" }}>
          Chỉ thêm khi món có loại hoặc món kèm đổi giá, ví dụ bún mọc / bò, thêm quẩy. Món một giá thì để trống.
        </p>
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className="card" style={{ marginBottom: 8 }}>
            <label className="field">
              Tên nhóm
              <input
                value={group.name}
                placeholder="Loại thịt"
                onChange={(e) =>
                  setGroups((prev) =>
                    prev.map((row, index) => (index === groupIndex ? { ...row, name: e.target.value } : row)),
                  )
                }
              />
            </label>
            <label className="field">
              Cách chọn
              <select
                value={group.kind}
                onChange={(e) =>
                  setGroups((prev) =>
                    prev.map((row, index) =>
                      index === groupIndex ? { ...row, kind: e.target.value === "MULTI" ? "MULTI" : "SINGLE" } : row,
                    ),
                  )
                }
              >
                <option value="SINGLE">Chọn một, bắt buộc</option>
                <option value="MULTI">Thêm nhiều, không bắt buộc</option>
              </select>
            </label>
            {group.options.map((option, optionIndex) => (
              <div key={optionIndex} className="board-row">
                <input
                  value={option.name}
                  placeholder="Bò"
                  onChange={(e) =>
                    setGroups((prev) =>
                      prev.map((row, index) =>
                        index === groupIndex
                          ? {
                              ...row,
                              options: row.options.map((item, i) =>
                                i === optionIndex ? { ...item, name: e.target.value } : item,
                              ),
                            }
                          : row,
                      ),
                    )
                  }
                />
                <input
                  inputMode="numeric"
                  value={option.priceDeltaVnd ? String(option.priceDeltaVnd) : ""}
                  placeholder="Cộng thêm"
                  onChange={(e) =>
                    setGroups((prev) =>
                      prev.map((row, index) =>
                        index === groupIndex
                          ? {
                              ...row,
                              options: row.options.map((item, i) =>
                                i === optionIndex
                                  ? { ...item, priceDeltaVnd: Number(e.target.value.replace(/\D/g, "")) || 0 }
                                  : item,
                              ),
                            }
                          : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <div className="board-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setGroups((prev) =>
                    prev.map((row, index) =>
                      index === groupIndex
                        ? { ...row, options: [...row.options, { name: "", priceDeltaVnd: 0 }] }
                        : row,
                    ),
                  )
                }
              >
                Thêm lựa chọn
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGroups((prev) => prev.filter((_, index) => index !== groupIndex))}
              >
                Xóa nhóm
              </button>
            </div>
          </div>
        ))}
        {groups.length < 4 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setGroups((prev) => [...prev, { name: "", kind: "SINGLE", options: [{ name: "", priceDeltaVnd: 0 }] }])
            }
          >
            Thêm nhóm lựa chọn
          </button>
        ) : null}
      </div>
      <label className="field">
        Thời gian nấu (phút, không bắt buộc)
        <input inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} placeholder="20" />
      </label>
      {product ? (
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Đang bán
        </label>
      ) : null}
      <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
        {busy ? "Đang lưu…" : "Lưu món"}
      </button>
    </div>
  );
}
