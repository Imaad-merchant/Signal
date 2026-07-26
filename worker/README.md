# Signal local worker

A small Node process that runs on **your** machine and pushes things the cloud
can't see into your Signal app:

- **Local telemetry** — hostname, uptime, memory, load → a live "this machine" doc.
- **(Opt-in) UH grades** — scraped locally and pushed to the grades the status grid
  reads. **Off by default** — see the warning below.

It only ever makes **outbound** HTTPS requests, so there's no inbound port, no
certificate, and no browser mixed-content problem. Secrets live in an **encrypted
local config**, never in the cloud.

## How it fits

```
[ your machine ]  --outbound HTTPS-->  POST /api/ingest  (DEVICE_TOKEN)
   signal-worker                          |
                                          v  Firebase Admin SDK
                                     Firestore (telemetry / grades)
                                          ^
                                          |  owner-scoped read
                                   Signal app  /cowork status grid
```

The endpoint (`api/ingest.js`) authenticates the worker with a single
`DEVICE_TOKEN` that is bound server-side to one owner via `DEVICE_USER_ID` — a
leaked token can only ever write to **your** data.

## Server setup (once, in Vercel env)

You already added `FIREBASE_SERVICE_ACCOUNT` for Phase C. Add two more:

| Variable | Value |
| --- | --- |
| `DEVICE_TOKEN` | any long random string (the worker uses the same value) |
| `DEVICE_USER_ID` | your Firebase uid (the owner these pushes belong to) |

Find your uid: sign in to the app → browser console → `firebase.auth().currentUser.uid`,
or Firebase console → Authentication → Users.

Publish the Firestore rules too (adds the owner-only `telemetry` collection):
`firebase deploy --only firestore:rules`.

## Worker setup (on your machine)

```bash
cd worker
cp config.example.json config.json      # fill in apiUrl + deviceToken
node signal-worker.mjs                   # test run
```

### Encrypt the config (recommended)

```bash
export SIGNAL_WORKER_PASSPHRASE='a strong passphrase'
node encrypt-config.mjs config.json      # writes config.json.enc
rm config.json                           # remove the plaintext
```

The worker prefers `config.json.enc` and decrypts it at runtime using
`SIGNAL_WORKER_PASSPHRASE` from its environment.

### Keep it running

**macOS (launchd)** or **Linux (systemd)** — run `node /path/to/worker/signal-worker.mjs`
on login, restart on failure, with `SIGNAL_WORKER_PASSPHRASE` in the unit's
environment. Or simplest with **pm2**:

```bash
npm i -g pm2
SIGNAL_WORKER_PASSPHRASE='…' pm2 start signal-worker.mjs --name signal-worker
pm2 save && pm2 startup
```

## Local knowledge (Obsidian vault + folders)

Let Donna search your notes. In `config.json`, set the `knowledge` block:

```json
"knowledge": {
  "enabled": true,
  "paths": [
    "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/YOUR_VAULT",
    "~/Documents"
  ],
  "sinceDays": 45,
  "intervalMinutes": 20
}
```

The worker indexes text files (`.md`/`.txt`/`.markdown`) modified in the last
`sinceDays`, every `intervalMinutes`, and pushes `{title, folder, content, path}`
to your `notes` store (read-only; dotfolders like `.obsidian` are skipped). Then in
Donna say **"search my notes for micro-influencers"** or **"find my note about the
SaaS launch"** — she reads back the top matches, and on desktop the result chips
deep-link straight into Obsidian (`obsidian://`).

> Find your iCloud Obsidian path with: `ls ~/Library/Mobile\ Documents/ | grep obsidian`
> — the vault folder is under `iCloud~md~obsidian/Documents/`.

## Write-back to Obsidian + audio + context + orchestration (Worker v2)

All opt-in via `config.json`. All run on your Mac.

**Obsidian write-back.** Set `knowledge.vaultPath` to your vault. When you say
**"capture this idea …"** to Donna, she categorises it (SaaS / Marketing / Research /
Task / Note) and queues it; the worker writes a markdown file into
`vaultPath/<Ideas|Marketing|Research|Tasks|Notes>/`. She also flags likely
duplicates ("close to your note X — say 'merge'…").

**Audio brain-dumps.** Point `audio.paths` at a folder your iPhone voice memos sync
to (iCloud), set `openaiKey`, `audio.enabled: true`. New recordings are transcribed
with Whisper, categorised, and filed into the vault automatically.

```json
"openaiKey": "sk-...",
"audio": { "enabled": true, "paths": ["~/Library/Mobile Documents/com~apple~CloudDocs/VoiceMemos"], "sinceHours": 48 }
```

**Time-blindness context.** `context.enabled: true` samples your frontmost app and
fires native macOS notifications per rule:

```json
"context": { "enabled": true, "rules": [
  { "app": "Code", "everyMinutes": 120, "message": "Two hours in the editor — stretch, water." }
] }
```

**Orchestration (FULL ACCESS — off by default).** `orchestration.enabled: true` lets
Donna run shell commands you queue by voice ("orchestrate …", "run command …", "tell
claude …", "execute …"). It runs them in `orchestration.cwd` and streams output back
to Donna. Every command is logged to the worker console. **This executes arbitrary
commands from voice — enable only if you accept that.**

```json
"orchestration": { "enabled": true, "cwd": "~/dev", "timeoutSeconds": 180 }
```

## ⚠️ UH grades scraper — read before enabling

The recommended way to log grades is **manual paste**: just say them to the orb
("got a 92 on the calculus midterm") — zero credentials, no grey area.

The scraper in `uh-grades.mjs` is **off unless you set `uh.enabled: true`**. It runs
entirely locally with your credentials from the encrypted config and pushes only
parsed grades. **Automating a university-portal login very likely violates that
portal's Terms of Service and your university's acceptable-use policy.** You'd be
doing this to your own account, at your own risk. To use it you must also install
Playwright (an optional dependency):

```bash
npm install playwright && npx playwright install chromium
```

Then fill in the `uh` block in your config (login/grades URLs + the CSS selectors
for your portal's markup).
