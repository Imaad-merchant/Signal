// Machine-to-server ingress (no browser session). Two callers, told apart by which
// shared secret their bearer token matches — so this is one Serverless Function
// instead of two (Hobby plan caps a deployment at 12):
//   - the local worker      → Authorization: Bearer <DEVICE_TOKEN>  (POST telemetry/grades)
//   - the Vercel Cron poller → Authorization: Bearer <CRON_SECRET>  (GET, pull Google)
// Both write with the Admin SDK. A leaked DEVICE_TOKEN can only touch DEVICE_USER_ID.
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import nodemailer from "nodemailer";
import { getAdminDb, isAdminConfigured } from "./_firebaseAdmin.js";
import { callLLM, parseJSON } from "./_llm.js";
import { refreshAccessToken, listImportantMail, listRecentDriveFiles, listUpcomingEvents } from "./google/_client.js";

function matches(header, secret) {
  if (!secret) return false;
  const a = Buffer.from(header || "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeId(s) {
  return String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 480);
}

export default async function handler(req, res) {
  const header = req.headers?.authorization || "";
  const isCron = matches(header, process.env.CRON_SECRET);
  const isDevice = matches(header, process.env.DEVICE_TOKEN);
  if (!isCron && !isDevice) return res.status(401).json({ error: "Unauthorized" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Firebase Admin not configured" });

  const db = getAdminDb();
  try {
    if (isCron) {
      // Two daily crons (see vercel.json): ?job=morning (poll Google + notify) and
      // ?job=evening (notify). No job → just poll Google (manual/legacy).
      const job = req.query && (req.query.job === "morning" || req.query.job === "evening") ? req.query.job : null;
      const out = { job: job || "poll" };
      if (!job || job === "morning") out.google = await runGooglePoll(db);
      if (job) {
        out.pushed = await sendBriefingPush(db, job);
        out.emailed = await sendBriefingEmail(job);
      }
      return res.status(200).json({ ok: true, ...out, ran_at: new Date().toISOString() });
    }
    // Device (worker) — GET pulls pending work; POST pushes data + results.
    const job = req.query && req.query.job;
    if (job === "outbox") return await pullOutbox(db, res);
    if (job === "commands") return await pullCommands(db, res);
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    return await workerPush(db, req, res);
  } catch (err) {
    console.error("ingest error:", err);
    return res.status(500).json({ error: err.message || "Ingest failed" });
  }
}

// Notification copy per slot.
function briefingCopy(slot) {
  return slot === "evening"
    ? { title: "Evening review", body: "Time to log your day — tap to check in.", tag: "signal-evening" }
    : { title: "Good morning", body: "Your briefing's ready — tap to see what's on today.", tag: "signal-morning" };
}

// Send a Web Push to every stored subscription. Prunes expired ones.
async function sendBriefingPush(db, slot) {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:signal@example.com", pub, priv);

  const copy = briefingCopy(slot);
  const payload = JSON.stringify({ ...copy, url: "/cowork" });
  const snap = await db.collection("push_subscriptions").get();
  let sent = 0;
  for (const doc of snap.docs) {
    const sub = doc.data().subscription;
    if (!sub || !sub.endpoint) continue;
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      // 404/410 = gone; drop the dead subscription.
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await doc.ref.delete().catch(() => {});
      }
    }
  }
  return sent;
}

// A dependable second channel: email the reminder (works on any device, no install).
async function sendBriefingEmail(slot) {
  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!to || !host || !user || !pass) return false;
  const copy = briefingCopy(slot);
  try {
    const transport = nodemailer.createTransport({
      host, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || user,
      to,
      subject: `Donna — ${copy.title}`,
      text: `${copy.body}\n\nOpen Donna: ${(process.env.APP_URL || "").replace(/\/$/, "")}/cowork`,
    });
    return true;
  } catch {
    return false;
  }
}

