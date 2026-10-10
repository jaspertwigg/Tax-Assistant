# Tax Assistant

A free, personal, phone-only app for keeping your tax affairs in order. Your receipts and records are stored only on your phone.

## What it does

- **Receipts.** Photograph a receipt or upload images/PDFs, then enter the merchant, date, total, GST and category. You can add your own labels and notes, mark items as personal, search and filter by year, category or label, and see which receipts still need details filled in. Optionally, Claude can read receipts for you (see *Costs*).
- **Copy my year for Claude.** One tap copies a plain-text summary of the year's receipts, income, car trips and totals. Paste it into a normal Claude chat and ask questions about your real figures, at no extra cost.
- **Overview.** Claimable expenses, income, mileage allowance, VAT/GST on expenses, a rough profit figure, spending by category, upcoming deadlines and recent receipts.
- **Income and mileage logs.** Record income by source and type, and log business trips.
- **Deadlines and reminders.** Shows the usual key dates for your country plus your own reminders.
- **CSV export.** One file for the tax year, ready to send to an accountant.
- **Backup and restore.** Saves everything, photos included, to a single file you can keep in iCloud Drive or Google Drive.
- **Set up for Australia.** Uses the 1 July – 30 June financial year, AUD, GST and PAYG tax withheld. It shows ATO key dates: BAS quarters, 14 July income statements, 31 October self-lodgment and 15 May for tax-agent clients. Deduction categories follow the tax return labels (D1 car, D2 travel, D3 clothing, D4 self-education, D5 other work expenses, D9 donations, D10 managing tax affairs). Work car trips use the cents-per-km method, capped at 5,000 km. Other countries (UK, US, Ireland, New Zealand, Canada) can be chosen in Settings.

> The app gives general information, not regulated tax advice. Check anything important with your tax authority or an accountant.

## Where your data lives

| What | Where |
| --- | --- |
| Receipts, photos, income, car trips, settings | Only on your phone, in the app's private browser storage (IndexedDB) |
| Your Claude API key (optional) | Only on your phone. It is sent only to Anthropic, when the app reads a receipt. |
| The app's code | This GitHub repo, published by GitHub Pages so your phone can download and install it |

There is no server and no database in the cloud. GitHub Pages only serves the empty app. Anyone who finds the address gets a blank copy with no access to your data.

Data leaves the phone in only two cases:
- Only if you've added an API key: when you add a receipt, its photo is sent to Anthropic's API so Claude can read it. Anthropic does not train on API data by default.
- When you save a backup or export, the file goes wherever you choose to put it.

**Back up regularly.** If you delete the app, clear your browser data or lose your phone, the data is gone. Use *Settings → Save backup*.

## Set it up

1. **Put the code on GitHub.** Create a repository and push this code to its `main` branch.
2. **Turn on GitHub Pages.** In the repo, go to *Settings → Pages → Build and deployment → Source* and choose **GitHub Actions**. The included workflow builds and publishes the app on every push to `main`. The address appears on that page, like `https://<username>.github.io/<repo>/`.
   - GitHub Pages from a *private* repo needs a paid GitHub plan. On a free plan, make the repo public. Only the app's code is public; your data is never in the repo.
3. **Install it on your phone.** Open the address in Safari (iPhone) or Chrome (Android), then choose *Share → Add to Home Screen* (iPhone) or *⋮ → Install app* (Android). Always open it from the home-screen icon. On iPhone, data saved by an installed app isn't cleared automatically the way Safari website data can be.
4. **Optional: add a Claude API key** if you want receipts read automatically. Create one at <https://console.anthropic.com/settings/keys>, set a monthly spend limit, and paste it into *Settings* in the app. Leave it out to keep the app free.
5. Set your country and describe your situation in *Settings*, and start scanning.

## Costs

The app is free: GitHub Pages hosting costs nothing, and without an API key nothing is ever charged. If you add a key, reading a receipt uses Claude Opus 5.5 ($4 / $20 per million input/output tokens) and costs about 1–3 US cents per receipt, billed to your own Anthropic account. A Claude Pro subscription does not cover API usage.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test
npm run build
```

| Path | Purpose |
| --- | --- |
| `src/lib/db.ts` | On-device database (IndexedDB) |
| `src/lib/claude.ts` | Optional receipt reading via the Claude API, called directly from the phone |
| `src/lib/summary.ts` | The "Copy my year for Claude" text summary |
| `src/lib/backup.ts` | Backup, restore and share-sheet saving |
| `src/pages/` | Screens |
| `public/sw.js` | Caches the app so it opens without signal |
| `.github/workflows/pages.yml` | Builds and publishes to GitHub Pages |
