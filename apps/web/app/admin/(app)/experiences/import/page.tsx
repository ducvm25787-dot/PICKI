"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminPageShell } from "../../../../components/admin-session-context";
import { api } from "../../../../../lib/api";
import {
  AUDIENCE_LABELS,
  CATEGORY_LABELS,
  formatOccurrence,
} from "../../../../../lib/experiences";

type FieldError = { path: string; message: string };
type Duplicate = { id: string; title: string; venueName: string; whenLabel: string };
type Decision = "import" | "skip" | "import_anyway" | "attach_source" | "pending";

type Filled = {
  title: string;
  summary: string;
  whyGo: string;
  organizer: { name: string };
  venue: { name: string; address: string | null };
  occurrences: { startAt: string }[];
  priceMode: "FREE" | "PRICED" | "UNKNOWN";
  priceFrom: number | null;
  priceTo: number | null;
  priceNote: string | null;
  categories: string[];
  audiences: string[];
  sourceName: string;
};

type Candidate = {
  index: number;
  errors: FieldError[];
  experience: Filled | null;
  duplicate: Duplicate | null;
};

type Row = {
  key: string;
  input: Record<string, unknown>;
  filled: Filled | null;
  errors: FieldError[];
  duplicate: Duplicate | null;
  decision: Decision;
  editing: boolean;
};

type CommitOutcome = {
  created: { id: string; title: string }[];
  attached: { id: string; title: string }[];
  skipped: number;
  errors: { index: number; message: string }[];
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const AUDIENCES = Object.keys(AUDIENCE_LABELS);

export default function ExperienceImportPage() {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitOutcome | string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setParseError(null);
    setResult(null);
    let items: unknown[];
    try {
      items = parsePaste(raw);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "JSON không đọc được");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ candidates: Candidate[] }>("/admin/experiences/import/preview", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setRows(
        res.candidates.map((candidate, index) => ({
          key: `${index}-${titleOf(items[index])}`,
          input: asRecord(items[index]) ?? {},
          filled: candidate.experience,
          errors: candidate.errors,
          duplicate: candidate.duplicate,
          decision: initialDecision(candidate),
          editing: candidate.errors.length > 0,
        })),
      );
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Không kiểm tra được");
    } finally {
      setBusy(false);
    }
  }

  async function refreshRow(index: number) {
    const row = rows[index];
    if (!row) return;
    const res = await api<{ candidates: Candidate[] }>("/admin/experiences/import/preview", {
      method: "POST",
      body: JSON.stringify({ items: [row.input] }),
    });
    const candidate = res.candidates[0];
    if (!candidate) return;
    setRows((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              filled: candidate.experience,
              errors: candidate.errors,
              duplicate: candidate.duplicate,
              decision: initialDecision(candidate),
              editing: candidate.errors.length > 0,
            }
          : item,
      ),
    );
  }

  async function commit() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{
        created: { index: number; id: string }[];
        attached: { index: number; id: string }[];
        skipped: number[];
        errors: { index: number; message: string }[];
      }>("/admin/experiences/import/commit", {
        method: "POST",
        body: JSON.stringify({
          items: rows.map((row) => ({
            decision: row.decision === "pending" ? "skip" : row.decision,
            experience: row.input,
          })),
        }),
      });
      setResult({
        created: res.created.map((item) => ({
          id: item.id,
          title: rows[item.index]?.filled?.title ?? titleOf(rows[item.index]?.input),
        })),
        attached: (res.attached ?? []).map((item) => ({
          id: item.id,
          title: rows[item.index]?.duplicate?.title ?? titleOf(rows[item.index]?.input),
        })),
        skipped: res.skipped.length,
        errors: res.errors,
      });
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Không ghi draft");
    } finally {
      setBusy(false);
    }
  }

  const blocked = rows.some((row) => row.decision === "pending");

  return (
    <AdminPageShell title="Import nhanh">
      <p className="stat">
        <Link href="/admin/experiences">← Trải nghiệm</Link>
      </p>
      <p className="stat">
        Dán một object hoặc một mảng JSON. Kiểm tra tạo bản xem trước. Xuất bản vẫn là bước sau.
      </p>
      <div className="field">
        <label htmlFor="import-json">JSON</label>
        <textarea
          id="import-json"
          rows={10}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
        />
      </div>
      <button type="button" className="btn" disabled={busy || raw.trim().length === 0} onClick={() => void preview()}>
        Kiểm tra
      </button>
      {parseError ? <p style={{ color: "crimson" }}>{parseError}</p> : null}

      {rows.map((row, index) => (
        <article key={row.key} className="card experience-import-row">
          <strong>{titleOf(row.input)}</strong>
          <p className="stat">
            {row.errors.length > 0 ? "Cần sửa" : row.duplicate ? "Có thể trùng" : "Sẵn sàng"} ·{" "}
            {decisionLabel(row.decision)}
          </p>
          {row.filled ? <FilledSummary filled={row.filled} /> : null}
          {row.duplicate ? (
            <p className="stat">
              Đã có: {row.duplicate.title}
              {row.duplicate.whenLabel ? ` · ${row.duplicate.whenLabel}` : ""} · {row.duplicate.venueName}{" "}
              <Link href={`/admin/experiences/${row.duplicate.id}`}>Mở bản đã có</Link>
            </p>
          ) : null}
          {row.errors.map((error) => (
            <p key={`${error.path}-${error.message}`} className="stat" style={{ color: "crimson" }}>
              {error.path}: {error.message}
            </p>
          ))}
          <div className="experience-import-actions">
            <button type="button" className="btn btn-secondary" onClick={() => toggleEdit(setRows, index)}>
              Sửa
            </button>
            <a className="btn btn-secondary" href={sourceUrl(row.input)} target="_blank" rel="noreferrer">
              Mở nguồn
            </a>
            <button type="button" className="btn btn-secondary" onClick={() => setDecision(setRows, index, "skip")}>
              Bỏ qua
            </button>
            {row.duplicate ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDecision(setRows, index, "attach_source")}
              >
                Gắn thêm nguồn
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDecision(setRows, index, "import_anyway")}
            >
              Vẫn import
            </button>
          </div>
          {row.editing ? (
            <ImportEditor
              input={row.input}
              onChange={(next) =>
                setRows((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, input: next } : item)),
                )
              }
              onDone={() => void refreshRow(index)}
            />
          ) : null}
        </article>
      ))}

      {rows.length > 0 ? (
        <button type="button" className="btn" disabled={busy || blocked} onClick={() => void commit()}>
          Ghi lựa chọn
        </button>
      ) : null}
      {blocked ? (
        <p className="stat">Dòng trùng hoặc lỗi cần Sửa, Bỏ qua, Vẫn import, hoặc Gắn thêm nguồn.</p>
      ) : null}
      {typeof result === "string" ? <p className="stat">{result}</p> : null}
      {result && typeof result !== "string" ? <CommitResult outcome={result} /> : null}
    </AdminPageShell>
  );
}

