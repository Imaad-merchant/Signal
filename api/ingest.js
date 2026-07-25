// Outbound ingest endpoint for the local worker (Phase D).
//
// The worker runs on your machine and pushes things the cloud genuinely can't see
// — local telemetry and (opt-in) scraped grades — to this endpoint over HTTPS.
// It's outbound-only from the worker's side, so there's no inbound port, cert, or
// tunnel, and it sidesteps the browser mixed-content problem entirely.
//
// Auth: a single shared DEVICE_TOKEN (constant-time compare). The token maps to
// exactly ONE owner via DEVICE_USER_ID, so a leaked token can only ever write to
// your own data — the body can't choose a different user.
import { timingSafeEqual } from "node:crypto";
import { getAdminDb, isAdminConfigured } from "./_firebaseAdmin.js";

function authorized(req) {
  const token = process.env.DEVICE_TOKEN;
  if (!token) return false;
  const header = req.headers?.authorization || "";
  const expected = `Bearer ${token}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeId(s) {
  return String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 480);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const uid = process.env.DEVICE_USER_ID;
  if (!uid) return res.status(503).json({ error: "DEVICE_USER_ID not configured" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Firebase Admin not configured" });

  const db = getAdminDb();
  const now = new Date().toISOString();
  const body = req.body || {};
  const result = { telemetry: 0, signals: 0, grades: 0 };

  try {
    // Latest local telemetry → a single upserted doc (never floods the grid).
    if (body.telemetry && typeof body.telemetry === "object") {
      await db.collection("telemetry").doc(uid).set(
        { userId: uid, ...body.telemetry, updated_date: now, created_date: now },
        { merge: true }
      );
      result.telemetry = 1;
    }

    // Generic signals (idempotent by kind + external_id).
    if (Array.isArray(body.signals) && body.signals.length) {
      const batch = db.batch();
      for (const s of body.signals.slice(0, 100)) {
        const ref = db.collection("signals").doc(safeId(`${uid}_${s.kind || "worker"}_${s.external_id || now}`));
        batch.set(ref, {
          userId: uid, source: "worker",
          kind: s.kind || "worker", title: String(s.title || "").slice(0, 200),
          summary: String(s.summary || "").slice(0, 400), link: s.link || "",
          occurred_at: s.occurred_at || now, created_date: now, updated_date: now,
        }, { merge: true });
      }
      await batch.commit();
      result.signals = Math.min(body.signals.length, 100);
    }

    // Grades (idempotent by course + assignment).
    if (Array.isArray(body.grades) && body.grades.length) {
      const batch = db.batch();
      for (const g of body.grades.slice(0, 200)) {
        const ref = db.collection("grades").doc(safeId(`${uid}_${g.course || ""}_${g.assignment || ""}`));
        batch.set(ref, {
          userId: uid, source: "worker",
          course: String(g.course || "").slice(0, 120),
          assignment: g.assignment ? String(g.assignment).slice(0, 160) : null,
          score: Number.isFinite(Number(g.score)) ? Number(g.score) : null,
          max_score: Number.isFinite(Number(g.max ?? g.max_score)) ? Number(g.max ?? g.max_score) : null,
          graded_on: g.graded_on || now.slice(0, 10),
          created_date: now, updated_date: now,
        }, { merge: true });
      }
      await batch.commit();
      result.grades = Math.min(body.grades.length, 200);
    }

    return res.status(200).json({ ok: true, ...result, at: now });
  } catch (err) {
    console.error("ingest error:", err);
    return res.status(500).json({ error: err.message || "Ingest failed" });
  }
}
