import { Link } from "react-router-dom";
import { saveFile } from "../lib/backup";
import { toCsv } from "../lib/csv";
import { upcomingDeadlines } from "../lib/deadlines";
import { useApp, useCountry, useYearRecords } from "../lib/data";
import { daysUntil, formatDate, formatMoney } from "../lib/format";
import type { Income, Receipt, Trip } from "../lib/types";
import { needsReview } from "./Receipts";

export default function Dashboard() {
  const { profile, apiKey, taxYear } = useApp();
  const country = useCountry();
  const receipts = useYearRecords<Receipt>("receipts");
  const income = useYearRecords<Income>("income");
  const trips = useYearRecords<Trip>("mileage");
  const cur = profile.currency;

  const claimable = receipts.items.filter((r) => r.deductible !== false);
  const expenses = claimable.reduce((s, r) => s + (r.amount ?? 0), 0);
  const personal = receipts.items.filter((r) => r.deductible === false).reduce((s, r) => s + (r.amount ?? 0), 0);
  const salesTax = claimable.reduce((s, r) => s + (r.taxAmount ?? 0), 0);
  const incomeTotal = income.items.reduce((s, r) => s + (r.amount ?? 0), 0);
  const taxDeducted = income.items.reduce((s, r) => s + (r.taxPaid ?? 0), 0);
  const distance = trips.items.reduce((s, t) => s + (t.distance ?? 0), 0);
  const claimableDistance = country.mileage.cap ? Math.min(distance, country.mileage.cap) : distance;
  const mileageClaim = claimableDistance * (profile.mileageRate || 0);
  const review = receipts.items.filter(needsReview).length;

  const byCategory = new Map<string, number>();
  for (const r of claimable) byCategory.set(r.category || "Uncategorised", (byCategory.get(r.category || "Uncategorised") ?? 0) + (r.amount ?? 0));
  const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));

  const deadlines = upcomingDeadlines(profile.country).filter((d) => daysUntil(d.date) >= 0).slice(0, 3);
  const slug = taxYear.label.replace("/", "-");

  async function exportAll() {
    await saveFile(
      toCsv(
        ["Type", "Date", "Description", "Category / income type", "Amount", "Tax included / deducted", "Currency", "Claimable", "Labels", "Notes"],
        [
          ...receipts.items.map((r) => ["Expense", r.date, r.merchant, r.category, r.amount, r.taxAmount, r.currency || cur, r.deductible === false ? "No" : "Yes", r.labels, r.notes]),
          ...income.items.map((i) => ["Income", i.date, i.source, i.type, i.amount, i.taxPaid, cur, "", "", i.notes]),
          ...trips.items.map((t) => ["Car trip", t.date, [t.from, t.to].filter(Boolean).join(" to "), t.purpose, t.distance, "", profile.distanceUnit, "", "", ""]),
        ],
      ),
      `tax-year-${slug}.csv`,
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            {country.yearTerm} {taxYear.label}
          </h1>
          <p className="muted">
            {formatDate(taxYear.start)} – {formatDate(taxYear.end)}
          </p>
        </div>
        <div className="actions">
          <Link className="btn primary" to="/receipts">
            📷 Add receipt
          </Link>
          <button className="btn" onClick={exportAll}>
            Export CSV for accountant
          </button>
        </div>
      </header>

      {!apiKey && (
        <Link to="/settings" className="notice">
          Add your Claude API key in Settings to have receipts read automatically and to chat with Claude →
        </Link>
      )}
      {review > 0 && (
        <Link to="/receipts" className="notice">
          {review} receipt{review === 1 ? "" : "s"} need a quick check (missing date, amount or category). →
        </Link>
      )}

      <section className="stats">
        <Stat label="Claimable expenses" value={formatMoney(expenses, cur)} sub={plural(claimable.length, "receipt")} />
        <Stat label="Income recorded" value={formatMoney(incomeTotal, cur)} sub={taxDeducted ? `${formatMoney(taxDeducted, cur)} ${country.taxWithheldName.toLowerCase()}` : plural(income.items.length, "entry", "entries")} />
        <Stat
          label={country.currency === "AUD" ? "Work car trips" : "Mileage"}
          value={`${distance.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${profile.distanceUnit}`}
          sub={mileageClaim ? `≈ ${formatMoney(mileageClaim, cur)} at your rate${claimableDistance < distance ? ` (capped at ${country.mileage.cap?.toLocaleString()} ${profile.distanceUnit})` : ""}` : plural(trips.items.length, "trip")}
        />
        <Stat label={`${country.salesTaxName} on expenses`} value={formatMoney(salesTax, cur)} sub="Shown on receipts" />
        <Stat
          label="Income less costs"
          value={formatMoney(incomeTotal - expenses - mileageClaim, cur)}
          sub="Rough estimate before tax"
        />
        {personal > 0 && <Stat label="Personal (not claimed)" value={formatMoney(personal, cur)} sub="Excluded from totals" />}
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Expenses by category</h2>
          {cats.length === 0 ? (
            <p className="muted">No claimable receipts in this {country.yearTerm.toLowerCase()} yet.</p>
          ) : (
            <ul className="bars">
              {cats.map(([c, v]) => (
                <li key={c}>
                  <div className="bar-label">
                    <span>{c}</span>
                    <span>{formatMoney(v, cur)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(v / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Coming up</h2>
          {deadlines.length === 0 ? (
            <p className="muted">Set your country in Settings to see key tax dates.</p>
          ) : (
            <ul className="deadline-list">
              {deadlines.map((d) => (
                <li key={d.date + d.title}>
                  <div className="deadline-date">
                    <strong>{formatDate(d.date)}</strong>
                    <span className="muted small">in {daysUntil(d.date)} days</span>
                  </div>
                  <div>{d.title}</div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/deadlines" className="link small">
            All dates & reminders →
          </Link>
          <hr />
          <h2>Recent receipts</h2>
          <ul className="simple-list">
            {receipts.items.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span>
                  {r.merchant || "Unknown"} <span className="muted small">· {formatDate(r.date)}</span>
                </span>
                <span>{formatMoney(r.amount, r.currency || cur)}</span>
              </li>
            ))}
            {receipts.items.length === 0 && <li className="muted">Nothing yet.</li>}
          </ul>
          <Link to="/chat" className="btn wide">
            💬 Ask Claude about your year
          </Link>
        </section>
      </div>
    </div>
  );
}

function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="muted small">{sub}</span>
    </div>
  );
}