function ImportEditor({
  input,
  onChange,
  onDone,
}: {
  input: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  onDone: () => void;
}) {
  function setField(key: string, value: unknown) {
    onChange({ ...input, [key]: value });
  }
  const categories = arrayOf(input.categories);
  const audiences = arrayOf(input.audiences);
  const occurrences = Array.isArray(input.occurrences) ? input.occurrences : [];
  const first = asRecord(occurrences[0]) ?? {};

  return (
    <div className="experience-import-edit">
      <div className="field">
        <label>Tiêu đề</label>
        <input value={stringOf(input.title)} onChange={(event) => setField("title", event.target.value)} />
      </div>
      <div className="field">
        <label>Tóm tắt</label>
        <textarea rows={3} value={stringOf(input.summary)} onChange={(event) => setField("summary", event.target.value)} />
      </div>
      <div className="field">
        <label>Vì sao đáng đi</label>
        <textarea rows={3} value={stringOf(input.why_go ?? input.whyGo)} onChange={(event) => setField("why_go", event.target.value)} />
      </div>
      <div className="field">
        <label>Giá</label>
        <select
          value={stringOf(input.price_mode ?? input.priceMode)}
          onChange={(event) => setField("price_mode", event.target.value)}
        >
          <option value="FREE">Miễn phí</option>
          <option value="PRICED">Có giá</option>
          <option value="UNKNOWN">Chưa rõ</option>
        </select>
      </div>
      <p className="stat">Sự kiện vừa miễn phí vừa có vé: chọn Có giá và ghi phần miễn phí vào ghi chú.</p>
      <div className="field">
        <label>Giá từ (VND)</label>
        <input
          inputMode="numeric"
          value={stringOf(input.price_from ?? input.priceFrom)}
          onChange={(event) => setField("price_from", event.target.value === "" ? null : Number(event.target.value))}
        />
      </div>
      <div className="field">
        <label>Giá đến (VND)</label>
        <input
          inputMode="numeric"
          value={stringOf(input.price_to ?? input.priceTo)}
          onChange={(event) => setField("price_to", event.target.value === "" ? null : Number(event.target.value))}
        />
      </div>
      <div className="field">
        <label>Ghi chú giá</label>
        <input
          value={stringOf(input.price_note ?? input.priceNote)}
          onChange={(event) => setField("price_note", event.target.value)}
        />
      </div>
      <div className="field">
        <label>Bắt đầu suất đầu</label>
        <input
          value={stringOf(first.start_at ?? first.startAt)}
          onChange={(event) => {
            const next = { ...first, start_at: event.target.value };
            const rest = occurrences.slice(1);
            setField("occurrences", [next, ...rest]);
          }}
        />
      </div>
      <div className="field">
        <label>Link đặt chỗ</label>
        <input
          value={stringOf(input.booking_url ?? input.bookingUrl)}
          onChange={(event) => setField("booking_url", event.target.value)}
        />
      </div>
      <fieldset className="field">
        <legend>Đối tượng</legend>
        {AUDIENCES.map((audience) => (
          <label key={audience}>
            <input
              type="checkbox"
              checked={audiences.includes(audience)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...audiences, audience]
                  : audiences.filter((item) => item !== audience);
                setField("audiences", next);
              }}
            />{" "}
            {AUDIENCE_LABELS[audience]}
          </label>
        ))}
      </fieldset>
      <fieldset className="field">
        <legend>Nhóm</legend>
        {CATEGORIES.map((category) => (
          <label key={category}>
            <input
              type="checkbox"
              checked={categories.includes(category)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...categories, category]
                  : categories.filter((item) => item !== category);
                setField("categories", next);
              }}
            />{" "}
            {CATEGORY_LABELS[category]}
          </label>
        ))}
      </fieldset>
      <button type="button" className="btn" onClick={onDone}>
        Cập nhật dòng
      </button>
    </div>
  );
}

