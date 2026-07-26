// Consolidated owner-scoped Jarvis endpoint.
//
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions (every
// non-underscore file in /api is one). To stay under it, the Firebase-auth Jarvis
// routes that used to be separate files (checkin, intent, seedDomains, and the
// Google connect/disconnect kickoff) are merged here and dispatched on `body.route`.
// Each route keeps its original request/response shape.
import nodemailer from "nodemailer";
import { verifyAuth } from "./_auth.js";
import { callLLM, parseJSON } from "./_llm.js";
import { buildAuthUrl } from "./google/_client.js";
import { signState } from "./google/_state.js";
import { getAdminDb, isAdminConfigured } from "./_firebaseAdmin.js";

const INTENT_VALID = ["remind", "log", "monitor", "write", "grade", "add", "complete", "remove", "email", "research", "ask", "none"];

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
    if (route === "nudge") return await nudge(body, res);
    if (route === "briefing") return await briefing(body, res);
    if (route === "research") return await research(body, res);
    if (route === "push-subscribe") return await pushSubscribe(auth, body, res);
    if (route === "send-email") return await sendEmail(body, res);
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

  const system = `You are Signal — a sharp, warm, unflappable British chief of staff. Your whole job: the principal talks to you freely (rambling, thinking aloud), and you ORGANISE it — turning loose speech into the right structured items — and you ANSWER questions about their world from the context provided. You speak clear, concise British English: direct, dry, never fawning, never verbose.

Return JSON only (no markdown):
{
  "reply": string,        // 1-2 crisp spoken sentences, British tone; may end with ONE short follow-up question to keep things moving
  "intent": string,       // best single label from the action types, or "ask"/"none"
  "actions": [ ... ]      // zero or more of the actions below — extract EVERY distinct item from what they said
}

ACTION TYPES:
- { "type": "add",     "list": string, "text": string }                  // add an item to a named to-do LIST (e.g. list "Business", text "hire a designer")
- { "type": "complete","list": string | null, "text": string }          // mark a list item done (match by its wording)
- { "type": "remove",  "list": string | null, "text": string }          // remove a list item
- { "type": "remind",  "text": string, "due_on": "YYYY-MM-DD" | null }   // a time-bound commitment / to-do
- { "type": "log",     "text": string, "domain": string | null }         // capture a thought/observation worth remembering
- { "type": "monitor", "metric": string, "value": number | null, "note": string | null }
- { "type": "write",   "title": string, "body": string }                 // draft a note/document
- { "type": "grade",   "course": string, "assignment": string | null, "score": number, "max": number | null }
- { "type": "email",   "to": string | null, "subject": string, "body": string }  // DRAFT an email (never sent automatically — the user confirms & sends)
- { "type": "research", "query": string }                                 // look something up ON THE WEB (current services, schedules, hours, prices, news)

RULES:
- ORGANISE RAMBLING: a single message can contain several items — emit one action per distinct thing. "I need to hire a designer, order cards, and remember I liked that pricing idea" → two "add" (list "Business") + one "log".
- LISTS: when the user talks about a project/list ("my business list", "for the app"), use add/complete/remove with that list name. Default the list to "Business" only if they clearly mean their main venture and name none.
- QUESTIONS: if they're ASKING (what's on next week, what's in my inbox, what's on my business list, how am I doing), set intent "ask", leave actions empty, and ANSWER concisely in "reply" from the context. Use upcoming_calendar for schedule questions, recent_emails for inbox, lists/commitments for to-dos.
- If the context needed to answer is empty (e.g. no upcoming_calendar or recent_emails), say so briefly and note they can connect Google — don't invent events or emails.
- Never invent obligations the user didn't state. Resolve relative dates against today (${today}); null if none implied.
- GRADES: emit one "grade" per grade read out; put the score in "score", total in "max" when stated.
- EMAIL: if they ask to email/message someone, emit an "email" action — write a clear subject and a complete, well-phrased body in their voice. Put a real address in "to" only if they gave one; otherwise null (they'll fill it). Say in "reply" that you've drafted it for them to review and send — it is NOT sent automatically.
- RESEARCH: if they ask you to look something up / find CURRENT external info you can't know from their data (available services, schedules, opening hours, prices, news, "what tutoring does UH offer"), emit ONE "research" action with a focused, specific web-search query (fold in the specifics they mentioned — school, classes, professor). In "reply" just say you'll look it up. Do NOT invent the facts yourself.
- "reply" is READ ALOUD: no lists, no markdown, no emoji. Keep it short; a brief follow-up question is welcome when it helps them keep momentum.`;

  const user = `The user said: "${transcript}"

Context (JSON): ${JSON.stringify({
    today,
    open_commitments: Array.isArray(context.commitments) ? context.commitments.slice(0, 25) : [],
    today_tasks: Array.isArray(context.tasks) ? context.tasks.slice(0, 25) : [],
    lists: Array.isArray(context.lists) ? context.lists.slice(0, 12) : [],
    upcoming_calendar: Array.isArray(context.calendar) ? context.calendar.slice(0, 30) : [],
    recent_emails: Array.isArray(context.emails) ? context.emails.slice(0, 15) : [],
    domains: Array.isArray(context.domains) ? context.domains : [],
  }).slice(0, 6000)}

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
      if (type === "add") return { type, list: String(a.list || "Business").slice(0, 80), text: String(a.text || "").slice(0, 300) };
      if (type === "complete") return { type, list: a.list ? String(a.list).slice(0, 80) : null, text: String(a.text || "").slice(0, 300) };
      if (type === "remove") return { type, list: a.list ? String(a.list).slice(0, 80) : null, text: String(a.text || "").slice(0, 300) };
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
      if (type === "email") return {
        type,
        to: a.to ? String(a.to).slice(0, 200) : null,
        subject: String(a.subject || "").slice(0, 200),
        body: String(a.body || "").slice(0, 5000),
      };
      if (type === "research") return { type, query: String(a.query || "").slice(0, 400) };
      return null;
    })
    .filter((a) => a && (a.text || a.title || a.metric || a.query || (a.type === "grade" && a.score != null) || (a.type === "email" && a.body)));

  return res.status(200).json({ reply, intent: intentType, actions });
}

// ---- route: nudge (a short proactive question about an open item) ----
async function nudge(body, res) {
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const today = context.today || new Date().toISOString().slice(0, 10);

  const system = `You are Signal, a British chief of staff. Based on the principal's OPEN items, produce ONE short spoken check-in — a single friendly question or prompt to nudge them on something that's open or stale. Pick the most useful thing to ask about (an open list item, an aging commitment, something due). Warm, dry, British, ONE sentence, read aloud (no markdown/emoji/lists).
Return JSON: { "say": string, "about": string }  // "about" = short tag of what it concerns.`;

  const user = `today: ${today}
open_commitments: ${JSON.stringify(Array.isArray(context.commitments) ? context.commitments.slice(0, 20) : [])}
lists: ${JSON.stringify(Array.isArray(context.lists) ? context.lists.slice(0, 12) : [])}
today_tasks: ${JSON.stringify(Array.isArray(context.tasks) ? context.tasks.slice(0, 20) : [])}

Give me one nudge now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);
  const say = parsed?.say ? String(parsed.say) : "";
  const about = parsed?.about ? String(parsed.about) : "";
  return res.status(200).json({ say, about });
}

// ---- route: briefing (spoken morning look-ahead / evening reflection) ----
async function briefing(body, res) {
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const slot = body.slot === "evening" ? "evening" : "morning";
  const today = context.today || new Date().toISOString().slice(0, 10);

  const system =
    slot === "morning"
      ? `You are Signal, a warm, dry British chief of staff giving a SPOKEN good-morning briefing. In 2-4 short sentences: greet briefly, tell the principal what's on today (events, things due, key commitments), and flag anything that looks important so they don't forget it. Encouraging, never naggy. Read aloud — no lists, markdown or emoji. If there's genuinely nothing on, say the day's clear.
Return JSON: { "say": string }.`
      : `You are Signal, a warm, dry British chief of staff opening the EVENING review. In 1-3 short spoken sentences: acknowledge the day, celebrate any habit streak you're told about, and gently set up the check-in (habits + anything left unchecked today). Kind and human, never preachy. Read aloud — no lists, markdown or emoji.
Return JSON: { "say": string }.`;

  const user = `slot: ${slot}
today: ${today}
due_today: ${JSON.stringify(Array.isArray(context.due_today) ? context.due_today.slice(0, 15) : [])}
events: ${JSON.stringify(Array.isArray(context.events) ? context.events.slice(0, 15) : [])}
commitments: ${JSON.stringify(Array.isArray(context.commitments) ? context.commitments.slice(0, 15) : [])}
important: ${JSON.stringify(Array.isArray(context.important) ? context.important.slice(0, 10) : [])}
streaks: ${JSON.stringify(Array.isArray(context.streaks) ? context.streaks.slice(0, 10) : [])}
still_unchecked: ${JSON.stringify(Array.isArray(context.incomplete) ? context.incomplete.slice(0, 15) : [])}

Give me the spoken briefing now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);
  const say = parsed?.say ? String(parsed.say) : (slot === "morning" ? "Good morning. Your day looks clear so far." : "Evening. Let's run through your day.");
  return res.status(200).json({ say });
}

