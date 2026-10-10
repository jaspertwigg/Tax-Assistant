import { FormEvent, useState } from "react";
import Modal from "../components/Modal";
import { useApp, useYearRecords } from "../lib/data";
import { newId, patch, put, remove } from "../lib/db";
import { formatDate, formatMoney, parseAmount, todayIso } from "../lib/format";
import { INCOME_TYPES, type Income } from "../lib/types";

const EMPTY = { date: todayIso(), source: "", type: INCOME_TYPES[0], amount: "", taxPaid: "", notes: "" };

export default function IncomePage() {
  const { profile } = useApp();
  const { items, loading } = useYearRecords<Income>("income");
  const [editing, setEditing] = useState<{ id: string | null; form: typeof EMPTY } | null>(null);
  const total = items.reduce((s, i) => s + (i.amount ?? 0), 0);

  const byType = new Map<string, number>();
  for (const i of items) byType.set(i.type, (byType.get(i.type) ?? 0) + (i.amount ?? 0));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Income</h1>
          <p className="muted">Log what you earn so you and Claude can see the whole picture.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ id: null, form: { ...EMPTY, date: todayIso() } })}>
          + Add income
        </button>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Total this tax year</span>
          <span className="stat-value">{formatMoney(total, profile.currency)}</span>
        </div>
        {[...byType.entries()].map(([t, v]) => (
          <div className="stat" key={t}>
            <span className="stat-label">{t}</span>
            <span className="stat-value">{formatMoney(v, profile.currency)}</span>
          </div>
        ))}
      </section>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>No income recorded for this tax year.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Type</th>
                <th className="num">Amount</th>
                <th className="num">Tax deducted</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="clickable"
                  onClick={() =>
                    setEditing({
                      id: i.id,
                      form: { date: i.date, source: i.source, type: i.type, amount: String(i.amount ?? ""), taxPaid: i.taxPaid?.toString() ?? "", notes: i.notes ?? "" },
                    })
                  }
                >
                  <td>{formatDate(i.date)}</td>
                  <td>{i.source}</td>
                  <td>{i.type}</td>
                  <td className="num">{formatMoney(i.amount, profile.currency)}</td>
                  <td className="num">{formatMoney(i.taxPaid, profile.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <IncomeForm {...editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function IncomeForm({ id, form: initial, onClose }: { id: string | null; form: typeof EMPTY; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (amount == null) return setError("Enter an amount.");
    const data = { date: form.date, source: form.source.trim(), type: form.type, amount, taxPaid: parseAmount(form.taxPaid), notes: form.notes.trim() };
    try {
      if (id) await patch("income", id, data);
      else await put("income", { ...data, id: newId(), createdAt: Date.now() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal title={id ? "Edit income" : "Add income"} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="grid2">
          <label>
            Date
            <input type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => set("type", e.target.value)}>
              {INCOME_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Source
          <input required placeholder="e.g. client name, employer, tenant" value={form.source} onChange={(e) => set("source", e.target.value)} />
        </label>
        <div className="grid2">
          <label>
            Amount (gross)
            <input inputMode="decimal" required value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </label>
          <label>
            Tax already deducted
            <input inputMode="decimal" placeholder="optional" value={form.taxPaid} onChange={(e) => set("taxPaid", e.target.value)} />
          </label>
        </div>
        <label>
          Notes
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary">Save</button>
          {id && (
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                if (confirm("Delete this entry?")) {
                  await remove("income", id);
                  onClose();
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
