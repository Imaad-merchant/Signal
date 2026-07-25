// Consolidated owner-scoped Jarvis endpoint.
//
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions (every
// non-underscore file in /api is one). To stay under it, the Firebase-auth Jarvis
// routes that used to be separate files (checkin, intent, seedDomains, and the
// Google connect/disconnect kickoff) are merged here and dispatched on `body.route`.
// Each route keeps its original request/response shape.
import { verifyAuth } from "./_auth.js";
import { callLLM, parseJSON } from "./_llm.js";
import { buildAuthUrl } from "./google/_client.js";
import { signState } from "./google/_state.js";
import { getAdminDb, isAdminConfigured } from "./_firebaseAdmin.js";

const INTENT_VALID = ["remind", "log", "monitor", "write", "grade", "ask", "none"];

function summarize(value, max = 25) {
  if (Array.isArray(value)) return value.slice(0, max);
  if (value === undefined || value === null) return [];
  return value;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let auth;
  try {
    auth = await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body || {};
  const route = body.route;

  try {
    if (route === "checkin") return await checkin(body, res);
    if (route === "intent") return await intent(body, res);
    if (route === "seed") return await seed(body, res);
    if (route === "google-connect") return await googleConnect(auth, res);
    if (route === "google-disconnect") return await googleDisconnect(auth, res);
    return res.status(400).json({ error: "Unknown route" });
  } catch (err) {
    console.error(`Jarvis route "${route}" error:`, err);
    return res.status(500).json({ error: err.message || "Request failed" });
  }
}

// ---- route: checkin (daily questions + payback) ----
async function checkin(body, res) {
  const action = body.action;
  const slot = body.slot === "evening" ? "evening" : "morning";
  const context = body.context && typeof body.context === "object" ? body.context : {};

  if (action === "questions") {
    const commitments = summarize(context.commitments);
    const today = summarize(context.today ?? context.tasks);
    const memory = summarize(context.memory, 15);
    const domains = summarize(context.domains);

    const slotGuidance =
      slot === "evening"
        ? "This is the EVENING check-in. Reflect on how the day went relative to the morning intentions and commitments. Ask about follow-through, blockers, and what to carry into tomorrow."
        : "This is the MORNING check-in. Draw on open commitments, today's tasks, and recent memory to help the user set intention for the day.";

    const system = `You are Signal's daily check-in coach. Generate at most 3 short, specific, answerable questions.
${slotGuidance}
Each question object: { "id": string (short slug), "text": string, "kind": "reflection"|"planning"|"commitment"|"followup" }.
Never return more than 3 questions. Keep each question to one sentence.
Return JSON: { "questions": [ ... ] }.`;

    const user = `CONTEXT (JSON):
open_commitments: ${JSON.stringify(commitments)}
today_tasks: ${JSON.stringify(today)}
recent_memory: ${JSON.stringify(memory)}
active_domains: ${JSON.stringify(domains)}

Generate the questions now.`;

    const raw = await callLLM({ system, user, json: true });
    const parsed = parseJSON(raw);
    let questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    questions = questions
      .filter((q) => q && (q.text || typeof q === "string"))
      .slice(0, 3)
      .map((q, i) => {
        if (typeof q === "string") return { id: `q${i + 1}`, text: q, kind: "reflection" };
        return { id: String(q.id || `q${i + 1}`), text: String(q.text || ""), kind: String(q.kind || "reflection") };
      });
    return res.status(200).json({ questions });
  }

  if (action === "payback") {
    const answers = summarize(context.answers, 20);
    const memory = summarize(context.memory, 20);
    const domains = summarize(context.domains);
    const newsTopics = summarize(context.news_topics ?? context.newsTopics);

    const hasPersonalSignal =
      (Array.isArray(answers) && answers.length > 0) || (Array.isArray(memory) && memory.length > 0);

    const system = `You are Signal's "payback" engine. After a check-in, you return ONE high-value insight the user gets back for reflecting.
Choose the payback "type" using this STRICT priority order:
  1. "cross_domain" — a non-obvious connection spanning two or more of the user's domains (highest value).
  2. "commitment"   — an insight tied to a specific open commitment or follow-through.
  3. "world"        — a relevant world/news item drawn from the user's active news_topics.
The "world" type must ALWAYS be answerable, even with zero personal data (week-1 cold start): if there is no personal signal, synthesize a concise, genuinely useful world/news item from the active topics using general knowledge. Keep "world" bodies to 1-3 sentences.
Return JSON: { "payback": { "type": "cross_domain"|"commitment"|"world", "title": string, "body": string, "evidence": string (optional) } }.
Prefer higher-priority types only when there is real personal signal to support them; otherwise fall back to "world".`;

    const user = `CONTEXT (JSON):
has_personal_signal: ${hasPersonalSignal}
checkin_answers: ${JSON.stringify(answers)}
recent_memory: ${JSON.stringify(memory)}
active_domains: ${JSON.stringify(domains)}
active_news_topics: ${JSON.stringify(newsTopics)}

Produce exactly one payback object now.`;

    const raw = await callLLM({ system, user, json: true });
    const parsed = parseJSON(raw);
    let payback = parsed && typeof parsed.payback === "object" && parsed.payback ? parsed.payback : null;

    if (!payback || !payback.body) {
      const topicHint = Array.isArray(newsTopics) && newsTopics.length ? newsTopics : ["general"];
      payback = {
        type: "world",
        title: "Something worth knowing",
        body: `Here's a relevant update on ${typeof topicHint[0] === "string" ? topicHint[0] : "your topics"} to keep you oriented today.`,
      };
    }

    const validTypes = ["cross_domain", "commitment", "world"];
    const out = {
      type: validTypes.includes(payback.type) ? payback.type : "world",
      title: String(payback.title || "Payback"),
      body: String(payback.body || ""),
    };
    if (payback.evidence) out.evidence = String(payback.evidence);
    return res.status(200).json({ payback: out });
  }

  return res.status(400).json({ error: "Unknown action (expected 'questions' or 'payback')" });
}

// ---- route: intent (voice command → reply + actions) ----
async function intent(body, res) {
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) return res.status(400).json({ error: "Transcript required" });
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const today = context.today || new Date().toISOString().slice(0, 10);

  const system = `You are Signal — a sharp, warm, unflappable British chief of staff. You speak in clear, concise British English: direct, dry, never fawning, never verbose. You turn what the user says into actions and reply as if briefing a busy principal.

Return JSON only (no markdown):
{
  "reply": string,        // one or two crisp spoken sentences, British tone
  "intent": "remind" | "log" | "monitor" | "write" | "grade" | "ask" | "none",
  "actions": [ ... ]      // zero or more of the actions below
}

ACTION TYPES:
- { "type": "remind",  "text": string, "due_on": "YYYY-MM-DD" | null }
- { "type": "log",     "text": string, "domain": string | null }
- { "type": "monitor", "metric": string, "value": number | null, "note": string | null }
- { "type": "write",   "title": string, "body": string }
- { "type": "grade",   "course": string, "assignment": string | null, "score": number, "max": number | null }

RULES:
- Only create actions the user clearly asked for. If it's just a question or chat, use intent "ask"/"none" with an empty actions array and answer in "reply".
- Never invent obligations the user didn't state.
- Resolve relative dates against today (${today}); use null if no date is implied.
- GRADES: if the user pastes or reads out grades, emit one "grade" action per grade. Put a percentage or points in "score", the total in "max" when stated. Use intent "grade" and announce the notable new grade(s) crisply in "reply".
- Keep "reply" short and spoken-aloud friendly — read by a voice, so no lists, no markdown, no emoji.`;

  const user = `The user said: "${transcript}"

Context (JSON): ${JSON.stringify({
    today,
    open_commitments: Array.isArray(context.commitments) ? context.commitments.slice(0, 25) : [],
    today_tasks: Array.isArray(context.tasks) ? context.tasks.slice(0, 25) : [],
    domains: Array.isArray(context.domains) ? context.domains : [],
  }).slice(0, 3500)}

Parse it now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);

  const intentType = INTENT_VALID.includes(parsed?.intent) ? parsed.intent : "none";
  const reply = parsed?.reply ? String(parsed.reply) : "Right — noted.";
  let actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  actions = actions
    .filter((a) => a && typeof a === "object")
    .map((a) => {
      const type = a.type;
      if (type === "remind") return { type, text: String(a.text || ""), due_on: a.due_on || null };
      if (type === "log") return { type, text: String(a.text || ""), domain: a.domain || null };
      if (type === "monitor") return { type, metric: String(a.metric || ""), value: Number.isFinite(a.value) ? a.value : null, note: a.note || null };
      if (type === "write") return { type, title: String(a.title || "Note"), body: String(a.body || "") };
      if (type === "grade") return {
        type,
        course: String(a.course || "").slice(0, 120),
        assignment: a.assignment ? String(a.assignment).slice(0, 160) : null,
        score: Number.isFinite(a.score) ? a.score : (Number.isFinite(Number(a.score)) ? Number(a.score) : null),
        max: Number.isFinite(a.max) ? a.max : (Number.isFinite(Number(a.max)) ? Number(a.max) : null),
      };
      return null;
    })
    .filter((a) => a && (a.text || a.title || a.metric || (a.type === "grade" && a.score != null)));

  return res.status(200).json({ reply, intent: intentType, actions });
}

// ---- route: seed (cluster tasks into candidate domains) ----
const DEFAULT_DOMAINS = [
  { key: "work", label: "Work", sort_order: 1 },
  { key: "health", label: "Health", sort_order: 2 },
  { key: "learning", label: "Learning", sort_order: 3 },
  { key: "personal", label: "Personal", sort_order: 4 },
  { key: "finance", label: "Finance", sort_order: 5 },
  { key: "social", label: "Social", sort_order: 6 },
];
function slugify(str, fallback) {
  const s = String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s || fallback;
}
async function seed(body, res) {
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (tasks.length === 0) return res.status(200).json({ domains: DEFAULT_DOMAINS });

  const slim = tasks.slice(0, 300).map((t) => ({ title: (t && t.title) || "", category: (t && t.category) || "" }));
  const system = `You cluster a user's tasks into 6-10 broad life/work "domains" (e.g. Work, Health, Learning, Finance, Personal, Social, Side Projects).
Group by category and title theme. Each domain: { "key": short_snake_case_slug, "label": Title Case string, "sort_order": integer starting at 1 }.
Return between 6 and 10 domains. Return JSON: { "domains": [ ... ] }.`;
  const user = `TASKS (JSON array of {title, category}):
${JSON.stringify(slim)}

Cluster them into 6-10 domains now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);
  let domains = Array.isArray(parsed?.domains) ? parsed.domains : [];
  domains = domains
    .filter((d) => d && (d.label || d.key))
    .map((d, i) => ({
      key: slugify(d.key || d.label, `domain_${i + 1}`),
      label: String(d.label || d.key || `Domain ${i + 1}`),
      sort_order: Number.isFinite(d.sort_order) ? d.sort_order : i + 1,
    }));
  if (domains.length < 6) {
    const existingKeys = new Set(domains.map((d) => d.key));
    for (const def of DEFAULT_DOMAINS) {
      if (domains.length >= 6) break;
      if (!existingKeys.has(def.key)) { domains.push({ ...def, sort_order: domains.length + 1 }); existingKeys.add(def.key); }
    }
  }
  if (domains.length > 10) domains = domains.slice(0, 10);
  return res.status(200).json({ domains });
}

// ---- route: google-connect (return the OAuth consent URL) ----
async function googleConnect(auth, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(503).json({ error: "Google not configured on the server (missing GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI)" });
  }
  const state = signState(auth.uid);
  const url = buildAuthUrl({ clientId, redirectUri, state });
  return res.status(200).json({ url });
}

// ---- route: google-disconnect (revoke + delete stored token) ----
async function googleDisconnect(auth, res) {
  if (!isAdminConfigured()) return res.status(503).json({ error: "Server not configured" });
  const db = getAdminDb();
  const ref = db.collection("google_tokens").doc(auth.uid);
  const snap = await ref.get();
  const refreshToken = snap.exists ? snap.data().refresh_token : null;
  if (refreshToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
    } catch { /* ignore */ }
  }
  await ref.delete();
  return res.status(200).json({ disconnected: true });
}
