# Sending email from Signal (SMTP)

Jarvis can **draft** an email when you ask ("email my professor that I'll submit
tomorrow"), show it for you to review/edit, and **send** it on a tap — it is never
sent automatically. Sending uses your own SMTP account.

## Vercel environment variables

Project → **Settings → Environment Variables** (Production + Preview):

| Variable | Value |
| --- | --- |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (implicit TLS) |
| `SMTP_USER` | your full email address |
| `SMTP_PASS` | your SMTP password — for Gmail, a **16-char App Password**, not your login password |
| `SMTP_FROM` | (optional) the From address; defaults to `SMTP_USER` |

Redeploy after adding them.

### Gmail note
Use an **App Password** (Google Account → Security → 2-Step Verification → App
passwords), not your normal password. Host `smtp.gmail.com`, port `587`.

## Using it
Ask Jarvis to email someone → a **Review email** card appears with editable To /
Subject / Message → fill in the recipient if needed → **Send**. If SMTP isn't
configured yet, Send returns a clear "email sending not configured" message.

> Note: some serverless hosts throttle outbound SMTP. If sends time out on Vercel,
> that's an SMTP-port limitation, not the app — a transactional email API
> (SendGrid/Resend) would be the fallback; ask and it can be wired in the same route.
