import { describe, expect, it } from "vitest";
import { recentTaxYears, taxYearBounds } from "../countries";
import { upcomingDeadlines } from "../deadlines";

describe("taxYearBounds", () => {
  it("UK year runs 6 April to 5 April", () => {
    expect(taxYearBounds("UK", new Date(Date.UTC(2026, 9, 10)))).toEqual({ start: "2026-04-06", end: "2027-04-05", label: "2026/27" });
    expect(taxYearBounds("UK", new Date(Date.UTC(2026, 3, 5)))).toEqual({ start: "2025-04-06", end: "2026-04-05", label: "2025/26" });
  });
  it("Australian year runs 1 July to 30 June", () => {
    expect(taxYearBounds("AU", new Date(Date.UTC(2026, 5, 30)))).toEqual({ start: "2025-07-01", end: "2026-06-30", label: "2025–26" });
  });
  it("Australian year rolls over on 1 July", () => {
    expect(taxYearBounds("AU", new Date(Date.UTC(2026, 6, 1))).label).toBe("2026–27");
  });
  it("calendar-year countries use a single-year label", () => {
    expect(taxYearBounds("US", new Date(Date.UTC(2026, 11, 31)))).toEqual({ start: "2026-01-01", end: "2026-12-31", label: "2026" });
  });
});

describe("recentTaxYears", () => {
  it("lists consecutive years newest first", () => {
    const years = recentTaxYears("UK", 3, new Date(Date.UTC(2026, 9, 10)));
    expect(years.map((y) => y.label)).toEqual(["2026/27", "2025/26", "2024/25"]);
  });
});

describe("upcomingDeadlines", () => {
  it("includes the UK January online filing deadline", () => {
    const list = upcomingDeadlines("UK", new Date(Date.UTC(2026, 9, 10)));
    expect(list.some((d) => d.date === "2027-01-31")).toBe(true);
    expect(list.every((d, i) => i === 0 || list[i - 1].date <= d.date)).toBe(true);
  });
});

describe("Australian deadlines", () => {
  const list = upcomingDeadlines("AU", new Date(Date.UTC(2026, 9, 10)));
  it("includes the 31 October self-lodgment deadline and BAS dates", () => {
    expect(list.some((d) => d.date === "2026-10-31")).toBe(true);
    expect(list.some((d) => d.date === "2027-02-28" && d.title.includes("BAS"))).toBe(true);
    expect(list.some((d) => d.date === "2027-05-15")).toBe(true);
    expect(list.some((d) => d.date === "2027-06-30")).toBe(true);
  });
});
