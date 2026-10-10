import { ALL_STORES, clearAll, db, notify } from "./db";

/**
 * Everything lives only on this phone, so backups matter: these write the whole
 * database (receipt photos included, API key excluded) to a single JSON file.
 */
interface BackupFile {
  app: "tax-assistant";
  version: 1;
  exportedAt: string;
  stores: Record<string, unknown[]>;
  settings: Record<string, unknown>;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function createBackup(): Promise<Blob> {
  const d = await db();
  const stores: Record<string, unknown[]> = {};
  for (const name of ["receipts", "income", "mileage", "reminders", "chat"] as const) stores[name] = await d.getAll(name);
  stores.files = await Promise.all(
    (await d.getAll("files")).map(async (f) => ({
      id: f.id,
      contentType: f.contentType,
      blob: await blobToDataUrl(f.blob),
      thumb: f.thumb ? await blobToDataUrl(f.thumb) : null,
    })),
  );
  const backup: BackupFile = {
    app: "tax-assistant",
    version: 1,
    exportedAt: new Date().toISOString(),
    stores,
    settings: { profile: await d.get("settings", "profile") },
  };
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

/** Replaces everything on this phone with the backup's contents (the API key is kept). */
export async function restoreBackup(file: File): Promise<{ receipts: number }> {
  const backup = JSON.parse(await file.text()) as BackupFile;
  if (backup.app !== "tax-assistant" || backup.version !== 1) throw new Error("That isn't a Tax Assistant backup file.");
  const files = await Promise.all(
    ((backup.stores.files ?? []) as { id: string; contentType: string; blob: string; thumb: string | null }[]).map(async (f) => ({
      id: f.id,
      contentType: f.contentType,
      blob: await dataUrlToBlob(f.blob),
      thumb: f.thumb ? await dataUrlToBlob(f.thumb) : null,
    })),
  );
  const stores = ALL_STORES.filter((s) => s !== "settings");
  await clearAll(stores);
  const d = await db();
  const tx = d.transaction([...stores, "settings"], "readwrite");
  for (const name of ["receipts", "income", "mileage", "reminders", "chat"] as const) {
    for (const item of backup.stores[name] ?? []) await tx.objectStore(name).put(item as never);
  }
  for (const f of files) await tx.objectStore("files").put(f);
  if (backup.settings?.profile) await tx.objectStore("settings").put(backup.settings.profile, "profile");
  await tx.done;
  // Tell every open view to reload.
  ALL_STORES.forEach(notify);
  return { receipts: (backup.stores.receipts ?? []).length };
}

/** Hands a file to the phone's share sheet (Save to Files, AirDrop, email…), or downloads it. */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
