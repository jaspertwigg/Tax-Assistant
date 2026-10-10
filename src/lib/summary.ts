import { countryOf } from "./countries";
import { getAll } from "./db";
import type { TaxYear } from "./data";
import type { Income, Profile, Receipt, Trip } from "./types";

const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "?");
const clean = (s: unknown, max = 120) => String(s ?? "").replace(/\s+/g, " ").slice(0, max);

/**
 * A plain-text summary of one tax year's records, written to be pasted into a
 * conversation with Claude (or sent to an accountant) so questions can be answered
 * against the real figures.
 */
export async function yearSummary(profile: Profile, taxYear: TaxYear): Promise<string> {
  const { start, end, label } = taxYear;
  const country = countryOf(profile.country);
  const year = country.yearTerm.toLowerCase();
  const [allReceipts, allIncome, allTrips] = await Promise.all([getAll("receipts"), getAll("income"), getAll("mileage")]);
  const inYear = <T extends { date: string }>(xs: T[]) =>
    xs.filter((x) => x.date >= start && x.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const receipts = inYear<Receipt>(allReceipts);
  const income = inYear<Income>(allIncome);
  const trips = inYear<Trip>(allTrips);

  const byCategory = new Map<string, number>();
  let claimable = 0;
  let personal = 0;
  let salesTax = 0;
  const receiptLines = receipts.map((r) => {
    const amount = r.amount ?? 0;
    const cat = clean(r.category || "Uncategorised", 40);
    if (r.deductible === false) personal += amount;
    else {
      claimable += amount;
      salesTax += r.taxAmount ?? 0;
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + amount);
    }
    const labels = r.labels?.length ? ` [${r.labels.map((l) => clean(l, 30)).join(", ")}]` : "";
    return `- ${r.date} | ${clean(r.merchant, 60) || "Unknown"} | ${money(r.amount)}${r.taxAmount ? ` (incl. ${country.salesTaxName} ${money(r.taxAmount)})` : ""} | ${cat}${
      r.deductible === false ? " | personal, not claimed" : ""
    }${labels}${r.notes ? ` | ${clean(r.notes, 100)}` : ""}`;
  });

  let incomeTotal = 0;
  let withheld = 0;
  const incomeLines = income.map((r) => {
    incomeTotal += r.amount ?? 0;
    withheld += r.taxPaid ?? 0;
    return `- ${r.date} | ${clean(r.source, 60)} | ${money(r.amount)} | ${clean(r.type, 30)}${
      r.taxPaid ? ` | ${country.taxWithheldName.toLowerCase()} ${money(r.taxPaid)}` : ""
    }${r.notes ? ` | ${clean(r.notes, 100)}` : ""}`;
  });

  const unit = profile.distanceUnit;
  const distance = trips.reduce((s, t) => s + (t.distance ?? 0), 0);
  const tripLines = trips.map((t) => `- ${t.date} | ${[t.from, t.to].filter(Boolean).join(" → ") || "—"} | ${clean(t.purpose, 60)} | ${t.distance} ${unit}`);
  const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `- ${c}: ${v.toFixed(2)}`);
  const undated = allReceipts.filter((r) => !r.date).length;
  const today = new Date().toISOString().slice(0, 10);

  return [
    `My tax records for the ${label} ${year} (${start} to ${end}), exported from my tax records app on ${today}. Please use these figures when answering my questions.`,
    `Country: ${country.name} (${country.authority}). Currency: ${profile.currency || country.currency}.`,
    profile.situation ? `About me: ${clean(profile.situation, 2000)}` : "",
    [
      `TOTALS`,
      `- Claimable expenses: ${claimable.toFixed(2)} across ${receipts.length - receipts.filter((r) => r.deductible === false).length} receipts (${country.salesTaxName} included: ${salesTax.toFixed(2)})`,
      personal ? `- Personal (not claimed): ${personal.toFixed(2)}` : "",
      `- Income: ${incomeTotal.toFixed(2)} across ${income.length} entries${withheld ? ` (${country.taxWithheldName.toLowerCase()}: ${withheld.toFixed(2)})` : ""}`,
      `- Work car travel: ${distance.toFixed(1)} ${unit} across ${trips.length} trips (my rate: ${profile.mileageRate} per ${unit === "km" ? "km" : "mile"})`,
      undated ? `- ${undated} receipt(s) have no date yet, so aren't included` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    cats.length ? `CLAIMABLE EXPENSES BY CATEGORY\n${cats.join("\n")}` : "",
    receiptLines.length ? `RECEIPTS (date | merchant | amount | category)\n${receiptLines.join("\n")}` : "No receipts recorded.",
    incomeLines.length ? `INCOME\n${incomeLines.join("\n")}` : "No income recorded.",
    tripLines.length ? `WORK CAR TRIPS\n${tripLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
