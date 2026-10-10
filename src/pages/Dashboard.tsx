import { Link } from "react-router-dom";
import { downloadText, toCsv } from "../lib/csv";
import { upcomingDeadlines } from "../lib/deadlines";
import { useApp, useYearCollection } from "../lib/data";
import { daysUntil, formatDate, formatMoney } from "../lib/format";
import type { Income, Receipt, Trip } from "../lib/types";
import { needsReview } from "./Receipts";

export default function Dashboard() {
  const { profile, taxYear } = useApp();
  const receipts = useYearCollection<Receipt>("receipts");
  const income = useYearCollection<Income>("income");
  const trips = useYearCollection<Trip>("mileage");
  const cur = profile.currency;

  const claimable = receipts.items.filter((r) => r.deductible !== false);
  const expenses = claimable.reduce((s, r) => s + (r.amount ?? 0), 0);
  const personal = receipts.items.filter((r) => r.deductible === false).reduce((s, r) => s + (r.amount ?? 0), 0);
  const salesTax = claimable.reduce((s, r) => s + (r.taxAmount ?? 0), 0);
  const incomeTotal = income.items.reduce((s, r) => s + (r.amount ?? 0), 0);
  const taxDeducted = income.items.reduce((s, r) => s + (r.taxPaid ?? 0), 0);
  const distance = trips.items.reduce((s, t) => s + (t.distance ?? 0), 0);
  const mileageClaim = distance * (profile.mileageRate || 0);
  const review = receipts.items.filter(needsReview).length;

  const byCategory = new Map<string, number>();
  for (const r of claimable) byCategory.set(r.category || "Uncategorised", (byCategory.get(r.category || "Uncategorised") ?? 0) + (r.amount ?? 0));
  const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));

  const deadlines = upcomingDeadlines(profile.country).filter((d) => daysUntil(d.date) >= 0).slice(0, 3);
  const slug = taxYear.label.replace("/", "-");

  function exportAll() {
    downloadText(
      `receipts-${slug}.csv`,
      toCsv(
        ["Date", "Merchant", "Category", "Total", "Tax included", "Currency", "Claimable", "Labels", "Notes", "File"],
        receipts.items.map((r) => [r.date, r.merchant, r.category, r.amount, r.taxAmount, r.currency, r.deductible === false ? "No" : "Yes", r.labels, r.notes, r.downloadUrl]),
      ),
    );
    if (income.items.length)
      downloadText(
        `income-${slug}.csv`,
        toCsv(["Date", "Source", "Type", "Amount", "Tax already deducted", "Notes"], income.items.map((i) => [i.date, i.source, i.type, i.amount, i.taxPaid, i.notes])),
      );
    if (trips.items.length)
      downloadText(
        `mileage-${slug}.csv`,
        toCsv(
          ["Date", "From", "To", "Purpose", `Distance (${profile.distanceUnit})`],
          trips.items.map((t) => [t.date, t.from, t.to, t.purpose, t.distance]),
        ),
      );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Tax year {taxYear.label}</h1>
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

      {review > 0 && (
        <Link to="/receipts" className="notice">
          {review} receipt{review === 1 ? "" : "s"} need a quick check (missing date, amount or category). →
        </Link>
      )}

      <section className="stats">
        <Stat label="Claimable expenses" value={formatMoney(expenses, cur)} sub={plural(claimable.length, "receipt")} />
        <Stat label="Income recorded" value={formatMoney(incomeTotal, cur)} sub={taxDeducted ? `${formatMoney(taxDeducted, cur)} tax already deducted` : plural(income.items.length, "entry", "entries")} />
        <Stat
          label="Mileage"
          value={`${distance.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${profile.distanceUnit}`}
          sub={mileageClaim ? `≈ ${formatMoney(mileageClaim, cur)} at your rate` : plural(trips.items.length, "trip")}
        />
        <Stat label="Sales tax on expenses" value={formatMoney(salesTax, cur)} sub="Shown on receipts" />
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
            <p className="muted">No claimable receipts in this tax year yet.</p>
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