// ---- route: research (web search via Tavily → concise synthesized answer + sources) ----
async function research(body, res) {
  const query = String(body.query || "").trim();
  if (!query) return res.status(400).json({ error: "Query required" });

  const key = process.env.TAVILY_API_KEY;
  let results = [];
  if (key) {
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, query, max_results: 6, search_depth: "advanced", include_answer: false }),
      });
      if (r.ok) {
        const d = await r.json();
        results = Array.isArray(d.results) ? d.results : [];
      }
    } catch { /* fall through to knowledge-only */ }
  }

  const sources = results.slice(0, 6).map((x) => ({ title: String(x.title || "").slice(0, 200), url: String(x.url || "") }));
  const findings = results
    .map((x, i) => `[${i + 1}] ${x.title}\n${String(x.content || "").slice(0, 700)}\n${x.url}`)
    .join("\n\n")
    .slice(0, 7000);

  const system = `You are Signal, a British chief of staff doing quick research for the principal. Answer their question directly and concisely from the search findings — the specifics they need (what's available, days/times, whether it covers their classes, office hours). Spoken-friendly, no markdown or emoji, at most a few short sentences. If the findings don't cover part of it, say what's still unknown and where to check.${key ? "" : " NOTE: live web search is NOT configured, so answer only from general knowledge, keep it high-level, and clearly tell them to verify the current details on the official site."}
Return JSON: { "answer": string }.`;
  const user = `Question: ${query}

${key ? "Search findings:\n" + findings : "(no live search results available)"}

Answer now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);
  const answer = parsed?.answer ? String(parsed.answer) : "I couldn't pull that together just now.";
  return res.status(200).json({ answer, sources, live: !!key });
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

// ---- route: push-subscribe (store this browser's Web Push subscription) ----
async function pushSubscribe(auth, body, res) {
  const sub = body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "subscription required" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Server not configured" });
  const db = getAdminDb();
  // Deterministic id from the endpoint so re-subscribing updates in place.
  const id = Buffer.from(sub.endpoint).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 200);
  await db.collection("push_subscriptions").doc(id).set(
    { userId: auth.uid, subscription: sub, updated_date: new Date().toISOString() },
    { merge: true }
  );
  return res.status(200).json({ subscribed: true });
}

// ---- route: send-email (the user reviewed the draft and pressed Send) ----
async function sendEmail(body, res) {
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").trim();
  const text = String(body.body || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: "A valid recipient email is required" });
  if (!text) return res.status(400).json({ error: "Email body is required" });

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass) {
    return res.status(503).json({ error: "Email sending not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS)" });
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user, pass },
  });
  try {
    const info = await transport.sendMail({ from, to, subject: subject || "(no subject)", text });
    return res.status(200).json({ sent: true, id: info?.messageId || "" });
  } catch (err) {
    console.error("send-email error:", err);
    return res.status(502).json({ error: err.message || "Send failed" });
  }
}
