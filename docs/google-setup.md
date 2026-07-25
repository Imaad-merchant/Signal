# Connecting Google Workspace to Signal

Signal can pull your recent **Gmail**, **Drive**, and **Calendar** highlights into
the status grid on `/cowork`. Ingestion runs server-side on a Vercel Cron, so the
app reads the results even when your phone is closed. Everything is owner-scoped
and read-only.

You need to do two one-time setups: a **Google Cloud OAuth client** and a
**Firebase service account**, then add a handful of environment variables in
Vercel. No secrets go in the repo.

---

## 1. Google Cloud OAuth client

1. Go to <https://console.cloud.google.com/> → create (or pick) a project.
2. **APIs & Services → Enable APIs** and enable: **Gmail API**, **Google Drive
   API**, **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**, then **Testing** mode is fine (add your own Google
     account under *Test users* — no verification needed for personal use).
   - Scopes: you can leave the defaults; the app requests read-only Gmail/Drive/
     Calendar + email at connect time.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URI:
     `https://YOUR-APP.vercel.app/api/google/oauth-callback`
     (use your real Vercel domain).
   - Save the **Client ID** and **Client secret**.

## 2. Firebase service account (server-side writes)

The cron writes ingested signals with the Admin SDK.

1. Firebase console → **Project settings → Service accounts → Generate new private
   key**. A JSON file downloads.
2. Base64-encode it (one line):
   ```bash
   base64 -w0 service-account.json    # Linux
   base64 service-account.json | tr -d '\n'   # macOS
   ```
   Keep this string secret — it grants full project access.

## 3. Vercel environment variables

Project → **Settings → Environment Variables** (Production + Preview):

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-APP.vercel.app/api/google/oauth-callback` |
| `APP_URL` | `https://YOUR-APP.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT` | the base64 string from step 2 |
| `CRON_SECRET` | any long random string (Vercel sends it on cron runs) |
| `GOOGLE_OAUTH_STATE_SECRET` | any long random string (optional; falls back to `CRON_SECRET`) |

Redeploy after adding them.

## 4. Publish the Firestore rules

The new `signals` and `grades` collections (and the server-only `google_tokens`)
are in `firestore.rules`. Publish them once:

```bash
firebase deploy --only firestore:rules
```
(or paste `firestore.rules` into Firebase console → Firestore → Rules → Publish).

## 5. Connect

Open `/cowork`, tap the **Inbox** tile ("Connect Google") → consent → you're
bounced back with "Google connected". The next cron run fills the tile.

---

### Polling frequency

`vercel.json` schedules the poller once a day (`0 12 * * *`) — the Vercel **Hobby**
plan allows at most daily crons. On **Pro** you can make it frequent, e.g. every
15 minutes:

```json
"crons": [{ "path": "/api/cron/ingest-google", "schedule": "*/15 * * * *" }]
```

You can also trigger a run manually (or from the local worker in Phase D):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/ingest-google
```

Runs are **idempotent** — each Gmail/Drive/Calendar item has a stable id, so
re-running never creates duplicates.

### Disconnecting

`POST /api/google/disconnect` (owner-scoped) revokes the token at Google and
deletes it from Firestore.
