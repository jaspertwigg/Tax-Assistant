import { createContext, useContext, useEffect, useState } from "react";
import { countryOf, CountryProfile, taxYearBounds } from "./countries";
import { get, getAll, getSetting, RecordStore, setSetting, subscribe } from "./db";
import type { Profile, StoredFile } from "./types";

export const DEFAULT_PROFILE: Profile = {
  country: "AU",
  currency: "AUD",
  situation: "",
  mileageRate: 0.88,
  distanceUnit: "km",
};

export interface TaxYear {
  start: string;
  end: string;
  label: string;
}

export interface AppState {
  profile: Profile;
  apiKey: string;
  taxYear: TaxYear;
  setTaxYear: (y: TaxYear) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}

export function currentTaxYear(profile: Profile): TaxYear {
  return taxYearBounds(profile.country);
}

/** Terminology, categories and rates for the user's country. */
export function useCountry(): CountryProfile {
  return countryOf(useApp().profile.country);
}

/**
 * Early versions defaulted to the UK. Move a saved UK/GBP profile to Australia once,
 * keeping anything the user wrote about their situation.
 */
export async function migrateToAustralia(): Promise<void> {
  if (await getSetting("auMigrated")) return;
  const saved = await getSetting<Partial<Profile>>("profile");
  if (saved && saved.country === "UK" && saved.currency === "GBP") {
    await setSetting("profile", { ...saved, country: "AU", currency: "AUD", mileageRate: 0.88, distanceUnit: "km" });
  }
  await setSetting("auMigrated", true);
}

export async function loadProfile(): Promise<Profile> {
  return { ...DEFAULT_PROFILE, ...((await getSetting<Partial<Profile>>("profile")) ?? {}) };
}

/** Profile and API key, kept live as they change. */
export function useSettings(): { profile: Profile; apiKey: string; loaded: boolean } {
  const [state, setState] = useState({ profile: DEFAULT_PROFILE, apiKey: "", loaded: false });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [profile, apiKey] = await Promise.all([loadProfile(), getSetting<string>("apiKey")]);
      if (alive) setState({ profile, apiKey: apiKey ?? "", loaded: true });
    };
    load();
    const unsub = subscribe("settings", load);
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return state;
}

/** All records in a store, re-read whenever the store changes. */
export function useRecords<T>(store: RecordStore, sort: (a: T, b: T) => number): { items: T[]; loading: boolean } {
  const [state, setState] = useState<{ items: T[]; loading: boolean }>({ items: [], loading: true });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const items = (await getAll(store)) as T[];
      if (alive) setState({ items: items.sort(sort), loading: false });
    };
    load();
    const unsub = subscribe(store, load);
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  return state;
}

export const byDateDesc = <T extends { date: string; createdAt: number }>(a: T, b: T) =>
  (b.date || "9999").localeCompare(a.date || "9999") || b.createdAt - a.createdAt;

/** Records dated within the selected tax year, newest first. */
export function useYearRecords<T extends { date: string; createdAt: number }>(store: RecordStore) {
  const { taxYear } = useApp();
  const { items, loading } = useRecords<T>(store, byDateDesc);
  return { items: items.filter((r) => r.date >= taxYear.start && r.date <= taxYear.end), loading };
}

/** An object URL for a stored receipt image, released when no longer shown. */
export function useFileUrl(id: string | undefined, kind: "thumb" | "full"): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!id) return;
    let alive = true;
    let created: string | null = null;
    get("files", id).then((f: StoredFile | undefined) => {
      const blob = f && (kind === "thumb" ? (f.thumb ?? f.blob) : f.blob);
      if (alive && blob) setUrl((created = URL.createObjectURL(blob)));
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, kind]);
  return url;
}