// ---- local worker push: telemetry (single doc) + optional signals/grades ----
async function workerPush(db, req, res) {
  const uid = process.env.DEVICE_USER_ID;
  if (!uid) return res.status(503).json({ error: "DEVICE_USER_ID not configured" });

  const now = new Date().toISOString();
  const body = req.body || {};
  const result = { telemetry: 0, signals: 0, grades: 0, notes: 0 };

  if (body.telemetry && typeof body.telemetry === "object") {
    await db.collection("telemetry").doc(uid).set(
      { userId: uid, ...body.telemetry, updated_date: now, created_date: now }, { merge: true }
    );
    result.telemetry = 1;
  }

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

  // Local knowledge notes (Obsidian vault / folders). Idempotent by file path;
  // committed in chunks to stay under Firestore's 500-op batch limit.
  if (Array.isArray(body.notes) && body.notes.length) {
    const slice = body.notes.slice(0, 400);
    for (let i = 0; i < slice.length; i += 400) {
      const chunk = slice.slice(i, i + 400);
      const batch = db.batch();
      for (const n of chunk) {
        const ref = db.collection("notes").doc(safeId(`${uid}_${n.path || n.title || now}`));
        batch.set(ref, {
          userId: uid, source: "worker",
          title: String(n.title || "").slice(0, 200),
          folder: String(n.folder || "").slice(0, 200),
          path: String(n.path || "").slice(0, 500),
          content: String(n.content || "").slice(0, 6000),
          modified: n.modified || now,
          created_date: now, updated_date: now,
        }, { merge: true });
      }
      await batch.commit();
    }
    result.notes = slice.length;
  }

  // Active-app context (time-blindness) → merge onto the telemetry doc.
  if (body.active && typeof body.active === "object") {
    await db.collection("telemetry").doc(uid).set({ userId: uid, active: body.active, updated_date: now }, { merge: true });
    result.active = 1;
  }

  // Audio-memo / scratchpad captures → categorise + queue for the vault.
  if (Array.isArray(body.capture) && body.capture.length) {
    for (const c of body.capture.slice(0, 20)) {
      const text = String(c?.text || "").trim();
      if (text) await categorizeAndQueue(db, uid, text, now);
    }
    result.captured = Math.min(body.capture.length, 20);
  }

  // Worker reports it wrote these outbox notes into the vault.
  if (Array.isArray(body.outbox_done) && body.outbox_done.length) {
    const batch = db.batch();
    for (const id of body.outbox_done.slice(0, 100)) batch.set(db.collection("note_outbox").doc(String(id)), { status: "done", updated_date: now }, { merge: true });
    await batch.commit();
    result.outbox_done = body.outbox_done.length;
  }

  // Command execution results from the worker.
  if (Array.isArray(body.command_results) && body.command_results.length) {
    const batch = db.batch();
    for (const r of body.command_results.slice(0, 50)) {
      if (!r || !r.id) continue;
      batch.set(db.collection("commands").doc(String(r.id)), { status: "done", ok: !!r.ok, output: String(r.output || "").slice(0, 12000), updated_date: now }, { merge: true });
    }
    await batch.commit();
    result.command_results = body.command_results.length;
  }

  // Automation reports — what the user's Claude automations found or did. Surfaced
  // (and read aloud) in the next morning/daily briefing. Idempotent by external_id
  // when provided, so a retrying automation doesn't create duplicates.
  if (Array.isArray(body.reports) && body.reports.length) {
    const batch = db.batch();
    let n = 0;
    for (let i = 0; i < Math.min(body.reports.length, 50); i++) {
      const r = body.reports[i] || {};
      if (!r.title && !r.summary) continue;
      const key = r.external_id ? `${uid}_${r.external_id}` : `${uid}_${now}_${i}`;
      batch.set(db.collection("reports").doc(safeId(key)), {
        userId: uid,
        source: String(r.source || "automation").slice(0, 120),
        title: String(r.title || "").slice(0, 200),
        summary: String(r.summary || "").slice(0, 1200),
        detail: r.detail ? String(r.detail).slice(0, 6000) : "",
        ok: r.ok === false ? false : true,
        announced: false,
        occurred_at: r.at || now,
        created_date: now, updated_date: now,
      }, { merge: true });
      n++;
    }
    if (n) await batch.commit();
    result.reports = n;
  }

  return res.status(200).json({ ok: true, ...result, at: now });
}

