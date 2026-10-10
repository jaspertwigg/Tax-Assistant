import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { Income, Receipt, Reminder, StoredFile, Trip } from "./types";

/** Everything the app knows lives in this on-device database. Nothing is sent anywhere except to Claude when asked. */
interface TaxDB extends DBSchema {
  receipts: { key: string; value: Receipt };
  files: { key: string; value: StoredFile };
  income: { key: string; value: Income };
  mileage: { key: string; value: Trip };
  reminders: { key: string; value: Reminder };
  settings: { key: string; value: unknown };
}

export type RecordStore = "receipts" | "income" | "mileage" | "reminders";
export type StoreName = RecordStore | "files" | "settings";
export const ALL_STORES: StoreName[] = ["receipts", "files", "income", "mileage", "reminders", "settings"];

let dbPromise: Promise<IDBPDatabase<TaxDB>> | null = null;

export function db(): Promise<IDBPDatabase<TaxDB>> {
  dbPromise ??= openDB<TaxDB>("tax-assistant", 2, {
    upgrade(d) {
      // v2 removed the in-app chat.
      if ((d.objectStoreNames as DOMStringList).contains("chat")) (d as unknown as IDBPDatabase).deleteObjectStore("chat");
      for (const name of ALL_STORES) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, name === "settings" ? undefined : { keyPath: "id" });
      }
    },
  });
  return dbPromise;
}

const listeners = new Map<StoreName, Set<() => void>>();

export function subscribe(store: StoreName, fn: () => void): () => void {
  if (!listeners.has(store)) listeners.set(store, new Set());
  listeners.get(store)!.add(fn);
  return () => listeners.get(store)!.delete(fn);
}

export function notify(store: StoreName) {
  listeners.get(store)?.forEach((fn) => fn());
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function getAll<S extends RecordStore>(store: S): Promise<TaxDB[S]["value"][]> {
  return (await db()).getAll(store);
}

export async function get<S extends RecordStore | "files">(store: S, id: string): Promise<TaxDB[S]["value"] | undefined> {
  return (await db()).get(store, id);
}

export async function put<S extends RecordStore | "files">(store: S, value: TaxDB[S]["value"]): Promise<void> {
  await (await db()).put(store, value);
  notify(store);
}

/** Merges fields into an existing record. */
export async function patch<S extends RecordStore>(store: S, id: string, fields: Partial<TaxDB[S]["value"]>): Promise<void> {
  const d = await db();
  const tx = d.transaction(store, "readwrite");
  const current = await tx.store.get(id);
  if (current) await tx.store.put({ ...current, ...fields });
  await tx.done;
  notify(store);
}

export async function remove(store: RecordStore | "files", id: string): Promise<void> {
  await (await db()).delete(store, id);
  notify(store);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("settings", key)) as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put("settings", value, key);
  notify("settings");
}

export async function clearAll(stores: StoreName[] = ALL_STORES): Promise<void> {
  const d = await db();
  const tx = d.transaction(stores, "readwrite");
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
  stores.forEach(notify);
}

