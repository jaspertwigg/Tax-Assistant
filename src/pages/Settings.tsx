import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { createBackup, restoreBackup, saveFile } from "../lib/backup";
import { testApiKey } from "../lib/claude";
import { COUNTRIES, CountryCode } from "../lib/countries";
import { useApp } from "../lib/data";
import { clearAll, setSetting } from "../lib/db";
import { todayIso } from "../lib/format";

const MILEAGE_DEFAULTS: Partial<Record<CountryCode, { rate: number; unit: "miles" | "km" }>> = {
  UK: { rate: 0.45, unit: "miles" },
  US: { rate: 0.7, unit: "miles" },
  AU: { rate: 0.88, unit: "km" },
  IE: { rate: 0.4, unit: "km" },
  NZ: { rate: 1.04, unit: "km" },
  CA: { rate: 0.72, unit: "km" },
};

export default function SettingsPage() {
  return (
    <div className="page narrow">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Everything in this app is stored only on this phone.</p>
        </div>
      </header>
      <ApiKeySection />
      <ProfileSection />
      <DataSection />
    </div>
  );
}

function ApiKeySection() {
  const { apiKey } = useApp();
  const [draft, setDraft] = useState(apiKey);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    setBusy(true);
    setStatus(null);
    try {
      if (key) await testApiKey(key);
      await setSetting("apiKey", key);
      setStatus({ text: key ? "Key works and is saved on this phone ✓" : "Key removed.", ok: true });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Claude API key</h2>
      <p className="muted small">
        Needed for reading receipts and for chat. Create one at{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com
        </a>{" "}
        and set a monthly spend limit there. The key is kept only on this phone and is sent only to Anthropic.
      </p>
      <div className="key-row">
        <input
          type={show ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="button" className="btn" onClick={() => setShow(!show)}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {busy ? "Checking…" : "Save key"}
        </button>
        {status && <span className={status.ok ? "muted" : "error"}>{status.text}</span>}
      </div>
    </form>
  );
}

function ProfileSection() {
  const { profile } = useApp();
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
    await setSetting("profile", {
      country: form.country,
      currency: form.currency.trim().toUpperCase().slice(0, 3) || "GBP",
      situation: form.situation.trim().slice(0, 2000),
      mileageRate: Number(form.mileageRate) || 0,
      distanceUnit: form.distanceUnit,
    });
    setStatus("Saved ✓");
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>About you</h2>
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
        Your tax situation (shared with Claude when you chat)
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
      <p className="muted small">Mileage defaults are recent standard rates and change over time — ask Claude for the current one.</p>
      <div className="actions">
        <button className="btn primary">Save</button>
        {status && <span className="muted">{status}</span>}
      </div>
    </form>
  );
}

function DataSection() {
  const [storage, setStorage] = useState<{ used: string; persisted: boolean | null } | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
      setStorage({ used: est?.usage != null ? `${(est.usage / 1024 / 1024).toFixed(1)} MB` : "unknown", persisted });
    })();
  }, [status]);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setStatus(null);
    try {
      setStatus({ text: await fn(), ok: true });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setBusy(null);
    }
  }

  function onRestore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !confirm("Replace everything on this phone with this backup?")) return;
    run("restore", async () => {
      const { receipts } = await restoreBackup(file);
      return `Restored ✓ (${receipts} receipts)`;
    });
  }

  return (
    <section className="card stack">
      <h2>Your data & backups</h2>
      <p className="muted small">
        Your receipts and records exist only on this phone{storage ? ` (using ${storage.used})` : ""}. If you delete the app, clear your
        browser data or lose the phone, they're gone, so <strong>save a backup regularly</strong>, for example to iCloud Drive or Google
        Drive. Backups include receipt photos but not your API key.
      </p>
      {storage?.persisted === false && (
        <p className="warning small">
          Your browser hasn't promised to keep this app's data. Add the app to your home screen and keep regular backups.
        </p>
      )}
      <div className="actions">
        <button
          className="btn primary"
          disabled={!!busy}
          onClick={() =>
            run("backup", async () => {
              await saveFile(await createBackup(), `tax-assistant-backup-${todayIso()}.json`);
              await setSetting("lastBackup", new Date().toISOString());
              return "Backup ready ✓";
            })
          }
        >
          {busy === "backup" ? "Preparing…" : "Save backup"}
        </button>
        <label className="btn">
          {busy === "restore" ? "Restoring…" : "Restore from backup"}
          <input type="file" accept="application/json,.json" hidden onChange={onRestore} />
        </label>
        <button
          className="btn danger"
          disabled={!!busy}
          onClick={() =>
            confirm("Erase ALL receipts, records, chats and settings from this phone? This can't be undone.") &&
            run("erase", async () => {
              await clearAll();
              return "Everything erased.";
            })
          }
        >
          Erase everything
        </button>
      </div>
      {status && <p className={status.ok ? "muted" : "error"}>{status.text}</p>}
    </section>
  );
}