// Categorise a raw note and queue it for the worker to write into the Obsidian vault.
async function categorizeAndQueue(db, uid, text, now) {
  try {
    const system = `You are Donna. Categorise this note into ONE bucket ("SaaS Idea","Marketing Tactic","Research","Task","Note") and tidy it.
Return JSON: { "bucket": string, "title": string, "content": markdown }`;
    const raw = await callLLM({ system, user: `"""${text.slice(0, 4000)}"""`, json: true });
    const p = parseJSON(raw);
    const VALID = ["SaaS Idea", "Marketing Tactic", "Research", "Task", "Note"];
    await db.collection("note_outbox").add({
      userId: uid,
      bucket: VALID.includes(p?.bucket) ? p.bucket : "Note",
      title: p?.title ? String(p.title).slice(0, 160) : "Note",
      content: p?.content ? String(p.content) : text,
      status: "pending", created_date: now,
    });
  } catch { /* ignore */ }
}

// GET ?job=outbox — pending notes for the worker to write into the vault (marks them "writing").
async function pullOutbox(db, res) {
  const uid = process.env.DEVICE_USER_ID;
  if (!uid) return res.status(503).json({ error: "DEVICE_USER_ID not configured" });
  const snap = await db.collection("note_outbox").where("userId", "==", uid).limit(100).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.status === "pending").slice(0, 50);
  if (items.length) {
    const batch = db.batch();
    for (const it of items) batch.set(db.collection("note_outbox").doc(it.id), { status: "writing" }, { merge: true });
    await batch.commit();
  }
  return res.status(200).json({ items: items.map((i) => ({ id: i.id, bucket: i.bucket, title: i.title, content: i.content })) });
}

// GET ?job=commands — pending commands for the worker to run (marks them "running").
async function pullCommands(db, res) {
  const uid = process.env.DEVICE_USER_ID;
  if (!uid) return res.status(503).json({ error: "DEVICE_USER_ID not configured" });
  const snap = await db.collection("commands").where("userId", "==", uid).limit(100).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.status === "pending").slice(0, 10);
  if (items.length) {
    const batch = db.batch();
    for (const it of items) batch.set(db.collection("commands").doc(it.id), { status: "running" }, { merge: true });
    await batch.commit();
  }
  return res.status(200).json({ items: items.map((i) => ({ id: i.id, text: i.text })) });
}

// ---- cron: pull Gmail / Drive / Calendar for every connected user ----
async function runGooglePoll(db) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { skipped: "google not configured" };

  const now = new Date().toISOString();
  const summary = { users: 0, written: 0, errors: [] };

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

    const items = [];
    try {
      for (const m of await listImportantMail(accessToken)) {
        items.push({ kind: "email", external_id: m.id, title: m.subject, summary: `${m.from} — ${m.snippet}`.slice(0, 300), link: `https://mail.google.com/mail/u/0/#inbox/${m.id}`, occurred_at: m.date || now });
      }
    } catch (err) { summary.errors.push(`gmail ${uid}: ${err.message}`); }

    try {
      for (const f of await listRecentDriveFiles(accessToken)) {
        items.push({ kind: "drive", external_id: f.id, title: f.name, summary: `Updated ${f.modifiedTime}`, link: f.link, occurred_at: f.modifiedTime || now });
      }
    } catch (err) { summary.errors.push(`drive ${uid}: ${err.message}`); }

    try {
      for (const e of await listUpcomingEvents(accessToken, 14)) {
        const when = e.start
          ? new Date(e.start).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" })
          : "";
        items.push({ kind: "calendar", external_id: e.id, title: e.summary, summary: when, link: e.link, occurred_at: e.start || now });
      }
    } catch (err) { summary.errors.push(`calendar ${uid}: ${err.message}`); }

    if (items.length) {
      const batch = db.batch();
      for (const it of items) {
        const ref = db.collection("signals").doc(safeId(`${uid}_${it.kind}_${it.external_id}`));
        batch.set(ref, { userId: uid, source: "google", ...it, created_date: now, updated_date: now }, { merge: true });
      }
      await batch.commit();
      summary.written += items.length;
    }
  }
  return summary;
}
