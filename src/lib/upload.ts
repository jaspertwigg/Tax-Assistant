import { doc, setDoc, serverTimestamp, collection, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, functions, storage } from "./firebase";

const MAX_EDGE = 2000;
const scanReceiptFn = httpsCallable<{ receiptId: string }, { ok: boolean }>(functions, "scanReceipt");

/** Shrinks photos so uploads are fast and fit the model's image limits. PDFs and GIFs pass through. */
async function prepareFile(file: File): Promise<{ blob: Blob; contentType: string; name: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return { blob: file, contentType: file.type || "application/octet-stream", name: file.name };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
    );
    return { blob, contentType: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return { blob: file, contentType: file.type, name: file.name };
  }
}

export function scanReceipt(receiptId: string) {
  return scanReceiptFn({ receiptId });
}

/** Uploads a receipt file, creates its record and asks Claude to read it. Returns the new receipt id. */
export async function uploadReceipt(uid: string, file: File, defaults: { currency: string }): Promise<string> {
  const receiptRef = doc(collection(db, "users", uid, "receipts"));
  const { blob, contentType, name } = await prepareFile(file);
  const safeName = name.replace(/[^\w.\-]+/g, "_").slice(-80) || "receipt";
  const storagePath = `users/${uid}/receipts/${receiptRef.id}/${safeName}`;

  await setDoc(receiptRef, {
    merchant: "",
    date: "",
    amount: null,
    taxAmount: null,
    currency: "",
    category: "",
    labels: [],
    notes: "",
    deductible: null,
    storagePath,
    fileName: file.name,
    contentType,
    downloadUrl: "",
    status: "uploading",
    createdAt: serverTimestamp(),
  });

  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, blob, { contentType });
  const downloadUrl = await getDownloadURL(fileRef);
  await updateDoc(receiptRef, { downloadUrl, status: "scanning" });

  try {
    await scanReceipt(receiptRef.id);
  } catch (err) {
    await updateDoc(receiptRef, {
      status: "ready",
      currency: defaults.currency,
      scanError: err instanceof Error ? `Auto-scan failed: ${err.message}` : "Auto-scan failed — fill in the details manually.",
    });
  }
  return receiptRef.id;
}
