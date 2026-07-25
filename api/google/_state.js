// Signed OAuth `state` so the callback can trust which user is connecting,
// without a session. The browser can't send our Firebase bearer token on Google's
// redirect back, so we encode the uid into `state` and HMAC-sign it. The callback
// verifies the signature before storing anything.
import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  // Dedicated secret preferred; fall back to CRON_SECRET so there's one fewer
  // env var to set. Never falls back to something guessable.
  const s = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("Set GOOGLE_OAUTH_STATE_SECRET (or CRON_SECRET) to sign OAuth state");
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signState(uid) {
  const payload = b64url(JSON.stringify({ uid, iat: Date.now() }));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

// Returns { uid } on success, throws on tamper/expiry (15 min window).
export function verifyState(state) {
  if (typeof state !== "string" || !state.includes(".")) throw new Error("Bad state");
  const [payload, sig] = state.split(".");
  const expected = b64url(createHmac("sha256", secret()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("State signature mismatch");
  const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  if (!data.uid) throw new Error("State missing uid");
  if (Date.now() - Number(data.iat || 0) > 15 * 60 * 1000) throw new Error("State expired");
  return { uid: data.uid };
}
