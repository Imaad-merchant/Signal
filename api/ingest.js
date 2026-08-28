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
import { refreshAccessToken, listImportantMail, listRecentDriveFiles, listUpcomingEvents, searchDrive, exportFileText } from "./google/_client.js";
import { syncPlaidItem } from "./plaid/_client.js";
import { syncCalendarForUser } from "./google/_sync.js";

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
      // Nightly Plaid refresh — sync every linked item across all users.
      if (req.query && req.query.job === "plaid-sync") {
        const out = await runPlaidSync(db);
        return res.status(200).json({ ok: true, job: "plaid-sync", ...out, ran_at: new Date().toISOString() });
      }
      // Google Calendar pull — mirror each connected user's events into tasks.
      if (req.query && req.query.job === "gcal-sync") {
        const out = await runGcalSync(db);
        return res.status(200).json({ ok: true, job: "gcal-sync", ...out, ran_at: new Date().toISOString() });
      }
      const job = req.query && (req.query.job === "morning" || req.query.job === "evening") ? req.query.job : null;
      const out = { job: job || "poll" };
      if (!job || job === "morning") out.google = await runGooglePoll(db);
      if (job) {
        out.pushed = await sendBriefingPush(db, job);
        out.emailed = await sendBriefingEmail(db, job);
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

// Nightly: refresh every linked Plaid item for every user (Admin, cursor-based).
async function runPlaidSync(db) {
  const snap = await db.collection("plaid_items").get();
  let items = 0, accounts = 0, added = 0, removed = 0, failed = 0;
  for (const doc of snap.docs) {
    const it = doc.data();
    if (!it.access_token) continue;
    try {
      const r = await syncPlaidItem(db, it.userId, it.item_id, it.access_token, it.cursor || null);
      items++; accounts += r.accounts; added += r.added; removed += r.removed;
    } catch (err) { failed++; console.warn("plaid nightly sync item failed:", err.message); }
  }
  return { items, accounts, added, removed, failed };
}

// Periodic: pull Google Calendar into tasks for every connected user.
async function runGcalSync(db) {
  const snap = await db.collection("google_tokens").get();
  let users = 0, created = 0, updated = 0, deleted = 0, failed = 0;
  for (const doc of snap.docs) {
    try {
      const r = await syncCalendarForUser(db, doc.id);
      if (r.error) { failed++; continue; }
      if (r.skipped) continue;
      users++; created += r.created || 0; updated += r.updated || 0; deleted += r.deleted || 0;
    } catch (err) { failed++; console.warn("gcal sync user failed:", err.message); }
  }
  return { users, created, updated, deleted, failed };
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
  const payload = JSON.stringify({ ...copy, url: "/Donna" });
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
// Gather the user's actionable items so the daily email carries the real agenda —
// the user checks email daily, not the app. Small personal DB → filter in JS.
async function gatherAgenda(db) {
  const uid = process.env.DEVICE_USER_ID || null;
  const today = new Date().toISOString().slice(0, 10);
  const mine = (docs) => docs.map((d) => d.data()).filter((x) => x && (!uid || x.userId === uid));
  const [tSnap, cSnap] = await Promise.all([
    db.collection("tasks").get(),
    db.collection("commitments").get(),
  ]);
  const tasks = mine(tSnap.docs).filter((t) => t.status !== "done");
  const commitments = mine(cSnap.docs).filter((c) => (c.status || "open") === "open").slice(0, 15);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)).slice(0, 15);
  const dueToday = tasks.filter((t) => t.due_date === today).slice(0, 15);
  return { overdue, dueToday, commitments };
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderBriefingEmail(slot, agenda) {
  const link = `${(process.env.APP_URL || "").replace(/\/$/, "")}/Donna`;
  const greeting = slot === "evening" ? "Evening review" : "Good morning";
  const taskLine = (t) => `${t.title || "(untitled)"}${t.due_date ? ` — due ${t.due_date}` : ""}`;
  const commitLine = (c) => `${c.text || "(untitled)"}${c.due_on ? ` — by ${c.due_on}` : ""}`;
  const total = agenda.overdue.length + agenda.dueToday.length + agenda.commitments.length;
  const subject = `Donna — ${greeting}${total ? ` · ${total} to handle` : ""}`;
  const intro = total
    ? (slot === "evening" ? "Here's what's still open — anything to wrap up or carry into tomorrow?" : "Here's what's on your plate today:")
    : "Nothing outstanding — you're all clear.";

  const textParts = [], htmlParts = [];
  const section = (label, items, fmt) => {
    if (!items.length) return;
    textParts.push(`${label}:\n` + items.map((x) => `  • ${fmt(x)}`).join("\n"));
    htmlParts.push(`<h3 style="margin:18px 0 6px;font-size:14px;color:#9aa4b2;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(label)}</h3>` +
      `<ul style="margin:0;padding-left:20px">` + items.map((x) => `<li style="margin:4px 0">${escapeHtml(fmt(x))}</li>`).join("") + `</ul>`);
  };
  section("Overdue", agenda.overdue, taskLine);
  section("Due today", agenda.dueToday, taskLine);
  section("Open commitments", agenda.commitments, commitLine);

  const text = `${greeting}.\n\n${intro}\n\n${textParts.join("\n\n")}${textParts.length ? "\n\n" : ""}Open Donna: ${link}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#e5e7eb;background:#0e1015;padding:24px;border-radius:12px">
    <h2 style="margin:0 0 8px">${escapeHtml(greeting)}</h2>
    <p style="margin:0 0 4px;color:#c7ccd4">${escapeHtml(intro)}</p>
    ${htmlParts.join("")}
    <p style="margin:22px 0 0"><a href="${link}" style="color:#60a5fa">Open Donna →</a></p>
  </div>`;
  return { subject, text, html };
}

// Pretty, email-client-safe HTML for the smart briefing (table layout, inline CSS).
function renderSmartHtml(b, link) {
  const esc = escapeHtml;
  const sec = (label, items, accent) => (!items || !items.length) ? "" :
    `<tr><td style="padding:16px 0 4px"><div style="font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${accent || "#8b95a5"}">${esc(label)}</div></td></tr>` +
    items.map((it) => `<tr><td style="padding:5px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="color:${accent || "#60a5fa"};padding-right:9px;font-size:14px;line-height:1.5">•</td><td style="font-size:14px;line-height:1.55;color:#dfe3ea">${esc(it)}</td></tr></table></td></tr>`).join("");
  const sections = (b.sections || []).map((s) => sec(s.label, s.items)).join("");
  const opps = (b.opportunities && b.opportunities.length) ? sec("Opportunities for you", b.opportunities, "#67e8f9") : "";
  return `<div style="background:#0b0d11;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#14171d;border:1px solid #232833;border-radius:16px;overflow:hidden">
        <tr><td style="padding:26px 30px 8px">
          <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#5b6472">Donna</div>
          <div style="font-size:22px;font-weight:700;color:#f3f4f6;margin-top:6px">${esc(b.greeting || "Good morning")}</div>
          ${b.headline ? `<div style="margin-top:12px;padding:12px 14px;background:#1b2130;border:1px solid #2b3547;border-radius:10px;color:#cfe0ff;font-size:14px;line-height:1.5">${esc(b.headline)}</div>` : ""}
        </td></tr>
        <tr><td style="padding:2px 30px 26px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sections}${opps}</table>
          <div style="margin-top:26px"><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px">Open Donna →</a></div>
        </td></tr>
      </table>
      <div style="color:#3f4652;font-size:11px;margin-top:14px">Signal · your day, organised</div>
    </td></tr></table>
  </div>`;
}
function renderSmartText(b, link) {
  const lines = [b.greeting || "Good morning", ""];
  if (b.headline) lines.push(b.headline, "");
  for (const s of (b.sections || [])) if (s.items && s.items.length) { lines.push(`${s.label}:`); for (const it of s.items) lines.push(`  • ${it}`); lines.push(""); }
  if (b.opportunities && b.opportunities.length) { lines.push("Opportunities for you:"); for (const o of b.opportunities) lines.push(`  • ${o}`); lines.push(""); }
  lines.push(`Open Donna: ${link}`);
  return lines.join("\n");
}

// Compose a personalised, day-specific briefing with an LLM — grounded in today's
// calendar, tasks, recent emails, what Donna's been told (notes), and the user's
// résumé from Drive — and de-duplicated against what recent briefings covered.
// Returns { subject, text, html } or null (caller falls back to the static email).
async function composeSmartBriefing(db, slot) {
  const link = `${(process.env.APP_URL || "").replace(/\/$/, "")}/Donna`;
  const today = new Date().toISOString().slice(0, 10);
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  let agenda = { overdue: [], dueToday: [], commitments: [] };
  try { agenda = await gatherAgenda(db); } catch { /* empty */ }

  let accessToken = null, uid = null;
  try {
    const snap = await db.collection("google_tokens").get();
    const doc = snap.docs.find((d) => d.data().refresh_token);
    if (doc) { uid = doc.id; accessToken = await refreshAccessToken({ clientId, clientSecret, refreshToken: doc.data().refresh_token }); }
  } catch { /* no google */ }

  let events = [], emails = [], resumeText = "";
  if (accessToken) {
    try { events = (await listUpcomingEvents(accessToken, 2)).filter((e) => (e.start || "").slice(0, 10) === today).slice(0, 10); } catch { /* ignore */ }
    try { emails = (await listImportantMail(accessToken, 8)).map((m) => ({ from: m.from, subject: m.subject, snippet: (m.snippet || "").slice(0, 160) })); } catch { /* ignore */ }
    try { const hits = await searchDrive(accessToken, "resume", "any", 3); if (hits && hits.length) resumeText = (await exportFileText(accessToken, hits[0].id, 6000)) || ""; } catch { /* ignore */ }
  }

  let notes = [];
  try {
    if (uid) {
      const nsnap = await db.collection("notes").where("userId", "==", uid).get();
      notes = nsnap.docs.map((d) => d.data()).sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || "")).slice(0, 20)
        .map((n) => ({ title: n.title, gist: (n.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200) }));
    }
  } catch { /* ignore */ }

  const stateRef = uid ? db.collection("briefing_state").doc(uid) : null;
  let already = [];
  try { if (stateRef) { const s = await stateRef.get(); if (s.exists) already = s.data().recentSignatures || []; } } catch { /* ignore */ }

  const system = `You write Imaad's ${slot === "evening" ? "evening" : "morning"} briefing email — a sharp, warm British chief of staff who genuinely knows him.
Return JSON only:
{ "subject": string, "greeting": string, "headline": string,
  "sections": [ { "label": string, "items": [string] } ],
  "opportunities": [string], "signatures": [string] }
RULES:
- Only surface what is RELEVANT and mostly NEW today. Do NOT repeat anything whose gist appears in already_covered. If little is new, keep it short and say the day's light — never pad.
- headline: the single most important thing today (an event, a real deadline), or "" if nothing stands out.
- sections: build from today_events, due_today, overdue, open_commitments, and emails that need action. Natural labels ("Today", "Needs a reply", "Still open"). Skip empties. Short human lines.
- opportunities: 1-3 CONCRETE ways to further his career/goals, grounded in his resume (real skills/experience) and what he's been working on (recent_notes) — a specific volunteer program, scholarship, role, outreach, or skill. Specific to HIM, never generic filler. Omit if you have nothing real.
- signatures: one short stable key per item/opportunity included (so tomorrow won't repeat it).
- No markdown, no emoji. Keep the whole thing tight and skimmable.`;
  const user = `date: ${today}
already_covered: ${JSON.stringify(already.slice(0, 60))}
today_events: ${JSON.stringify(events.map((e) => ({ title: e.summary, when: e.start })))}
due_today: ${JSON.stringify(agenda.dueToday.map((t) => t.title))}
overdue: ${JSON.stringify(agenda.overdue.map((t) => ({ t: t.title, due: t.due_date })))}
open_commitments: ${JSON.stringify(agenda.commitments.map((c) => c.text))}
recent_emails: ${JSON.stringify(emails)}
recent_notes: ${JSON.stringify(notes)}
resume: ${JSON.stringify((resumeText || "").slice(0, 4000))}
Write the briefing.`;

  let parsed;
  try { parsed = parseJSON(await callLLM({ system, user, json: true })); } catch { return null; }
  if (!parsed || !parsed.subject) return null;

  try {
    if (stateRef) {
      const merged = [...(Array.isArray(parsed.signatures) ? parsed.signatures : []), ...already].slice(0, 120);
      await stateRef.set({ recentSignatures: merged, updated_date: new Date().toISOString() }, { merge: true });
    }
  } catch { /* ignore */ }

  return { subject: parsed.subject, text: renderSmartText(parsed, link), html: renderSmartHtml(parsed, link) };
}

