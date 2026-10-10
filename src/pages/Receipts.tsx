import { limit, orderBy } from "firebase/firestore";
import { DragEvent, useMemo, useRef, useState } from "react";
import ReceiptEditor from "../components/ReceiptEditor";
import { CATEGORIES } from "../lib/countries";
import { useApp, useUserCollection } from "../lib/data";
import { formatDate, formatMoney } from "../lib/format";
import type { Receipt } from "../lib/types";
import { uploadReceipt } from "../lib/upload";

type Scope = "year" | "all" | "review";

export function needsReview(r: Receipt): boolean {
  return r.status === "ready" && (!r.date || r.amount == null || !r.category || !!r.scanError);
}

export default function Receipts() {
  const { user, profile, taxYear } = useApp();
  const { items, loading, error } = useUserCollection<Receipt>(user.uid, "receipts", [orderBy("createdAt", "desc"), limit(2000)], []);
  const [scope, setScope] = useState<Scope>("year");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<{ name: string; state: "uploading" | "done" | "failed"; message?: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const allLabels = useMemo(() => [...new Set(items.flatMap((r) => r.labels ?? []))].sort(), [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((r) => {
        if (scope === "year" && r.date && (r.date < taxYear.start || r.date > taxYear.end)) return false;
        if (scope === "review" && !needsReview(r)) return false;
        if (category && r.category !== category) return false;
        if (label && !(r.labels ?? []).includes(label)) return false;
        if (q && ![r.merchant, r.notes, r.category, ...(r.labels ?? [])].join(" ").toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (b.date || "9999").localeCompare(a.date || "9999"));
  }, [items, scope, search, category, label, taxYear]);

  const total = visible.reduce((s, r) => s + (r.amount ?? 0), 0);
  const reviewCount = items.filter(needsReview).length;
  const open = items.find((r) => r.id === openId);

  async function handleFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!list.length) return;
    setUploads((u) => [...list.map((f) => ({ name: f.name, state: "uploading" as const })), ...u].slice(0, 10));
    await Promise.all(
      list.map(async (f) => {
        try {
          await uploadReceipt(user.uid, f, { currency: profile.currency });
          setUploads((u) => u.map((x) => (x.name === f.name && x.state === "uploading" ? { ...x, state: "done" } : x)));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setUploads((u) => u.map((x) => (x.name === f.name && x.state === "uploading" ? { ...x, state: "failed", message } : x)));
        }
      }),
    );
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`page ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className="page-header">
        <div>
          <h1>Receipts</h1>
          <p className="muted">Snap or upload a receipt and Claude reads the merchant, date, total, tax and category for you.</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => cameraRef.current?.click()}>
            📷 Scan receipt
          </button>
          <button className="btn" onClick={() => filesRef.current?.click()}>
            ⬆ Upload files
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={filesRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </header>

      {uploads.length > 0 && (
        <div className="upload-list">
          {uploads.map((u, i) => (
            <div key={i} className={`upload-item ${u.state}`}>
              <span>{u.name}</span>
              <span>{u.state === "uploading" ? "Uploading & scanning…" : u.state === "done" ? "Added ✓" : `Failed: ${u.message}`}</span>
            </div>
          ))}
          <button className="link small" onClick={() => setUploads([])}>
            Clear
          </button>
        </div>
      )}

      <div className="filters">
        <div className="segmented">
          <button className={scope === "year" ? "on" : ""} onClick={() => setScope("year")}>
            {taxYear.label}
          </button>
          <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
            All
          </button>
          <button className={scope === "review" ? "on" : ""} onClick={() => setScope("review")}>
            Needs review{reviewCount ? ` (${reviewCount})` : ""}
          </button>
        </div>
        <input type="search" placeholder="Search merchant, notes, labels…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">All labels</option>
          {allLabels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>

      <p className="muted small">
        {visible.length} receipt{visible.length === 1 ? "" : "s"} · {formatMoney(total, profile.currency)}
      </p>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p>No receipts here yet.</p>
          <p className="muted">Tap “Scan receipt” to photograph one, or drag files onto this page.</p>
        </div>
      ) : (
        <div className="receipt-grid">
          {visible.map((r) => (
            <button key={r.id} className="receipt-card" onClick={() => setOpenId(r.id)}>
              <div className="thumb">
                {r.downloadUrl && r.contentType.startsWith("image/") ? (
                  <img src={r.downloadUrl} alt="" loading="lazy" />
                ) : (
                  <span>{r.contentType === "application/pdf" ? "PDF" : "…"}</span>
                )}
              </div>
              <div className="receipt-info">
                <div className="receipt-top">
                  <strong>{r.merchant || (r.status === "ready" ? "Unknown merchant" : "Reading…")}</strong>
                  <span className="amount">{formatMoney(r.amount, r.currency || profile.currency)}</span>
                </div>
                <div className="muted small">
                  {formatDate(r.date)} · {r.category || "Uncategorised"}
                  {r.deductible === false && " · personal"}
                </div>
                <div className="chips">
                  {r.status !== "ready" && <span className="badge info">{r.status === "uploading" ? "Uploading" : "Scanning"}</span>}
                  {needsReview(r) && <span className="badge warn">Check</span>}
                  {(r.labels ?? []).map((l) => (
                    <span key={l} className="chip small">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <ReceiptEditor key={open.id + open.status} receipt={open} allLabels={allLabels} onClose={() => setOpenId(null)} />}
    </div>
  );
}
