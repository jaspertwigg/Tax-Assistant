# Tax Assistant

A personal, phone-only app for keeping your tax affairs in order. Your receipts and records are stored only on your phone, and Claude reads receipts and answers your questions.

## What it does

- **Receipts.** Photograph a receipt, or upload images/PDFs. Claude reads the merchant, date, total, VAT/GST and category. You can add your own labels and notes, mark items as personal, search and filter by tax year, category or label, and see which receipts still need checking.
- **Ask Claude.** A chat that sees your receipts, income and mileage for the current tax year and checks official guidance online for current rates and deadlines, with links to its sources.
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
| Receipts, photos, income, mileage, chats, settings | Only on your phone, in the app's private browser storage (IndexedDB) |
| Your Claude API key | Only on your phone. It is sent only to Anthropic when the app calls Claude. |
| The app's code | This GitHub repo, published by GitHub Pages so your phone can download and install it |

There is no server and no database in the cloud. GitHub Pages only serves the empty app. Anyone who finds the address gets a blank copy with no access to your data.

Data leaves the phone in only two cases:
- When you scan a receipt or send a chat message, the app sends that receipt or a summary of your records to Anthropic's API so Claude can answer. Anthropic does not train on API data by default.
- When you save a backup or export, the file goes wherever you choose to put it.

**Back up regularly.** If you delete the app, clear your browser data or lose your phone, the data is gone. Use *Settings → Save backup*.

## Set it up

1. **Put the code on GitHub.** Create a repository and push this code to its `main` branch.
2. **Turn on GitHub Pages.** In the repo, go to *Settings → Pages → Build and deployment → Source* and choose **GitHub Actions**. The included workflow builds and publishes the app on every push to `main`. The address appears on that page, like `https://<username>.github.io/<repo>/`.
   - GitHub Pages from a *private* repo needs a paid GitHub plan. On a free plan, make the repo public. Only the app's code is public; your data is never in the repo.
3. **Install it on your phone.** Open the address in Safari (iPhone) or Chrome (Android), then choose *Share → Add to Home Screen* (iPhone) or *⋮ → Install app* (Android). Always open it from the home-screen icon. On iPhone, data saved by an installed app isn't cleared automatically the way Safari website data can be.
4. **Add your Claude API key.** Create a key at <https://console.anthropic.com/settings/keys> and set a monthly spend limit there. Then open the app, go to *Settings*, paste the key and tap *Save key*. The app checks the key works before saving it.
5. Set your country and describe your situation in *Settings*, and start scanning.

## Costs

The app uses Claude Opus 5.5 ($4 per million input tokens, $20 per million output tokens). Reading a receipt typically costs about a cent. A chat question usually costs a few cents, and more if Claude searches the web or you have a lot of records. GitHub Pages is free.

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
| `src/lib/claude.ts` | Receipt reading and chat, calling the Claude API directly from the phone |
| `src/lib/backup.ts` | Backup, restore and share-sheet saving |
| `src/pages/` | Screens |
| `public/sw.js` | Caches the app so it opens without signal |
| `.github/workflows/pages.yml` | Builds and publishes to GitHub Pages |
