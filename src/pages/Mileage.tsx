import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { FormEvent, useState } from "react";
import { useApp, useYearCollection } from "../lib/data";
import { db } from "../lib/firebase";
import { formatDate, formatMoney, todayIso } from "../lib/format";
import type { Trip } from "../lib/types";

export default function MileagePage() {
  const { user, profile } = useApp();
  const { items, loading, error } = useYearCollection<Trip>("mileage");
  const [form, setForm] = useState({ date: todayIso(), from: "", to: "", purpose: "", distance: "", returnTrip: false });
  const [saving, setSaving] = useState(false);
  const total = items.reduce((s, t) => s + (t.distance ?? 0), 0);
  const unit = profile.distanceUnit;

  async function add(e: FormEvent) {
    e.preventDefault();
    const d = Number(form.distance);
    if (!Number.isFinite(d) || d <= 0) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "mileage"), {
        date: form.date,
        from: form.from.trim(),
        to: form.to.trim(),
        purpose: form.purpose.trim(),
        distance: Math.round(d * (form.returnTrip ? 2 : 1) * 10) / 10,
        createdAt: serverTimestamp(),
      });
      setForm((f) => ({ ...f, from: "", to: "", purpose: "", distance: "", returnTrip: false }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Mileage log</h1>
          <p className="muted">
            Record business journeys. Total this tax year: <strong>{total.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit}</strong>
            {profile.mileageRate > 0 && <> ≈ {formatMoney(total * profile.mileageRate, profile.currency)} at {profile.mileageRate}/{unit === "miles" ? "mile" : "km"} (set in Settings)</>}
          </p>
        </div>
      </header>

      <form className="card trip-form" onSubmit={add}>
        <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input placeholder="From" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        <input placeholder="To" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        <input placeholder="Purpose (e.g. client visit)" required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        <input inputMode="decimal" placeholder={`Distance (${unit})`} required value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
        <label className="checkbox">
          <input type="checkbox" checked={form.returnTrip} onChange={(e) => setForm({ ...form, returnTrip: e.target.checked })} />
          Return trip
        </label>
        <button className="btn primary" disabled={saving}>
          Add trip
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>No trips logged for this tax year.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Journey</th>
                <th>Purpose</th>
                <th className="num">{unit}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{[t.from, t.to].filter(Boolean).join(" → ") || "—"}</td>
                  <td>{t.purpose}</td>
                  <td className="num">{t.distance}</td>
                  <td className="num">
                    <button
                      className="icon-btn"
                      aria-label="Delete trip"
                      onClick={() => confirm("Delete this trip?") && deleteDoc(doc(db, "users", user.uid, "mileage", t.id))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