export async function sendBriefingEmail(db, slot) {
  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!to || !host || !user || !pass) return false;
  // Smart, personalised briefing first; fall back to the static agenda email.
  let payload = null;
  try { payload = await composeSmartBriefing(db, slot); } catch { payload = null; }
  if (!payload) {
    let agenda = { overdue: [], dueToday: [], commitments: [] };
    try { agenda = await gatherAgenda(db); } catch { /* empty */ }
    payload = renderBriefingEmail(slot, agenda);
  }
  const { subject, text, html } = payload;
  try {
    const transport = nodemailer.createTransport({
      host, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user, pass },
    });
    await transport.sendMail({ from: process.env.SMTP_FROM || user, to, subject, text, html });
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
    const slice = body.grades.slice(0, 200);
    const batch = db.batch();
    const drops = [];
    for (const g of slice) {
      const ref = db.collection("grades").doc(safeId(`${uid}_${g.course || ""}_${g.assignment || ""}`));
      const newScore = Number.isFinite(Number(g.score)) ? Number(g.score) : null;
      // Detect a drop vs the previously stored score for this course/assignment.
      if (newScore != null) {
        const prev = await ref.get().catch(() => null);
        const prevScore = prev && prev.exists ? prev.data().score : null;
        if (Number.isFinite(prevScore) && newScore < prevScore - 0.5) {
          drops.push({ course: g.course || "", assignment: g.assignment || null, from: prevScore, to: newScore });
        }
      }
      batch.set(ref, {
        userId: uid, source: "worker",
        course: String(g.course || "").slice(0, 120),
        assignment: g.assignment ? String(g.assignment).slice(0, 160) : null,
        score: newScore,
        max_score: Number.isFinite(Number(g.max ?? g.max_score)) ? Number(g.max ?? g.max_score) : null,
        graded_on: g.graded_on || now.slice(0, 10),
        created_date: now, updated_date: now,
      }, { merge: true });
    }
    await batch.commit();
    result.grades = slice.length;

    // A grade drop → an (unannounced) report so the next briefing flags it out loud.
    if (drops.length) {
      const rb = db.batch();
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const where = d.assignment ? `${d.course} — ${d.assignment}` : d.course;
        rb.set(db.collection("reports").doc(safeId(`${uid}_gradedrop_${now}_${i}`)), {
          userId: uid, source: "Grades",
          title: `Grade drop: ${d.course}`.slice(0, 200),
          summary: `${where} dropped from ${d.from} to ${d.to}.`.slice(0, 1200),
          ok: false, announced: false, occurred_at: now, created_date: now, updated_date: now,
        }, { merge: true });
      }
      await rb.commit();
      result.grade_drops = drops.length;
    }
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