function FilledSummary({ filled }: { filled: Filled }) {
  const price =
    filled.priceMode === "FREE"
      ? "Miễn phí"
      : filled.priceMode === "UNKNOWN"
        ? "Chưa rõ giá"
        : [filled.priceFrom, filled.priceTo].filter((value) => value != null).join("–") + " đ";
  return (
    <div className="stat">
      <p>
        {filled.organizer.name} · {filled.venue.name}
        {filled.venue.address ? ` · ${filled.venue.address}` : ""}
      </p>
      <p>{filled.occurrences.map((item) => formatOccurrence(item.startAt)).join(" · ")}</p>
      <p>
        {price}
        {filled.priceNote ? ` · ${filled.priceNote}` : ""}
      </p>
      <p>{filled.whyGo}</p>
      <p>
        {filled.categories.map((item) => CATEGORY_LABELS[item] ?? item).join(", ")} ·{" "}
        {filled.audiences.map((item) => AUDIENCE_LABELS[item] ?? item).join(", ")}
      </p>
      <p>Nguồn: {filled.sourceName}</p>
    </div>
  );
}

function CommitResult({ outcome }: { outcome: CommitOutcome }) {
  return (
    <div className="card">
      <p className="stat">
        Draft mới {outcome.created.length}. Gắn nguồn {outcome.attached.length}. Bỏ qua {outcome.skipped}. Lỗi{" "}
        {outcome.errors.length}.
      </p>
      {outcome.created.map((item) => (
        <p key={item.id}>
          <Link href={`/admin/experiences/${item.id}`}>{item.title}</Link>
        </p>
      ))}
      {outcome.attached.map((item) => (
        <p key={`src-${item.id}`}>
          Đã gắn nguồn vào <Link href={`/admin/experiences/${item.id}`}>{item.title}</Link>
        </p>
      ))}
      {outcome.errors.map((error) => (
        <p key={`${error.index}-${error.message}`} className="stat" style={{ color: "crimson" }}>
          Dòng {error.index + 1}: {error.message}
        </p>
      ))}
      <p>
        <Link href="/admin/experiences">Mở danh sách để xuất bản</Link>
      </p>
    </div>
  );
}

function parsePaste(text: string): unknown[] {
  const value = JSON.parse(text) as unknown;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  throw new Error("JSON phải là một object hoặc một mảng");
}

function initialDecision(candidate: Candidate): Decision {
  if (candidate.errors.length > 0 || candidate.duplicate) return "pending";
  return "import";
}

function decisionLabel(decision: Decision): string {
  if (decision === "skip") return "Bỏ qua";
  if (decision === "import_anyway") return "Vẫn import";
  if (decision === "attach_source") return "Sẽ gắn nguồn";
  if (decision === "import") return "Sẽ tạo draft";
  return "Chưa chọn";
}

function titleOf(value: unknown): string {
  const row = asRecord(value);
  const title = row?.title;
  return typeof title === "string" && title.trim() ? title : "Chưa có tiêu đề";
}

function sourceUrl(input: Record<string, unknown>): string {
  const url = input.source_url ?? input.sourceUrl;
  return typeof url === "string" ? url : "#";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function arrayOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toggleEdit(setRows: (value: Row[] | ((current: Row[]) => Row[])) => void, index: number) {
  setRows((current) =>
    current.map((item, itemIndex) => (itemIndex === index ? { ...item, editing: !item.editing } : item)),
  );
}

function setDecision(
  setRows: (value: Row[] | ((current: Row[]) => Row[])) => void,
  index: number,
  decision: Decision,
) {
  setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, decision } : item)));
}
