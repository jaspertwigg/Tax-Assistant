import { useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { countryOf, recentTaxYears } from "./lib/countries";
import { AppContext, currentTaxYear, TaxYear, useSettings } from "./lib/data";
import Dashboard from "./pages/Dashboard";
import Deadlines from "./pages/Deadlines";
import IncomePage from "./pages/Income";
import MileagePage from "./pages/Mileage";
import Receipts from "./pages/Receipts";
import SettingsPage from "./pages/Settings";

const NAV = [
  { to: "/", label: "Overview", icon: "◧" },
  { to: "/receipts", label: "Receipts", icon: "🧾" },
  { to: "/income", label: "Income", icon: "💰" },
  { to: "/mileage", label: "Mileage", auLabel: "Car trips", icon: "🚗" },
  { to: "/deadlines", label: "Deadlines", icon: "📅" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function App() {
  const { profile, apiKey, loaded } = useSettings();
  const [chosenYear, setTaxYear] = useState<TaxYear | null>(null);
  const years = useMemo(() => recentTaxYears(profile.country), [profile.country]);
  // Reset to the current year if the country (and so the year boundaries) changes.
  const taxYear = chosenYear && years.some((y) => y.start === chosenYear.start) ? chosenYear : currentTaxYear(profile);

  if (!loaded) return <div className="splash">Loading…</div>;

  const yearPicker = (
    <label className="year-picker">
      <span>{countryOf(profile.country).yearTerm === "Financial year" ? "FY" : "Tax year"}</span>
      <select value={taxYear.start} onChange={(e) => setTaxYear(years.find((y) => y.start === e.target.value) ?? null)}>
        {years.map((y) => (
          <option key={y.start} value={y.start}>
            {y.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <AppContext.Provider value={{ profile, apiKey, taxYear, setTaxYear }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <img src="icon.svg" alt="" width={28} height={28} />
            <span>Tax Assistant</span>
          </div>
          {yearPicker}
          <nav>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"}>
                <span className="nav-icon" aria-hidden>
                  {n.icon}
                </span>
                <span className="nav-label">{profile.country === "AU" && "auLabel" in n ? n.auLabel : n.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="content">
          <div className="mobile-bar">
            <div className="brand">
              <img src="icon.svg" alt="" width={24} height={24} />
              <span>Tax Assistant</span>
            </div>
            {yearPicker}
          </div>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/income" element={<IncomePage />} />
            <Route path="/mileage" element={<MileagePage />} />
            <Route path="/deadlines" element={<Deadlines />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </AppContext.Provider>
  );
}
