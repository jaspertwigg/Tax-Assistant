import Anthropic from "@anthropic-ai/sdk";
import { countryOf, PERSONAL_CATEGORY, taxYearBounds } from "./countries";
import { get, getAll, newId, patch, put } from "./db";
import { loadProfile } from "./data";
import type { ChatMessage, Income, Profile, Receipt, Trip } from "./types";

const MODEL = "claude-opus-5-5";
// Re-runs a request on Anthropic's recommended model if the primary one declines it.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_HISTORY = 40;
const MAX_RECORDS = 400;

export class ClaudeError extends Error {}

/**
 * The app talks to Claude straight from the phone with the user's own key, which is
 * stored only in this device's database. There is no server in between.
 */
function client(apiKey: string): Anthropic {
  if (!apiKey) throw new ClaudeError("Add your Claude API key in Settings first.");
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

const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "?");
const clean = (s: unknown, max = 120) => String(s ?? "").replace(/\s+/g, " ").slice(0, max);

/** A compact plain-text snapshot of the current tax year's records for Claude to read. */
export async function recordsSnapshot(profile: Profile): Promise<string> {
  const { start, end, label } = taxYearBounds(profile.country);
  const country = countryOf(profile.country);
  const year = country.yearTerm.toLowerCase();
  const [allReceipts, allIncome, allTrips] = await Promise.all([getAll("receipts"), getAll("income"), getAll("mileage")]);
  const inYear = <T extends { date: string }>(xs: T[]) =>
    xs.filter((x) => x.date >= start && x.date <= end).sort((a, b) => b.date.localeCompare(a.date));
  const receipts = inYear<Receipt>(allReceipts);
  const income = inYear<Income>(allIncome);
  const trips = inYear<Trip>(allTrips);

  const byCategory = new Map<string, number>();
  let expenseTotal = 0;
  const receiptLines = receipts.slice(0, MAX_RECORDS).map((r) => {
    const amount = r.amount ?? 0;
    expenseTotal += amount;
    const cat = clean(r.category || "Uncategorised", 40);
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + amount);
    const labels = r.labels?.length ? ` [${r.labels.map((l) => clean(l, 30)).join(", ")}]` : "";
    return `- ${r.date} | ${clean(r.merchant, 60) || "Unknown"} | ${money(r.amount)} ${clean(r.currency, 3)} | ${cat}${
      r.deductible === false ? " | not claimable" : ""
    }${labels}${r.notes ? ` | note: ${clean(r.notes, 80)}` : ""}`;
  });

  let incomeTotal = 0;
  const incomeLines = income.map((r) => {
    incomeTotal += r.amount ?? 0;
    return `- ${r.date} | ${clean(r.source, 60)} | ${money(r.amount)} | ${clean(r.type, 30)}${r.taxPaid ? ` | ${country.taxWithheldName.toLowerCase()} ${money(r.taxPaid)}` : ""}`;
  });
  const distance = trips.reduce((s, t) => s + (t.distance ?? 0), 0);
  const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `  ${c}: ${v.toFixed(2)}`);
  const undated = allReceipts.filter((r) => !r.date).length;

  return [
    `${country.yearTerm} ${label} (${start} to ${end}). Home currency ${profile.currency || country.currency}.`,
    `Receipts stored overall: ${allReceipts.length}${undated ? ` (${undated} with no date yet)` : ""}. In this ${year}: ${receipts.length}, total ${expenseTotal.toFixed(2)}.`,
    cats.length ? `Expenses by category:\n${cats.join("\n")}` : `No expenses recorded this ${year}.`,
    `Income this ${year}: ${income.length} entries, total ${incomeTotal.toFixed(2)}.`,
    `Work car travel this ${year}: ${distance.toFixed(1)} ${profile.distanceUnit} across ${trips.length} trips (rate set: ${profile.mileageRate} per ${profile.distanceUnit === "km" ? "km" : "mile"}).`,
    receiptLines.length ? `Receipts (newest first${receipts.length > MAX_RECORDS ? `, first ${MAX_RECORDS} only` : ""}):\n${receiptLines.join("\n")}` : "",
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
- The user is reading on a phone. Keep replies focused: short paragraphs, bullet lists, and small tables only where they really help. The app renders Markdown.`;

/** Saves the question, asks Claude with the user's records attached, and saves the reply. */
export async function askClaude(apiKey: string, message: string): Promise<void> {
  const anthropic = client(apiKey);
  const [profile, past] = await Promise.all([loadProfile(), getAll("chat")]);
  const history: Anthropic.Beta.BetaMessageParam[] = past
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content }));
  // The API requires the conversation to start with a user turn.
  while (history.length && history[0].role !== "user") history.shift();

  await put("chat", { id: newId(), role: "user", content: message, createdAt: Date.now() });

  try {
    const country = countryOf(profile.country);
    const context = [
      `<my_details>Country: ${country.name} (tax authority: ${country.authority}). Today: ${new Date().toISOString().slice(0, 10)}.`,
      profile.situation ? `About me: ${clean(profile.situation, 1000)}` : "",
      `</my_details>`,
      `<my_records>\n${await recordsSnapshot(profile)}\n</my_records>`,
    ]
      .filter(Boolean)
      .join("\n");

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...history,
      { role: "user", content: [{ type: "text", text: context }, { type: "text", text: message }] },
    ];

    let response: Anthropic.Beta.BetaMessage | undefined;
    // Web search runs on Anthropic's side; a long search loop can pause and needs resuming.
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
    if (!response) throw new ClaudeError("No response from Claude.");

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

    const msg: ChatMessage = {
      id: newId(),
      role: "assistant",
      content: reply,
      sources: [...sources.entries()].slice(0, 8).map(([url, title]) => ({ url, title })),
      createdAt: Date.now(),
    };
    await put("chat", msg);
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
