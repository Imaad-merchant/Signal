# 6am / 6pm reminders (web push + email)

Donna can alert you at **6am** (morning briefing) and **6pm** (evening review) even
when the app is closed — via a browser **push notification** and, as a dependable
backup, an **email** reminder.

## 1. VAPID keys (for web push)

Generate a key pair once (locally):

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** (safe to expose) and a **Private Key** (secret → Vercel
only, never chat/git). Add these in **Vercel → Settings → Environment Variables** —
type secret values directly into Vercel:

| Variable | Value | Read by |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | the public key | `api/ingest.js` (server) |
| `VITE_VAPID_PUBLIC_KEY` | the **same** public key, again | `src/components/donna/push.js` (browser) |
| `VAPID_PRIVATE_KEY` | the private key | `api/ingest.js` (server) |
| `VAPID_SUBJECT` | `mailto:imaadmerchant@gmail.com` | `api/ingest.js` (server) |
| `CRON_SECRET` | already set (the crons use it) | |
| `FIREBASE_SERVICE_ACCOUNT` | already set (stores subscriptions) | |

**The gotcha — get these exactly right or push silently never fires:**
- The **public key is set twice**, same value: `VAPID_PUBLIC_KEY` (server) **and**
  `VITE_VAPID_PUBLIC_KEY` (browser). The private key is set once, as `VAPID_PRIVATE_KEY`.
- This is a **Vite** app, so the browser can only read env vars prefixed **`VITE_`**.
  It is **not** Next.js — `NEXT_PUBLIC_VAPID_PUBLIC_KEY` would be ignored and the
  browser would never subscribe.
- `VITE_*` vars are **baked in at build time**, so you **must redeploy** after adding
  them — a running deploy won't pick up the value.

Then on `/cowork` open a briefing → **"Get 6am & 6pm reminders"** → allow notifications.

> **iPhone:** web push only works if Donna is **added to the Home Screen** (Share →
> Add to Home Screen) and opened from there — that's an Apple limitation, not the app.
> The email reminder below has no such requirement.

## 2. Email reminders (backup channel — no install needed)

Reuses your SMTP (see `email-setup.md`). Set the recipient:

| Variable | Value |
| --- | --- |
| `NOTIFY_EMAIL` | where to send reminders (defaults to `SMTP_USER` if unset) |

With SMTP configured, each 6am/6pm cron also emails you the reminder.

## Scheduling note (DST)

`vercel.json` runs the crons at **11:00 and 23:00 UTC**, which is 6am/6pm during
US Central **Daylight** time. In **Standard** time (winter) they land at 5am/5pm.
Vercel Cron uses fixed UTC and can't auto-shift for DST; adjust the two `schedule`
values by an hour if you want them exact year-round. On the **Hobby** plan these two
daily crons are the max allowed.
