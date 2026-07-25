// Server-side Firestore access via the Firebase Admin SDK.
//
// The browser writes to Firestore directly (owner-scoped rules). But the Google
// poller runs in a Vercel Cron with no user session, so it needs the Admin SDK to
// write ingested signals and to read/store OAuth refresh tokens.
//
// Configure with ONE env var — a base64-encoded service-account JSON:
//   FIREBASE_SERVICE_ACCOUNT=<base64 of the downloaded service-account key>
// (Firebase console → Project settings → Service accounts → Generate new key,
//  then `base64 -w0 key.json`.) Nothing is committed; the key lives only in env.
//
// If the env var is absent, getAdminDb() throws a clear, catchable error so the
// rest of the app keeps working and the Google routes report "not configured".
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let cachedDb = null;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Accept either base64-encoded JSON (recommended) or raw JSON.
    const text = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(text);
  } catch (err) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is set but not valid base64/JSON: " + err.message);
  }
}

export function isAdminConfigured() {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

// Returns a Firestore instance backed by the Admin SDK. Throws if not configured.
export function getAdminDb() {
  if (cachedDb) return cachedDb;
  const svc = loadServiceAccount();
  if (!svc) {
    throw new Error("Firebase Admin not configured (set FIREBASE_SERVICE_ACCOUNT)");
  }
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(svc), projectId: svc.project_id });
  cachedDb = getFirestore(app);
  return cachedDb;
}

export default getAdminDb;
