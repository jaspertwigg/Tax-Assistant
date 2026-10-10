import { signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { FormEvent, useState } from "react";
import { COUNTRIES, CountryCode } from "../lib/countries";
import { useApp } from "../lib/data";
import { auth, db } from "../lib/firebase";

const MILEAGE_DEFAULTS: Partial<Record<CountryCode, { rate: number; unit: "miles" | "km" }>> = {
  UK: { rate: 0.45, unit: "miles" },
  US: { rate: 0.7, unit: "miles" },
  AU: { rate: 0.88, unit: "km" },
  IE: { rate: 0.4, unit: "km" },
  NZ: { rate: 1.04, unit: "km" },
  CA: { rate: 0.72, unit: "km" },
};

export default function SettingsPage() {
  const { user, profile } = useApp();
  const [form, setForm] = useState({ ...profile, mileageRate: String(profile.mileageRate) });
  const [status, setStatus] = useState<string | null>(null);

  function changeCountry(country: CountryCode) {
    const m = MILEAGE_DEFAULTS[country];
    setForm((f) => ({
      ...f,
      country,
      currency: COUNTRIES[country].currency,
      ...(m ? { mileageRate: String(m.rate), distanceUnit: m.unit } : {}),
    }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus("Saving…");
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          country: form.country,
          currency: form.currency.trim().toUpperCase().slice(0, 3) || "GBP",
          situation: form.situation.trim().slice(0, 2000),
          mileageRate: Number(form.mileageRate) || 0,
          distanceUnit: form.distanceUnit,
        },
        { merge: true },
      );
      setStatus("Saved ✓");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Signed in as {user.email ?? user.displayName}</p>
        </div>
        <button className="btn" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </header>

      <form className="card stack" onSubmit={save}>
        <div className="grid2">
          <label>
            Country (sets tax year & deadlines)
            <select value={form.country} onChange={(e) => changeCountry(e.target.value as CountryCode)}>
              {(Object.keys(COUNTRIES) as CountryCode[]).map((c) => (
                <option key={c} value={c}>
                  {COUNTRIES[c].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </label>
        </div>
        <label>
          About your tax situation (shared with Claude)
          <textarea
            rows={4}
            placeholder="e.g. Self-employed electrician, sole trader since 2022, not VAT registered. Also rent out a flat. Work from home two days a week."
            value={form.situation}
            onChange={(e) => setForm({ ...form, situation: e.target.value })}
          />
        </label>
        <div className="grid2">
          <label>
            Mileage rate per {form.distanceUnit === "miles" ? "mile" : "km"}
            <input inputMode="decimal" value={form.mileageRate} onChange={(e) => setForm({ ...form, mileageRate: e.target.value })} />
          </label>
          <label>
            Distance unit
            <select value={form.distanceUnit} onChange={(e) => setForm({ ...form, distanceUnit: e.target.value as "miles" | "km" })}>
              <option value="miles">Miles</option>
              <option value="km">Kilometres</option>
            </select>
          </label>
        </div>
        <p className="muted small">
          Mileage defaults are recent standard rates and change over time — check your tax authority’s current rate (Claude can look it up for you).
        </p>
        <div className="actions">
          <button className="btn primary">Save settings</button>
          {status && <span className="muted">{status}</span>}
        </div>
      </form>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">
          Receipts, figures and chats are stored in your own Firebase project and only your account can read them. Claude only sees your
          records when you ask it a question or scan a receipt. Use “Export CSV” on the Overview page to send your year to an accountant.
        </p>
      </section>
    </div>
  );
}
