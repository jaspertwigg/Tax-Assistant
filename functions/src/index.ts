import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { CATEGORIES, COUNTRIES, CountryCode, taxYearBounds } from "./countries";

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const MODEL = "claude-opus-5-5";
// Re-runs a request on Anthropic's recommended model if the primary one declines it.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const MAX_HISTORY = 40;
const MAX_RECORDS = 400;

function client(): Anthropic {
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return auth.uid;
}

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new HttpsError("failed-precondition", "The Anthropic API key is missing or invalid. Set the ANTHROPIC_API_KEY secret.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpsError("resource-exhausted", "Claude is busy right now. Try again in a minute.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    logger.error("Anthropic bad request", err.message);
    return new HttpsError("invalid-argument", "Claude couldn't process that request.");
  }
  if (err instanceof Anthropic.APIError) {
    logger.error("Anthropic API error", err.status, err.message);
    return new HttpsError("unavailable", "Claude is temporarily unavailable. Try again shortly.");
  }
  logger.error("Unexpected error", err);
  return new HttpsError("internal", "Something went wrong.");
}

interface Profile {
  country: CountryCode;
  currency?: string;
  displayName?: string;
  situation?: string;
}

async function loadProfile(uid: string): Promise<Profile> {
  const snap = await db.doc(`users/${uid}`).get();
  const data = (snap.data() ?? {}) as Partial<Profile>;
  const country = data.country && data.country in COUNTRIES ? data.country : "UK";
  return { ...data, country };
}

const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "?");
const clean = (s: unknown, max = 120) => String(s ?? "").replace(/\s+/g, " ").slice(0, max);

