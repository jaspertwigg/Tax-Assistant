import { CountryCode, taxYearBounds } from "./countries";

export interface Deadline {
  date: string;
  title: string;
  detail: string;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Common key dates for a tax year starting in `y`. These are the usual dates; always confirm with the tax authority. */
function forTaxYear(country: CountryCode, y: number): Deadline[] {
  const label = (a: number) => `${a}/${String(a + 1).slice(2)}`;
  switch (country) {
    case "UK":
      return [
        { date: iso(y + 1, 4, 5), title: `Tax year ${label(y)} ends`, detail: "Last day to make pension contributions, ISA deposits and purchases that count for this year." },
        { date: iso(y + 1, 10, 5), title: "Register for Self Assessment", detail: `Deadline to tell HMRC if you need to file a return for ${label(y)} for the first time.` },
        { date: iso(y + 1, 10, 31), title: "Paper tax return deadline", detail: `Paper Self Assessment return for ${label(y)}.` },
        { date: iso(y + 2, 1, 31), title: "Online return & tax bill due", detail: `File your ${label(y)} online return and pay the balance plus your first payment on account.` },
        { date: iso(y + 2, 7, 31), title: "Second payment on account", detail: `Second payment on account towards ${label(y + 1)}.` },
      ];
    case "AU": {
      const fy = `${y}–${String(y + 1).slice(2)}`;
      return [
        { date: iso(y, 10, 28), title: "BAS due: Jul–Sep quarter", detail: "Quarterly BAS and PAYG instalment (if you're registered for GST or pay instalments)." },
        { date: iso(y + 1, 2, 28), title: "BAS due: Oct–Dec quarter", detail: "Quarterly BAS and PAYG instalment (if applicable)." },
        { date: iso(y + 1, 4, 28), title: "BAS due: Jan–Mar quarter", detail: "Quarterly BAS and PAYG instalment (if applicable)." },
        { date: iso(y + 1, 6, 30), title: `${fy} financial year ends`, detail: "Last day for deductible purchases, donations and personal super contributions to count this year." },
        { date: iso(y + 1, 7, 14), title: "Income statements tax-ready", detail: "Employers should have finalised your income statement in myGov by now." },
        { date: iso(y + 1, 7, 28), title: "BAS due: Apr–Jun quarter", detail: "Quarterly BAS and PAYG instalment (if applicable)." },
        { date: iso(y + 1, 10, 31), title: `${fy} tax return due (lodging yourself)`, detail: "Lodge via myTax, or register with a tax agent before today to get a later date." },
        { date: iso(y + 2, 5, 15), title: `${fy} return due (via tax agent)`, detail: "Usual date for tax-agent clients who registered with an agent by 31 October. Check with your agent." },
      ];
    }
    case "US":
      return [
        { date: iso(y, 4, 15), title: "Q1 estimated tax payment", detail: `Estimated tax for ${y} (Form 1040-ES).` },
        { date: iso(y, 6, 15), title: "Q2 estimated tax payment", detail: `Estimated tax for ${y}.` },
        { date: iso(y, 9, 15), title: "Q3 estimated tax payment", detail: `Estimated tax for ${y}.` },
        { date: iso(y + 1, 1, 15), title: "Q4 estimated tax payment", detail: `Final estimated payment for ${y}.` },
        { date: iso(y + 1, 4, 15), title: `${y} federal return due`, detail: "File Form 1040 and pay any balance, or file for an extension." },
        { date: iso(y + 1, 10, 15), title: "Extended return deadline", detail: `Deadline if you filed an extension for ${y}.` },
      ];
    case "IE":
      return [
        { date: iso(y + 1, 10, 31), title: `${y} return & preliminary tax`, detail: `File Form 11 for ${y} and pay preliminary tax for ${y + 1} (extended date usually applies via ROS).` },
      ];
    case "NZ":
      return [
        { date: iso(y + 1, 3, 31), title: `Tax year ${label(y)} ends`, detail: "End of the New Zealand tax year." },
        { date: iso(y + 1, 7, 7), title: "IR3 return due", detail: `Individual return for ${label(y)} (later if you use a tax agent).` },
        { date: iso(y + 2, 2, 7), title: "Terminal tax due", detail: `Pay any remaining tax for ${label(y)}.` },
      ];
    case "CA":
      return [
        { date: iso(y, 3, 15), title: "Instalment payment", detail: `Quarterly instalment for ${y}.` },
        { date: iso(y, 6, 15), title: "Instalment payment", detail: `Quarterly instalment for ${y}.` },
        { date: iso(y, 9, 15), title: "Instalment payment", detail: `Quarterly instalment for ${y}.` },
        { date: iso(y, 12, 15), title: "Instalment payment", detail: `Quarterly instalment for ${y}.` },
        { date: iso(y + 1, 4, 30), title: `${y} balance due`, detail: "Pay any balance owing (and file, unless self-employed)." },
        { date: iso(y + 1, 6, 15), title: "Self-employed filing deadline", detail: `Return for ${y} if you or your spouse are self-employed.` },
      ];
    default:
      return [];
  }
}

/** Upcoming key dates (plus anything in the last 30 days) for the user's country. */
export function upcomingDeadlines(country: CountryCode, today = new Date()): Deadline[] {
  const { start } = taxYearBounds(country, today);
  const y = Number(start.slice(0, 4));
  const from = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 400 * 86400000).toISOString().slice(0, 10);
  const all = [y - 2, y - 1, y, y + 1].flatMap((year) => forTaxYear(country, year));
  const seen = new Set<string>();
  return all
    .filter((d) => d.date >= from && d.date <= to)
    .filter((d) => (seen.has(d.date + d.title) ? false : (seen.add(d.date + d.title), true)))
    .sort((a, b) => a.date.localeCompare(b.date));
}
