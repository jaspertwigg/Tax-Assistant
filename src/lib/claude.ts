import Anthropic from "@anthropic-ai/sdk";
import { countryOf, PERSONAL_CATEGORY } from "./countries";
import { get, patch } from "./db";
import { loadProfile } from "./data";
import type { Receipt } from "./types";

const MODEL = "claude-opus-5-5";
// Re-runs a request on Anthropic's recommended model if the primary one declines it.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class ClaudeError extends Error {}

/**
 * Optional: reading receipts automatically. The app calls Claude straight from the
 * phone with the user's own key, stored only on this device. Without a key the app
 * works fully and receipt details are typed in by hand.
 */
function client(apiKey: string): Anthropic {
  if (!apiKey) throw new ClaudeError("Add a Claude API key in Settings to read receipts automatically.");
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function friendlyError(err: unknown): Error {
  if (err instanceof ClaudeError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new ClaudeError("Your Claude API key was rejected. Check it in Settings.");
  if (err instanceof Anthropic.PermissionDeniedError) return new ClaudeError("Your API key doesn't have access to this model.");
  if (err instanceof Anthropic.RateLimitError) return new ClaudeError("Claude is busy or your usage limit was reached. Try again in a minute.");
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) return new ClaudeError("Your Anthropic account is out of credit. Top up at console.anthropic.com.");
    return new ClaudeError("Claude couldn't process that request.");
  }
  if (err instanceof Anthropic.APIConnectionError) return new ClaudeError("Couldn't reach Claude. Check your internet connection.");
  if (err instanceof Anthropic.APIError) return new ClaudeError("Claude is temporarily unavailable. Try again shortly.");
  return err instanceof Error ? err : new Error(String(err));
}

/** Makes a tiny request to confirm the key works. */
export async function testApiKey(apiKey: string): Promise<void> {
  try {
    await client(apiKey).models.retrieve(MODEL);
  } catch (err) {
    throw friendlyError(err);
  }
}

const receiptSchema = (categories: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["is_receipt", "merchant", "date", "total", "tax_amount", "currency", "category", "labels", "summary", "confidence"],
  properties: {
    is_receipt: { type: "boolean", description: "False if the document is not a receipt, invoice or bill." },
    merchant: { type: "string", description: "Business name as printed. Empty string if unreadable." },
    date: { type: "string", description: "Transaction date as YYYY-MM-DD. Empty string if not shown." },
    total: { type: "number", description: "Final amount paid including tax. 0 if not shown." },
    tax_amount: { type: "number", description: "VAT/GST/sales tax included in the total. 0 if not shown." },
    currency: { type: "string", description: "ISO 4217 code, e.g. AUD, NZD, USD." },
    category: { type: "string", enum: [...categories] },
    labels: { type: "array", items: { type: "string" }, description: "1-4 short lowercase tags, e.g. 'fuel', 'client lunch'." },
    summary: { type: "string", description: "One line describing what was bought. Include the supplier's ABN/tax number if printed." },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
});

interface ExtractedReceipt {
  is_receipt: boolean;
  merchant: string;
  date: string;
  total: number;
  tax_amount: number;
  currency: string;
  category: string;
  labels: string[];
  summary: string;
  confidence: "high" | "medium" | "low";
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

async function toBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Has Claude read a stored receipt and fills in any fields the user hasn't set. */
export async function scanReceipt(apiKey: string, receiptId: string): Promise<void> {
  const receipt = await get("receipts", receiptId);
  const file = await get("files", receiptId);
  if (!receipt || !file) throw new ClaudeError("Receipt not found.");
  const isPdf = file.contentType === "application/pdf";
  if (!isPdf && !IMAGE_TYPES.includes(file.contentType as ImageType)) {
    throw new ClaudeError("Only JPEG, PNG, WebP, GIF and PDF files can be scanned.");
  }
  if (file.blob.size > (isPdf ? 20 : 5) * 1024 * 1024) throw new ClaudeError("File is too large to scan.");

  await patch("receipts", receiptId, { status: "scanning" });
  try {
    const anthropic = client(apiKey);
    const profile = await loadProfile();
    const country = countryOf(profile.country);
    const data = await toBase64(file.blob);
    const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: file.contentType as ImageType, data } };

    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: receiptSchema(country.categories) } },
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            {
              type: "text",
              text: `Extract the details from this receipt for a tax-records app. The user is in ${country.name}; their default currency is ${
                profile.currency || country.currency
              } and sales tax there is called ${country.salesTaxName}. Pick the closest category; use "${PERSONAL_CATEGORY}" only for obviously personal purchases.${
                profile.country === "AU" ? " Categories ending in (D1)–(D10) are the deduction labels on the Australian individual tax return; use \"Business expenses (ABN)\" for sole-trader business costs." : ""
              }`,
            },
          ],
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !text || text.type !== "text") {
      await patch("receipts", receiptId, { status: "ready", scanError: "Couldn't read this receipt automatically." });
      return;
    }
    const x = JSON.parse(text.text) as ExtractedReceipt;
    const current = (await get("receipts", receiptId)) ?? receipt;

    // Fill only the fields the user hasn't already set.
    const updates: Partial<Receipt> = {
      status: "ready",
      scanError: x.is_receipt ? null : "This doesn't look like a receipt — check the details.",
      ai: { confidence: x.confidence, summary: x.summary },
    };
    if (!current.merchant && x.merchant) updates.merchant = x.merchant;
    if (!current.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) updates.date = x.date;
    if (current.amount == null && x.total > 0) updates.amount = Math.round(x.total * 100) / 100;
    if (current.taxAmount == null && x.tax_amount > 0) updates.taxAmount = Math.round(x.tax_amount * 100) / 100;
    if (!current.currency && x.currency) updates.currency = x.currency.toUpperCase().slice(0, 3);
    if (!current.category && x.category) updates.category = x.category;
    if (!current.labels?.length && x.labels.length) updates.labels = x.labels.slice(0, 6).map((l) => l.toLowerCase().trim().slice(0, 30));
    if (!current.notes && x.summary) updates.notes = x.summary.slice(0, 500);
    if (current.deductible == null) updates.deductible = x.category !== PERSONAL_CATEGORY;
    await patch("receipts", receiptId, updates);
  } catch (err) {
    const e = friendlyError(err);
    await patch("receipts", receiptId, { status: "ready", scanError: `Auto-scan failed: ${e.message}` });
    throw e;
  }
}
