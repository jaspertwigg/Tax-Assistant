export type CountryCode = "AU" | "UK" | "US" | "IE" | "NZ" | "CA" | "OTHER";

export interface CountryProfile {
  name: string;
  currency: string;
  authority: string;
  /** Month (1-12) and day the tax year starts. */
  taxYearStart: { month: number; day: number };
  salesTaxName: string;
  /** What people call the tax year there, e.g. "Financial year". */
  yearTerm: string;
  /** Label for tax already taken off income before it's paid. */
  taxWithheldName: string;
  categories: readonly string[];
  incomeTypes: readonly string[];
  /** Standard per-distance car rate the user can start from, and its unit. */
  mileage: { rate: number; unit: "miles" | "km"; note: string; /** Max distance claimable per car per year at this rate. */ cap?: number };
}

/** Receipts in this category are excluded from claimable totals. */
export const PERSONAL_CATEGORY = "Personal (not deductible)";

const GENERIC_CATEGORIES = [
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
  PERSONAL_CATEGORY,
  "Other",
] as const;

// Grouped by the deduction labels on the Australian individual tax return.
const AU_CATEGORIES = [
  "Car expenses (D1)",
  "Work travel (D2)",
  "Work clothing & laundry (D3)",
  "Self-education (D4)",
  "Working from home (D5)",
  "Phone & internet (D5)",
  "Tools & equipment (D5)",
  "Union & professional fees (D5)",
  "Other work expenses (D5)",
  "Gifts & donations (D9)",
  "Managing tax affairs (D10)",
  "Income protection insurance",
  "Business expenses (ABN)",
  "Rental property expenses",
  PERSONAL_CATEGORY,
  "Other",
] as const;

const GENERIC_INCOME = [
  "Self-employment / sales",
  "Employment (salary)",
  "Rental income",
  "Dividends",
  "Interest",
  "Capital gains",
  "Pension",
  "Benefits",
  "Other",
];

const AU_INCOME = [
  "Salary & wages (PAYG)",
  "Business income (ABN)",
  "Rental income",
  "Interest",
  "Dividends",
  "Capital gains",
  "Government payments",
  "Super / annuities",
  "Other",
];

const generic = (
  name: string,
  currency: string,
  authority: string,
  taxYearStart: { month: number; day: number },
  salesTaxName: string,
  mileage: CountryProfile["mileage"],
): CountryProfile => ({
  name,
  currency,
  authority,
  taxYearStart,
  salesTaxName,
  yearTerm: "Tax year",
  taxWithheldName: "Tax already deducted",
  categories: GENERIC_CATEGORIES,
  incomeTypes: GENERIC_INCOME,
  mileage,
});

export const COUNTRIES: Record<CountryCode, CountryProfile> = {
  AU: {
    name: "Australia",
    currency: "AUD",
    authority: "ATO",
    taxYearStart: { month: 7, day: 1 },
    salesTaxName: "GST",
    yearTerm: "Financial year",
    taxWithheldName: "Tax withheld",
    categories: AU_CATEGORIES,
    incomeTypes: AU_INCOME,
    mileage: { rate: 0.88, unit: "km", cap: 5000, note: "ATO cents-per-km method: up to 5,000 work km per car. The rate is set each year — ask Claude for the current one." },
  },
  UK: generic("United Kingdom", "GBP", "HMRC", { month: 4, day: 6 }, "VAT", { rate: 0.45, unit: "miles", note: "HMRC approved mileage rate." }),
  US: generic("United States", "USD", "IRS", { month: 1, day: 1 }, "Sales tax", { rate: 0.7, unit: "miles", note: "IRS standard mileage rate." }),
  IE: generic("Ireland", "EUR", "Revenue", { month: 1, day: 1 }, "VAT", { rate: 0.4, unit: "km", note: "Civil service motor rate." }),
  NZ: generic("New Zealand", "NZD", "IRD", { month: 4, day: 1 }, "GST", { rate: 1.04, unit: "km", note: "IRD kilometre rate." }),
  CA: generic("Canada", "CAD", "CRA", { month: 1, day: 1 }, "GST/HST", { rate: 0.72, unit: "km", note: "CRA automobile allowance rate." }),
  OTHER: generic("Other", "AUD", "your tax authority", { month: 1, day: 1 }, "Sales tax", { rate: 0, unit: "km", note: "Enter your local rate." }),
};

export function countryOf(code: CountryCode): CountryProfile {
  return COUNTRIES[code] ?? COUNTRIES.AU;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Returns ISO date strings [start, end] for the tax year containing `on`. */
export function taxYearBounds(country: CountryCode, on: Date = new Date()): { start: string; end: string; label: string } {
  const { month, day } = countryOf(country).taxYearStart;
  const y = on.getUTCFullYear();
  const startThisYear = Date.UTC(y, month - 1, day);
  const startYear = on.getTime() >= startThisYear ? y : y - 1;
  const endDate = new Date(Date.UTC(startYear + 1, month - 1, day) - 86400000);
  const start = `${startYear}-${pad(month)}-${pad(day)}`;
  const end = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(endDate.getUTCDate())}`;
  // Australians write "2025–26"; elsewhere "2025/26".
  const sep = country === "AU" ? "–" : "/";
  const label = month === 1 && day === 1 ? `${startYear}` : `${startYear}${sep}${String(startYear + 1).slice(2)}`;
  return { start, end, label };
}

/** Tax years (most recent first) for a selector, going back `count` years. */
export function recentTaxYears(country: CountryCode, count = 6, on: Date = new Date()) {
  const years = [];
  const current = taxYearBounds(country, on);
  let startYear = Number(current.start.slice(0, 4));
  const { month, day } = countryOf(country).taxYearStart;
  for (let i = 0; i < count; i++, startYear--) {
    years.push(taxYearBounds(country, new Date(Date.UTC(startYear, month - 1, day))));
  }
  return years;
}