/** Builds a compact plain-text snapshot of the user's records for the current tax year. */
async function recordsSnapshot(uid: string, profile: Profile): Promise<string> {
  const { start, end, label } = taxYearBounds(profile.country);
  const user = db.collection("users").doc(uid);
  const inYear = <T>(col: string) =>
    user.collection(col).where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc").limit(MAX_RECORDS).get() as Promise<
      FirebaseFirestore.QuerySnapshot<T>
    >;
  const [receipts, income, mileage, totalReceipts] = await Promise.all([
    inYear<Record<string, unknown>>("receipts"),
    inYear<Record<string, unknown>>("income"),
    inYear<Record<string, unknown>>("mileage"),
    user.collection("receipts").count().get(),
  ]);

  const byCategory = new Map<string, number>();
  let expenseTotal = 0;
  const receiptLines = receipts.docs.map((d) => {
    const r = d.data();
    const amount = typeof r.amount === "number" ? r.amount : 0;
    expenseTotal += amount;
    const cat = clean(r.category || "Uncategorised", 40);
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + amount);
    const labels = Array.isArray(r.labels) && r.labels.length ? ` [${r.labels.map((l) => clean(l, 30)).join(", ")}]` : "";
    return `- ${r.date} | ${clean(r.merchant, 60) || "Unknown"} | ${money(r.amount)} ${clean(r.currency, 3)} | ${cat}${
      r.deductible === false ? " | not claimable" : ""
    }${labels}${r.notes ? ` | note: ${clean(r.notes, 80)}` : ""}`;
  });

  let incomeTotal = 0;
  const incomeLines = income.docs.map((d) => {
    const r = d.data();
    if (typeof r.amount === "number") incomeTotal += r.amount;
    return `- ${r.date} | ${clean(r.source, 60)} | ${money(r.amount)} | ${clean(r.type, 30)}${r.taxPaid ? ` | tax already deducted ${money(r.taxPaid)}` : ""}`;
  });

  let miles = 0;
  for (const d of mileage.docs) {
    const m = d.data().distance;
    if (typeof m === "number") miles += m;
  }

  const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `  ${c}: ${v.toFixed(2)}`);

  return [
    `Tax year ${label} (${start} to ${end}). Home currency ${profile.currency || COUNTRIES[profile.country].currency}.`,
    `Receipts stored overall: ${totalReceipts.data().count}. In this tax year: ${receipts.size}, total ${expenseTotal.toFixed(2)}.`,
    cats.length ? `Expenses by category:\n${cats.join("\n")}` : "No expenses recorded this tax year.",
    `Income this tax year: ${income.size} entries, total ${incomeTotal.toFixed(2)}.`,
    `Business mileage this tax year: ${miles.toFixed(1)} across ${mileage.size} trips.`,
    receiptLines.length ? `Receipts (newest first${receipts.size === MAX_RECORDS ? `, first ${MAX_RECORDS} only` : ""}):\n${receiptLines.join("\n")}` : "",
    incomeLines.length ? `Income entries:\n${incomeLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const CHAT_SYSTEM = `You are the assistant inside a personal tax-records app. The user stores receipts, income and mileage in the app and asks you questions about their tax affairs.

How to help:
- Answer clearly and practically, in plain English, for the user's country (given with each message). Use that country's terminology, tax authority and tax-year dates.
- Each user message carries a <my_records> snapshot of their data for the current tax year. Use it for anything about their own figures: totals, what's missing, which receipts look claimable, what to tell an accountant. Do arithmetic carefully and say which records you used.
- Tax rates, thresholds and allowances change every year. When an answer depends on a current figure or deadline, use web search to check it against the official tax authority's site and cite it, rather than relying on memory.
- Flag likely issues (personal items marked as business costs, missing receipts for big claims, approaching deadlines).
- You give general information, not regulated tax advice. For high-stakes or complicated situations (disputes, investigations, residency questions, large sums), say so briefly and suggest a qualified accountant or tax adviser — but still give a useful answer first.
- Keep replies focused. Use short paragraphs, bullet lists and small tables where they help; the app renders Markdown.`;

export const chat = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "512MiB", maxInstances: 10 },
  async (request) => {
    const uid = requireUid(request.auth);
    const message = typeof request.data?.message === "string" ? request.data.message.trim() : "";
    if (!message) throw new HttpsError("invalid-argument", "Message is empty.");
    if (message.length > 8000) throw new HttpsError("invalid-argument", "Message is too long (8,000 characters max).");

    const chatCol = db.collection(`users/${uid}/chatMessages`);
    try {
      const [profile, historySnap] = await Promise.all([
        loadProfile(uid),
        chatCol.orderBy("createdAt", "desc").limit(MAX_HISTORY).get(),
      ]);
      const snapshot = await recordsSnapshot(uid, profile);
      const country = COUNTRIES[profile.country];

      const history: Anthropic.Beta.BetaMessageParam[] = historySnap.docs
        .reverse()
        .map((d) => d.data())
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
        .map((m) => ({ role: m.role, content: m.content as string }));
      // The API requires the conversation to start with a user turn.
      while (history.length && history[0].role !== "user") history.shift();

      await chatCol.add({ role: "user", content: message, createdAt: FieldValue.serverTimestamp() });

      const context = [
        `<my_details>Country: ${country.name} (tax authority: ${country.authority}). Today: ${new Date().toISOString().slice(0, 10)}.`,
        profile.situation ? `About me: ${clean(profile.situation, 1000)}` : "",
        `</my_details>`,
        `<my_records>\n${snapshot}\n</my_records>`,
      ]
        .filter(Boolean)
        .join("\n");

      const messages: Anthropic.Beta.BetaMessageParam[] = [
        ...history,
        {
          role: "user",
          content: [
            { type: "text", text: context },
            { type: "text", text: message },
          ],
        },
      ];

      const anthropic = client();
      let response: Anthropic.Beta.BetaMessage | undefined;
      // Web search runs server-side; a long search loop can pause and needs resuming.
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await anthropic.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }],
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
          messages,
        });
        if (response.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: response.content });
      }
      if (!response) throw new HttpsError("internal", "No response from Claude.");

      let reply: string;
      const sources = new Map<string, string>();
      if (response.stop_reason === "refusal") {
        reply = "Sorry — I can't help with that request. Try rephrasing it, or ask about a different part of your tax affairs.";
      } else {
        const parts: string[] = [];
        for (const block of response.content) {
          if (block.type !== "text") continue;
          parts.push(block.text);
          for (const c of block.citations ?? []) {
            if (c.type === "web_search_result_location" && c.url) sources.set(c.url, c.title ?? c.url);
          }
        }
        reply = parts.join("").trim() || "I didn't get an answer back — please try again.";
        if (response.stop_reason === "max_tokens") reply += "\n\n_(Reply cut short — ask me to continue.)_";
      }

      const sourceList = [...sources.entries()].slice(0, 8).map(([url, title]) => ({ url, title }));
      await chatCol.add({ role: "assistant", content: reply, sources: sourceList, createdAt: FieldValue.serverTimestamp() });
      return { reply, sources: sourceList };
    } catch (err) {
      throw toHttpsError(err);
    }
  },
);

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_receipt", "merchant", "date", "total", "tax_amount", "currency", "category", "labels", "summary", "confidence"],
  properties: {
    is_receipt: { type: "boolean", description: "False if the document is not a receipt, invoice or bill." },
    merchant: { type: "string", description: "Business name as printed. Empty string if unreadable." },
    date: { type: "string", description: "Transaction date as YYYY-MM-DD. Empty string if not shown." },
    total: { type: "number", description: "Final amount paid including tax. 0 if not shown." },
    tax_amount: { type: "number", description: "VAT/GST/sales tax included in the total. 0 if not shown." },
    currency: { type: "string", description: "ISO 4217 code, e.g. GBP, AUD, USD." },
    category: { type: "string", enum: [...CATEGORIES] },
    labels: { type: "array", items: { type: "string" }, description: "1-4 short lowercase tags, e.g. 'fuel', 'client lunch'." },
    summary: { type: "string", description: "One line describing what was bought." },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

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

export const scanReceipt = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: "512MiB", maxInstances: 10 },
  async (request) => {
    const uid = requireUid(request.auth);
    const receiptId = typeof request.data?.receiptId === "string" ? request.data.receiptId : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(receiptId)) throw new HttpsError("invalid-argument", "Bad receipt id.");

    const ref = db.doc(`users/${uid}/receipts/${receiptId}`);
    try {
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError("not-found", "Receipt not found.");
      const receipt = snap.data()!;
      const path = String(receipt.storagePath ?? "");
      if (!path.startsWith(`users/${uid}/`)) throw new HttpsError("permission-denied", "That file isn't yours.");

      const file = getStorage().bucket().file(path);
      const [meta] = await file.getMetadata();
      const contentType = String(meta.contentType ?? "");
      const size = Number(meta.size ?? 0);
      const isPdf = contentType === "application/pdf";
      if (!isPdf && !IMAGE_TYPES.has(contentType)) {
        throw new HttpsError("invalid-argument", "Only JPEG, PNG, WebP, GIF and PDF files can be scanned.");
      }
      if (size > (isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) throw new HttpsError("invalid-argument", "File is too large to scan.");

      await ref.update({ status: "scanning" });
      const [bytes] = await file.download();
      const data = bytes.toString("base64");
      const profile = await loadProfile(uid);
      const country = COUNTRIES[profile.country];

      const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : {
            type: "image",
            source: { type: "base64", media_type: contentType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
          };

      const response = await client().beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              fileBlock,
              {
                type: "text",
                text: `Extract the details from this receipt for a tax-records app. The user is in ${country.name}; their default currency is ${
                  profile.currency || country.currency
                } and sales tax there is called ${country.salesTaxName}. Pick the closest category; use "Personal (not deductible)" only for obviously personal purchases.`,
              },
            ],
          },
        ],
      });

      const text = response.content.find((b) => b.type === "text");
      if (response.stop_reason === "refusal" || !text || text.type !== "text") {
        await ref.update({ status: "ready", scanError: "Couldn't read this receipt automatically." });
        return { ok: false };
      }
      const extracted = JSON.parse(text.text) as ExtractedReceipt;

      // Fill only the fields the user hasn't already set.
      const updates: Record<string, unknown> = {
        status: "ready",
        scanError: FieldValue.delete(),
        ai: { ...extracted, scannedAt: FieldValue.serverTimestamp() },
      };
      if (!receipt.merchant && extracted.merchant) updates.merchant = extracted.merchant;
      if (!receipt.date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date)) updates.date = extracted.date;
      if (receipt.amount == null && extracted.total > 0) updates.amount = Math.round(extracted.total * 100) / 100;
      if (receipt.taxAmount == null && extracted.tax_amount > 0) updates.taxAmount = Math.round(extracted.tax_amount * 100) / 100;
      if (!receipt.currency && extracted.currency) updates.currency = extracted.currency.toUpperCase().slice(0, 3);
      if (!receipt.category && extracted.category) updates.category = extracted.category;
      if ((!receipt.labels || receipt.labels.length === 0) && extracted.labels.length) {
        updates.labels = extracted.labels.slice(0, 6).map((l) => l.toLowerCase().trim().slice(0, 30));
      }
      if (!receipt.notes && extracted.summary) updates.notes = extracted.summary.slice(0, 500);
      if (receipt.deductible == null) updates.deductible = extracted.category !== "Personal (not deductible)";
      if (!extracted.is_receipt) updates.scanError = "This doesn't look like a receipt — check the details.";

      await ref.update(updates);
      return { ok: true };
    } catch (err) {
      await ref.update({ status: "ready" }).catch(() => undefined);
      throw toHttpsError(err);
    }
  },
);
