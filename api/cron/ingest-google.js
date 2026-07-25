// Google Workspace poller — runs on a Vercel Cron schedule (see vercel.json).
//
// Protected by CRON_SECRET: Vercel automatically sends `Authorization: Bearer
// $CRON_SECRET` on scheduled invocations when that env var is set; we compare it
// in constant time. For each connected user we refresh their access token and pull
// recent Gmail / Drive / Calendar highlights, writing them to the `signals`
// collection with DETERMINISTIC ids so re-runs are idempotent (no duplicates).
import { timingSafeEqual } from "node:crypto";
import { getAdminDb, isAdminConfigured } from "../_firebaseAdmin.js";
import { refreshAccessToken, listImportantMail, listRecentDriveFiles, listTodayEvents } from "../google/_client.js";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers?.authorization || "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Stable per-item id → idempotent upserts.
function signalId(uid, kind, externalId) {
  return `${uid}_${kind}_${externalId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 480);
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Firebase Admin not configured" });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(503).json({ error: "Google client not configured" });

  const db = getAdminDb();
  const now = new Date().toISOString();
  const summary = { users: 0, written: 0, errors: [] };

  try {
    const tokensSnap = await db.collection("google_tokens").get();
    for (const doc of tokensSnap.docs) {
      const uid = doc.id;
      const refreshToken = doc.data().refresh_token;
      if (!refreshToken) continue;
      summary.users++;

      let accessToken;
      try {
        accessToken = await refreshAccessToken({ clientId, clientSecret, refreshToken });
      } catch (err) {
        summary.errors.push(`refresh ${uid}: ${err.message}`);
        continue;
      }

      // Collect signals from each source; one source failing shouldn't sink the rest.
      const items = [];
      try {
        for (const m of await listImportantMail(accessToken)) {
          items.push({
            kind: "email", external_id: m.id,
            title: m.subject, summary: `${m.from} — ${m.snippet}`.slice(0, 300),
            link: `https://mail.google.com/mail/u/0/#inbox/${m.id}`, occurred_at: m.date || now,
          });
        }
      } catch (err) { summary.errors.push(`gmail ${uid}: ${err.message}`); }

      try {
        for (const f of await listRecentDriveFiles(accessToken)) {
          items.push({
            kind: "drive", external_id: f.id,
            title: f.name, summary: `Updated ${f.modifiedTime}`,
            link: f.link, occurred_at: f.modifiedTime || now,
          });
        }
      } catch (err) { summary.errors.push(`drive ${uid}: ${err.message}`); }

      try {
        for (const e of await listTodayEvents(accessToken)) {
          items.push({
            kind: "calendar", external_id: e.id,
            title: e.summary, summary: `Today ${new Date(e.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" })}`,
            link: e.link, occurred_at: e.start || now,
          });
        }
      } catch (err) { summary.errors.push(`calendar ${uid}: ${err.message}`); }

      // Idempotent batch upsert.
      if (items.length) {
        const batch = db.batch();
        for (const it of items) {
          const ref = db.collection("signals").doc(signalId(uid, it.kind, it.external_id));
          batch.set(ref, {
            userId: uid, source: "google", ...it,
            created_date: now, updated_date: now,
          }, { merge: true });
        }
        await batch.commit();
        summary.written += items.length;
      }
    }
    return res.status(200).json({ ok: true, ...summary, ran_at: now });
  } catch (err) {
    console.error("ingest-google error:", err);
    return res.status(500).json({ error: err.message || "Ingest failed", ...summary });
  }
}
