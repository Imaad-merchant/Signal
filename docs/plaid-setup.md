# Bank linking (Plaid) + the Money section

The Money section reads real balances and transactions from your banks through
**Plaid**. Linking happens in the browser (Plaid Link), but every call that
touches an access token runs server-side.

## 1. Plaid credentials

Create an app at [dashboard.plaid.com](https://dashboard.plaid.com) and copy the
**client_id** and the secret for the environment you want. Add them in
**Vercel → Settings → Environment Variables** — type secret values directly into
Vercel, never into chat or git:

| Variable | Value | Read by |
| --- | --- | --- |
| `PLAID_CLIENT_ID` | your Plaid client id | `api/plaid/_client.js` |
| `PLAID_SECRET` | the secret **for the chosen environment** | `api/plaid/_client.js` |
| `PLAID_ENV` | `sandbox`, `development` or `production` | `api/plaid/_client.js` |
| `FIREBASE_SERVICE_ACCOUNT` | already set (stores tokens + synced rows) | |
| `CRON_SECRET` | already set (the nightly sync uses it) | |

**The gotcha:** the secret is per-environment. A `development` secret with
`PLAID_ENV=production` fails with an opaque `INVALID_API_KEYS`. `PLAID_ENV`
defaults to `sandbox`, so leaving it unset means you link fake test banks.

There is no client-side Plaid variable — Link is loaded straight from
`https://cdn.plaid.com` by `src/components/money/plaidLink.js`.

## 2. How linking works

1. **Connect bank** in the Money header calls `POST /api/donna` with
   `route: "plaid-link-token"`, which creates a Link token
   (`products: ["transactions"]`, `country_codes: ["US"]`).
2. Plaid Link opens; on success the browser sends the short-lived public token
   back as `route: "plaid-exchange"`.
3. The server swaps it for a long-lived **access token** and stores it in the
   `plaid_items` collection, then runs the first sync.

`plaid_items` is sealed in `firestore.rules` (`allow read, write: if false`) —
only the Admin SDK on the server can read it. Access tokens are never sent to
the browser.

## 3. Syncing

- **Nightly**, `vercel.json` hits `/api/ingest?job=plaid-sync` at `0 8 * * *`.
  It walks every `plaid_items` doc, resumes each item's cursor against Plaid's
  `/transactions/sync`, and upserts into `accounts` and `transactions` with
  deterministic ids (`${uid}_plaid_${account_id}`), so re-syncing never
  duplicates rows.
- **On demand**, the **Sync** button in the Money header calls
  `route: "plaid-sync"`, which does the same for your items only.
- After each nightly run the job also writes one **net-worth snapshot** per
  linked user into `networth_snapshots` (doc id `${uid}_${YYYY-MM-DD}`). That
  collection is read-only to the client and is what the Net Worth trend chart
  draws. The trend needs at least two days of history before it appears.

## 4. Collections

| Collection | Written by | Client access |
| --- | --- | --- |
| `accounts`, `transactions` | Plaid sync (server) + you | owner read/write |
| `subscriptions`, `budgets` | you | owner read/write |
| `category_rules` | you (Transactions → Add Rule) | owner read/write |
| `networth_snapshots` | nightly sync (server) | owner **read only** |
| `plaid_items` | server only | none — sealed |

Rules changes only take effect once merged to `main`:
`.github/workflows/deploy-firestore-rules.yml` deploys `firestore.rules`
automatically. If the client can't read a money collection, the Money section
shows an amber banner saying exactly that — publish the rules and refresh.

## 5. Troubleshooting

- **"Plaid isn't set up on the server yet."** — `plaidConfigured()` is false, so
  one of `PLAID_CLIENT_ID` / `PLAID_SECRET` is missing on Vercel. Redeploy after
  adding them; env changes need a new deployment.
- **Linked, but no transactions.** Plaid backfills gradually; run **Sync** again
  in a few minutes, and check the account actually has `transactions` enabled.
- **Balances look inverted.** Credit and loan balances are negated on the way in
  (`api/plaid/_client.js`), so debts are stored negative and roll up under Debt.
- **Nightly sync stopped.** Check the Vercel cron logs for
  `/api/ingest?job=plaid-sync` — a 401 means `CRON_SECRET` changed.
