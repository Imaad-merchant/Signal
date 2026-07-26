# 6am / 6pm reminders (web push + email)

Signal can alert you at **6am** (morning briefing) and **6pm** (evening review) even
when the app is closed — via a browser **push notification** and, as a dependable
backup, an **email** reminder.

## 1. VAPID keys (for web push)

Generate a key pair once (locally):

```bash
npx web-push generate-vapid-keys
```

Add in **Vercel → Settings → Environment Variables**:

| Variable | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | the public key |
| `VAPID_PRIVATE_KEY` | the private key |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `VITE_VAPID_PUBLIC_KEY` | the **same** public key (exposed to the app so it can subscribe) |
| `CRON_SECRET` | already set (the crons use it) |
| `FIREBASE_SERVICE_ACCOUNT` | already set (stores subscriptions) |

Redeploy, then on `/cowork` open a briefing → **"Get 6am & 6pm reminders"** → allow
notifications.

> **iPhone:** web push only works if Signal is **added to the Home Screen** (Share →
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
