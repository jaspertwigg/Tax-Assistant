// Kept in sync with src/lib/countries.ts in the web app.

export type CountryCode = "UK" | "AU" | "US" | "IE" | "NZ" | "CA" | "OTHER";

export interface CountryProfile {
  name: string;
  currency: string;
  authority: string;
  /** Month (1-12) and day the tax year starts. */
  taxYearStart: { month: number; day: number };
  salesTaxName: string;
}

export const COUNTRIES: Record<CountryCode, CountryProfile> = {
  UK: { name: "United Kingdom", currency: "GBP", authority: "HMRC", taxYearStart: { month: 4, day: 6 }, salesTaxName: "VAT" },
  AU: { name: "Australia", currency: "AUD", authority: "ATO", taxYearStart: { month: 7, day: 1 }, salesTaxName: "GST" },
  US: { name: "United States", currency: "USD", authority: "IRS", taxYearStart: { month: 1, day: 1 }, salesTaxName: "Sales tax" },
  IE: { name: "Ireland", currency: "EUR", authority: "Revenue", taxYearStart: { month: 1, day: 1 }, salesTaxName: "VAT" },
  NZ: { name: "New Zealand", currency: "NZD", authority: "IRD", taxYearStart: { month: 4, day: 1 }, salesTaxName: "GST" },
  CA: { name: "Canada", currency: "CAD", authority: "CRA", taxYearStart: { month: 1, day: 1 }, salesTaxName: "GST/HST" },
  OTHER: { name: "Other", currency: "GBP", authority: "your tax authority", taxYearStart: { month: 1, day: 1 }, salesTaxName: "Sales tax" },
};

export const CATEGORIES = [
  "Office & stationery",
  "Travel",
  "Vehicle & fuel",
  "Meals & subsistence",
  "Equipment & tools",
  "Software & subscriptions",
  "Phone & internet",
  "Professional fees",
  "Training & education",
  "Clothing & uniform",
  "Home office",
  "Rent & utilities",
  "Insurance",
  "Marketing & advertising",
  "Bank & finance charges",
  "Medical",
  "Charitable donations",
  "Personal (not deductible)",
  "Other",
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Returns ISO date strings [start, end] for the tax year containing `on`. */
export function taxYearBounds(country: CountryCode, on: Date = new Date()): { start: string; end: string; label: string } {
  const { month, day } = (COUNTRIES[country] ?? COUNTRIES.OTHER).taxYearStart;
  const y = on.getUTCFullYear();
  const startThisYear = Date.UTC(y, month - 1, day);
  const startYear = on.getTime() >= startThisYear ? y : y - 1;
  const endDate = new Date(Date.UTC(startYear + 1, month - 1, day) - 86400000);
  const start = `${startYear}-${pad(month)}-${pad(day)}`;
  const end = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(endDate.getUTCDate())}`;
  const label = month === 1 && day === 1 ? `${startYear}` : `${startYear}/${String(startYear + 1).slice(2)}`;
  return { start, end, label };
}
