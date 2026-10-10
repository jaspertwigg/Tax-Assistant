import { scanReceipt } from "./claude";
import { newId, put } from "./db";

const MAX_EDGE = 2000;
const THUMB_EDGE = 360;

async function resize(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
}

/** Shrinks photos so they save space on the phone and fit Claude's image limits. PDFs and GIFs are kept as-is. */
async function prepareFile(file: File): Promise<{ blob: Blob; thumb: Blob | null; contentType: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return { blob: file, thumb: null, contentType: file.type || "application/octet-stream" };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const [blob, thumb] = await Promise.all([resize(bitmap, MAX_EDGE, 0.85), resize(bitmap, THUMB_EDGE, 0.7)]);
    bitmap.close();
    return { blob, thumb, contentType: "image/jpeg" };
  } catch {
    return { blob: file, thumb: null, contentType: file.type };
  }
}

/** Saves a receipt photo/PDF on the phone and, if a key is set, asks Claude to read it. */
export async function addReceipt(file: File, opts: { apiKey: string; currency: string }): Promise<string> {
  const id = newId();
  const { blob, thumb, contentType } = await prepareFile(file);
  await put("files", { id, contentType, blob, thumb });
  await put("receipts", {
    id,
    merchant: "",
    date: "",
    amount: null,
    taxAmount: null,
    currency: opts.apiKey ? "" : opts.currency,
    category: "",
    labels: [],
    notes: "",
    deductible: null,
    fileName: file.name,
    contentType,
    status: opts.apiKey ? "scanning" : "ready",
    scanError: opts.apiKey ? null : "Fill in the details, or add your Claude API key in Settings to have receipts read automatically.",
    createdAt: Date.now(),
  });
  if (opts.apiKey) {
    // Errors are recorded on the receipt itself; the upload still succeeded.
    await scanReceipt(opts.apiKey, id).catch(() => undefined);
  }
  return id;
}
