# Tax Assistant

A personal web app for keeping your tax affairs in order. It runs on Firebase, and Claude does the receipt reading and answers your questions.

- **Receipts.** Photograph a receipt (or upload images/PDFs, or drag them in) and Claude reads the merchant, date, total, VAT/GST and category. You can add your own labels and notes, mark items as personal, search and filter by tax year, category or label, and see which receipts still need checking.
- **Ask Claude.** A chat that can see your receipts, income and mileage for the current tax year and searches official guidance online for up-to-date rates and deadlines (with links to its sources). Conversations are saved.
- **Overview.** Claimable expenses, income, mileage allowance, VAT/GST on expenses, a rough profit figure, spending by category, upcoming deadlines and recent receipts.
- **Income log.** Record income by source and type, including tax already deducted.
- **Mileage log.** Log business trips (with a return-trip toggle). It estimates the allowance from the rate you set.
- **Deadlines and reminders.** Shows the usual key dates for your country plus your own reminders.
- **CSV export.** Exports receipts, income and mileage for the year, ready to send to an accountant.
- **Multi-country.** Supports the UK, Australia, the US, Ireland, New Zealand and Canada. The country sets the tax-year boundaries, deadlines, currency and what Claude assumes.
- **Mobile-friendly.** The camera opens straight away on phones, it works offline from a local cache, and you can add it to your home screen.

> The app gives general information, not regulated tax advice. Check anything important with your tax authority or an accountant.

## How it fits together

| Piece | What it does |
| --- | --- |
| `src/` | React + Vite web app (Firebase Auth, Firestore, Storage) |
| `functions/src/index.ts` | Cloud Functions: `chat` (Claude Q&A with your records + web search) and `scanReceipt` (Claude vision → structured receipt data) |
| `firestore.rules`, `storage.rules` | Each user can only read and write their own data. Chat history can only be written by the server. |
| `.github/workflows/` | CI (typecheck, tests, build) and optional auto-deploy to Firebase on push to `main` |

Your Anthropic API key exists only as a Firebase secret on the server and is never sent to the browser. Data lives under `users/{uid}/…`.

## Setup (about 15 minutes)

1. **Create a Firebase project** at <https://console.firebase.google.com>. Upgrade it to the **Blaze (pay-as-you-go)** plan, because Cloud Functions, secrets and Storage need it. Normal personal use should stay within the free allowances.
2. **Authentication:** go to *Build → Authentication → Sign-in method* and enable **Google** and **Email/Password**.
3. **Firestore:** go to *Build → Firestore Database → Create database* (production mode, any region).
4. **Storage:** go to *Build → Storage → Get started*.
5. **Web app config:** go to *Project settings → Your apps → Add app → Web*. Copy the config values into a new `.env.local` file (use `.env.example` as the template).
6. **Anthropic API key:** create one at <https://console.anthropic.com> → *API keys*.
7. **Install and deploy:**

   ```bash
   npm install
   npm install --prefix functions
   npm install -g firebase-tools
   firebase login
   firebase use --add                              # pick your project
   firebase functions:secrets:set ANTHROPIC_API_KEY  # paste your key
   firebase deploy
   ```

   The deploy prints your app's URL (`https://<project-id>.web.app`). Open it on your phone and use *Add to Home Screen*.

If you deploy functions to a region other than `us-central1`, set `VITE_FIREBASE_FUNCTIONS_REGION` to match.

### Optional: deploy automatically from GitHub

Every push to `main` deploys automatically once you add these in GitHub → *Settings → Secrets and variables → Actions*:

- **Variables:** `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` (and optionally `FIREBASE_FUNCTIONS_REGION`). These are the same values as in `.env.local`.
- **Secret:** `FIREBASE_SERVICE_ACCOUNT` is the JSON key of a service account with the *Firebase Admin* role. Create it in Google Cloud console → IAM → Service accounts.

Until `FIREBASE_PROJECT_ID` is set, the deploy job is skipped.

## Local development

To run everything on your machine with the Firebase emulators (no real project needed):

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > functions/.secret.local
npm run build --prefix functions
firebase emulators:start --project demo-tax-assistant
```

Then, in another terminal, create a `.env.local` with:

```
VITE_FIREBASE_API_KEY=fake
VITE_FIREBASE_PROJECT_ID=demo-tax-assistant
VITE_FIREBASE_STORAGE_BUCKET=demo-tax-assistant.appspot.com
VITE_FIREBASE_APP_ID=1:1:web:1
VITE_USE_EMULATORS=true
```

and run `npm run dev`.

Checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run build --prefix functions`.

## Costs

Both features use Claude Opus 5.5 ($4 per million input tokens, $20 per million output tokens). Scanning a receipt typically costs about a cent. A chat question usually costs a few cents, and more if Claude searches the web or you have a lot of records. You can set a monthly spend limit in the Anthropic console.

## Privacy notes

- Receipt images are stored in your own Firebase Storage. The app shows them through Firebase download URLs. These are long, unguessable links, but anyone who has a link can open that image.
- Claude only sees your records when you send a chat message or scan a receipt. Anthropic's API does not train on your data by default.
