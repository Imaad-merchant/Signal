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
