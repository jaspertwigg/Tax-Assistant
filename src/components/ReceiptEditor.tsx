import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { FormEvent, useState } from "react";
import { CATEGORIES } from "../lib/countries";
import { useApp } from "../lib/data";
import { db, storage } from "../lib/firebase";
import { parseAmount } from "../lib/format";
import type { Receipt } from "../lib/types";
import { scanReceipt } from "../lib/upload";
import LabelInput from "./LabelInput";
import Modal from "./Modal";

export default function ReceiptEditor({ receipt, allLabels, onClose }: { receipt: Receipt; allLabels: string[]; onClose: () => void }) {
  const { user, profile } = useApp();
  const [form, setForm] = useState({
    merchant: receipt.merchant,
    date: receipt.date,
    amount: receipt.amount?.toString() ?? "",
    taxAmount: receipt.taxAmount?.toString() ?? "",
    currency: receipt.currency || profile.currency,
    category: receipt.category,
    labels: receipt.labels ?? [],
    notes: receipt.notes,
    deductible: receipt.deductible ?? true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const docRef = doc(db, "users", user.uid, "receipts", receipt.id);

  async function act(label: string, fn: () => Promise<unknown>, close = true) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      if (close) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    act("save", () =>
      updateDoc(docRef, {
        merchant: form.merchant.trim(),
        date: form.date,
        amount: parseAmount(form.amount),
        taxAmount: parseAmount(form.taxAmount),
        currency: form.currency.trim().toUpperCase().slice(0, 3),
        category: form.category,
        labels: form.labels,
        notes: form.notes.trim(),
        deductible: form.deductible,
        scanError: null,
      }),
    );
  }

  const isImage = receipt.contentType.startsWith("image/");

  return (
    <Modal title={receipt.merchant || "Receipt"} onClose={onClose}>
      <div className="editor">
        <div className="editor-preview">
          {receipt.downloadUrl ? (
            isImage ? (
              <a href={receipt.downloadUrl} target="_blank" rel="noreferrer">
                <img src={receipt.downloadUrl} alt="Receipt" />
              </a>
            ) : (
              <a className="pdf-tile" href={receipt.downloadUrl} target="_blank" rel="noreferrer">
                📄 Open {receipt.fileName}
              </a>
            )
          ) : (
            <div className="pdf-tile">Uploading…</div>
          )}
          {receipt.ai?.confidence && (
            <p className="muted small">
              Read by Claude · {receipt.ai.confidence} confidence. Check the figures before relying on them.
            </p>
          )}
        </div>
        <form className="stack" onSubmit={save}>
          {receipt.scanError && <p className="warning">{receipt.scanError}</p>}
          <label>
            Merchant
            <input value={form.merchant} onChange={(e) => set("merchant", e.target.value)} />
          </label>
          <div className="grid2">
            <label>
              Date
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </label>
            <label>
              Category
              <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid3">
            <label>
              Total
              <input inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
            </label>
            <label>
              Tax incl.
              <input inputMode="decimal" value={form.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} placeholder="0.00" />
            </label>
            <label>
              Currency
              <input value={form.currency} maxLength={3} onChange={(e) => set("currency", e.target.value)} />
            </label>
          </div>
          <label>
            Labels
            <LabelInput value={form.labels} onChange={(v) => set("labels", v)} suggestions={allLabels} />
          </label>
          <label>
            Notes
            <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={form.deductible} onChange={(e) => set("deductible", e.target.checked)} />
            Business / claimable expense
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="btn primary" disabled={!!busy}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!!busy || !receipt.downloadUrl}
              onClick={() => act("scan", () => scanReceipt(receipt.id))}
            >
              {busy === "scan" ? "Scanning…" : "Re-scan with Claude"}
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={!!busy}
              onClick={() =>
                confirm("Delete this receipt and its image? This can't be undone.") &&
                act("delete", async () => {
                  if (receipt.storagePath) await deleteObject(ref(storage, receipt.storagePath)).catch(() => undefined);
                  await deleteDoc(docRef);
                })
              }
            >
              Delete
            </button>
          </div>
          <p className="muted small">Re-scan only fills fields that are empty.</p>
        </form>
      </div>
    </Modal>
  );
}
