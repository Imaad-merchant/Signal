// Consolidated owner-scoped Jarvis endpoint.
//
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions (every
// non-underscore file in /api is one). To stay under it, the Firebase-auth Jarvis
// routes that used to be separate files (checkin, intent, seedDomains, and the
// Google connect/disconnect kickoff) are merged here and dispatched on `body.route`.
// Each route keeps its original request/response shape.
import { verifyAuth } from "./_auth.js";
import { callLLM, parseJSON, embed, cosine } from "./_llm.js";
import { buildAuthUrl, refreshAccessToken, searchMail, searchDrive, exportFileText, insertEvent, patchEvent, deleteEvent } from "./google/_client.js";
import { syncCalendarForUser } from "./google/_sync.js";
import { plaidConfigured, plaidFetch, plaidId, syncPlaidItem } from "./plaid/_client.js";

// Larger body limit so the voice-recorder can POST base64 audio for transcription.
export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };
import { signState } from "./google/_state.js";
import { getAdminDb, isAdminConfigured } from "./_firebaseAdmin.js";

const INTENT_VALID = ["remind", "log", "monitor", "write", "grade", "add", "complete", "remove", "email", "research", "ask", "none"];

function summarize(value, max = 25) {
  if (Array.isArray(value)) return value.slice(0, max);
  if (value === undefined || value === null) return [];
  return value;
}

// Build a persona directive from the user's "Customize Donna" prefs (body.prefs),
// prepended to Donna's spoken prompts so her name/tone/verbosity/accent are honoured.
function personaLine(prefs) {
  const p = (prefs && prefs.persona) || {};
  const name = String(p.name || "Donna").slice(0, 40);
  const tone = ["warm", "blunt", "playful", "formal"].includes(p.tone) ? p.tone : "warm";
  const verbosity = ["brief", "balanced", "detailed"].includes(p.verbosity) ? p.verbosity : "balanced";
  const address = p.address ? ` Address the principal as "${String(p.address).slice(0, 40)}".` : "";
  const toneWord = { warm: "warm and encouraging", blunt: "blunt and direct — no fluff or flattery", playful: "playful, dry and witty", formal: "formal and professional" }[tone];
  const lenWord = { brief: "Keep spoken replies very short — one sentence where you can.", balanced: "Keep spoken replies concise.", detailed: "You may add a little more useful detail." }[verbosity];
  const brit = p.british === false ? "Use natural neutral English." : "Use British English.";
  return `PERSONA (obey over any conflicting style below): You are ${name}.${address} Be ${toneWord}. ${lenWord} ${brit}`;
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
    if (route === "cleanup") return await cleanup(body, res);
    if (route === "log") return await logEntry(body, res);
    if (route === "capture") return await capture(auth, body, res);
    if (route === "semantic-search") return await semanticSearch(auth, body, res);
    if (route === "command") return await command(auth, body, res);
    if (route === "push-subscribe") return await pushSubscribe(auth, body, res);
    if (route === "send-email") return await sendEmail(body, res);
    if (route === "seed") return await seed(body, res);
    if (route === "google-connect") return await googleConnect(auth, res);
    if (route === "google-disconnect") return await googleDisconnect(auth, res);
    if (route === "google") return await googleRead(auth, body, res);
    if (route === "plaid-link-token") return await plaidLinkToken(auth, res);
    if (route === "plaid-exchange") return await plaidExchange(auth, body, res);
    if (route === "plaid-sync") return await plaidSync(auth, res);
    if (route === "tts") return await ttsSpeak(auth, body, res);
    if (route === "transcribe") return await transcribe(auth, body, res);
    if (route === "gcal-push") return await gcalPush(auth, body, res);
    if (route === "gcal-delete") return await gcalDelete(auth, body, res);
    if (route === "gcal-sync") return await gcalSync(auth, res);
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
    // User-authored questions (from "Customize Donna") come first, verbatim.
    const custom = (Array.isArray(body.customQuestions) ? body.customQuestions : [])
      .filter((q) => q && q.text)
      .slice(0, 4)
      .map((q, i) => ({ id: String(q.id || `cq${i + 1}`), text: String(q.text).slice(0, 200), kind: "custom" }));
    const target = 3;
    const remaining = Math.max(0, target - custom.length);
    if (remaining === 0) return res.status(200).json({ questions: custom.slice(0, 4) });

    const commitments = summarize(context.commitments);
    const today = summarize(context.today ?? context.tasks);
    const memory = summarize(context.memory, 15);
    const domains = summarize(context.domains);

    const slotGuidance =
      slot === "evening"
        ? "This is the EVENING check-in. Reflect on how the day went relative to the morning intentions and commitments. Ask about follow-through, blockers, and what to carry into tomorrow."
        : "This is the MORNING check-in. Draw on open commitments, today's tasks, and recent memory to help the user set intention for the day.";

    const system = `${personaLine(body.prefs)}
You are running the daily check-in. Generate at most ${remaining} short, specific, answerable questions. Do NOT repeat any of the user's already_asked questions.
${slotGuidance}
Each question object: { "id": string (short slug), "text": string, "kind": "reflection"|"planning"|"commitment"|"followup" }.
Never return more than ${remaining} questions. Keep each question to one sentence.
Return JSON: { "questions": [ ... ] }.`;

    const user = `CONTEXT (JSON):
already_asked: ${JSON.stringify(custom.map((q) => q.text))}
open_commitments: ${JSON.stringify(commitments)}
today_tasks: ${JSON.stringify(today)}
recent_memory: ${JSON.stringify(memory)}
active_domains: ${JSON.stringify(domains)}

Generate the questions now.`;

    const raw = await callLLM({ system, user, json: true });
    const parsed = parseJSON(raw);
    const ai = (Array.isArray(parsed?.questions) ? parsed.questions : [])
      .filter((q) => q && (q.text || typeof q === "string"))
      .slice(0, remaining)
      .map((q, i) => {
        if (typeof q === "string") return { id: `q${i + 1}`, text: q, kind: "reflection" };
        return { id: String(q.id || `q${i + 1}`), text: String(q.text || ""), kind: String(q.kind || "reflection") };
      });
    return res.status(200).json({ questions: [...custom, ...ai].slice(0, 4) });
  }

  if (action === "payback") {
    const answers = summarize(context.answers, 20);
    const memory = summarize(context.memory, 20);
    const domains = summarize(context.domains);
    const newsTopics = summarize(context.news_topics ?? context.newsTopics);

    const hasPersonalSignal =
      (Array.isArray(answers) && answers.length > 0) || (Array.isArray(memory) && memory.length > 0);

    const system = `You are Donna's "payback" engine. After a check-in, you return ONE high-value insight the user gets back for reflecting.
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

  const system = `${personaLine(body.prefs)}
You are a sharp, unflappable chief of staff. Your whole job: the principal talks to you freely (rambling, thinking aloud), and you ORGANISE it — turning loose speech into the right structured items — and you ANSWER questions about their world from the context provided. You speak clear, concise British English: direct, dry, never fawning, never verbose.

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
- { "type": "log",     "text": string, "log": string | null, "domain": string | null }  // append to a running LOG document; "log" is the named log if they say one (e.g. "in my workouts log"), else null for the default journal
- { "type": "monitor", "metric": string, "value": number | null, "note": string | null }
- { "type": "write",   "title": string, "body": string }                 // draft a note/document
- { "type": "grade",   "course": string, "assignment": string | null, "score": number, "max": number | null }
- { "type": "email",   "to": string | null, "subject": string, "body": string }  // DRAFT an email (never sent automatically — the user confirms & sends)
- { "type": "research", "query": string }                                 // look something up ON THE WEB (current services, schedules, hours, prices, news)

RULES:
- ORGANISE RAMBLING: a single message can contain several items — emit one action per distinct thing. "I need to hire a designer, order cards, and remember I liked that pricing idea" → two "add" (list "Business") + one "log".
- LISTS: when the user talks about a project/list ("my business list", "for the app"), use add/complete/remove with that list name. Default the list to "Business" only if they clearly mean their main venture and name none.
- QUESTIONS: if they're ASKING (what's on next week, what's in my inbox, what's on my business list, how am I doing, how are my grades / is my grade still good), set intent "ask", leave actions empty, and ANSWER concisely in "reply" from the context. Use upcoming_calendar for schedule questions, recent_emails for inbox, lists/commitments for to-dos, and grades for anything about school marks/classes/assignments.
- RECALL: when they ask what they noted / logged / journaled / captured (recently or "the other day"), answer from "recent_notes" — name the note and summarise its gist. If nothing matches, say you don't see it in their recent notes.
- GRADE QUESTIONS: when they ask about grades, answer from the "grades" context — name the course and score, and if a grade recently dropped or an assignment is missing, say so plainly. If grades is empty, say you don't have their latest yet and they can have their school check run.
- If the context needed to answer is empty (e.g. no upcoming_calendar or recent_emails), say so briefly and note they can connect Google — don't invent events or emails.
- Never invent obligations the user didn't state. Resolve relative dates against today (${today}); null if none implied.
- GRADES: emit one "grade" per grade read out; put the score in "score", total in "max" when stated.
- LOG: when they want to record/journal something ("log that …", "log in my workouts that …", "add to my journal …"), emit ONE "log" action with the observation in "text"; if they name a specific log ("my workouts log", "the volunteering log"), put that name in "log", else leave "log" null.
- EMAIL: if they ask to email/message someone, emit an "email" action — write a clear subject and a complete, well-phrased body in their voice. Put a real address in "to" only if they gave one; otherwise null (they'll fill it). Say in "reply" that you've drafted it for them to review and send — it is NOT sent automatically.
- RESEARCH: if they ask you to look something up / find CURRENT external info you can't know from their data (available services, schedules, opening hours, prices, news, "what tutoring does UH offer"), emit ONE "research" action with a focused, specific web-search query (fold in the specifics they mentioned — school, classes, professor). In "reply" just say you'll look it up. Do NOT invent the facts yourself.
- "reply" is READ ALOUD: no lists, no markdown, no emoji. Keep it short; a brief follow-up question is welcome when it helps them keep momentum.
- CONTINUITY: "Conversation so far" (when present) is the recent back-and-forth. If your previous turn asked a follow-up question and the user now gives a SHORT answer (yes / no / sure / nah / a bare date or value), interpret it IN THAT CONTEXT — never reply "can you clarify". If they DECLINE your follow-up ("no", "that's fine", "leave it"), the item you already created stands: acknowledge briefly (e.g. "Right — no deadline then.") and emit NO actions (don't recreate it). If they ACCEPT/answer (e.g. "yes, tomorrow"), emit the action their answer implies (e.g. a "remind" with the date) for that same item.`;

  const history = Array.isArray(body.history) ? body.history : [];
  const convo = history
    .slice(-8)
    .filter((h) => h && h.text)
    .map((h) => `${h.who === "assistant" ? "You (Donna)" : "User"}: ${String(h.text).slice(0, 300)}`)
    .join("\n");

  const user = `${convo ? `Conversation so far:\n${convo}\n\n` : ""}The user said: "${transcript}"

Context (JSON): ${JSON.stringify({
    today,
    open_commitments: Array.isArray(context.commitments) ? context.commitments.slice(0, 25) : [],
    today_tasks: Array.isArray(context.tasks) ? context.tasks.slice(0, 25) : [],
    lists: Array.isArray(context.lists) ? context.lists.slice(0, 12) : [],
    upcoming_calendar: Array.isArray(context.calendar) ? context.calendar.slice(0, 30) : [],
    recent_emails: Array.isArray(context.emails) ? context.emails.slice(0, 15) : [],
    recent_notes: Array.isArray(context.recent_notes) ? context.recent_notes.slice(0, 20) : [],
    grades: Array.isArray(context.grades) ? context.grades.slice(0, 40) : [],
    domains: Array.isArray(context.domains) ? context.domains : [],
  }).slice(0, 7000)}

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
      if (type === "log") return { type, text: String(a.text || ""), log: a.log ? String(a.log).slice(0, 80) : null, domain: a.domain || null };
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

  const system = `${personaLine(body.prefs)}
Based on the principal's OPEN items, produce ONE short spoken check-in — a single question or prompt to nudge them on something open or stale. Pick the most useful thing (an open list item, an aging commitment, something due). ONE sentence, read aloud (no markdown/emoji/lists).
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
      ? `${personaLine(body.prefs)}
You are giving a SPOKEN good-morning briefing. In 2-5 short sentences: greet briefly, tell the principal what's on today (events, things due, key commitments), and flag anything important. If "automations" is non-empty, give a quick spoken rundown of what their automations found or did overnight — mention them by name and the gist, and note any that failed. If "remind_grades" is true, end with ONE short clause nudging them to run their grade check. Read aloud — no lists, markdown or emoji. If there's genuinely nothing on, say the day's clear.
Return JSON: { "say": string }.`
      : `${personaLine(body.prefs)}
You are opening the EVENING review. In 2-4 short spoken sentences: acknowledge the day, celebrate any habit streak you're told about, and — if "automations" is non-empty — briefly recap what their automations did today (by name, the gist, and flag any failures). If "remind_grades" is true, add ONE short clause nudging them to check their grades. Then gently set up the check-in (habits + anything left unchecked). Read aloud — no lists, markdown or emoji.
Return JSON: { "say": string }.`;

  const user = `slot: ${slot}
today: ${today}
due_today: ${JSON.stringify(Array.isArray(context.due_today) ? context.due_today.slice(0, 15) : [])}
events: ${JSON.stringify(Array.isArray(context.events) ? context.events.slice(0, 15) : [])}
commitments: ${JSON.stringify(Array.isArray(context.commitments) ? context.commitments.slice(0, 15) : [])}
important: ${JSON.stringify(Array.isArray(context.important) ? context.important.slice(0, 10) : [])}
streaks: ${JSON.stringify(Array.isArray(context.streaks) ? context.streaks.slice(0, 10) : [])}
still_unchecked: ${JSON.stringify(Array.isArray(context.incomplete) ? context.incomplete.slice(0, 15) : [])}
automations: ${JSON.stringify(Array.isArray(context.automations) ? context.automations.slice(0, 12) : [])}
remind_grades: ${context.remind_grades ? "true" : "false"}

Give me the spoken briefing now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);
  const say = parsed?.say ? String(parsed.say) : (slot === "morning" ? "Good morning. Your day looks clear so far." : "Evening. Let's run through your day.");
  return res.status(200).json({ say });
}

// ---- route: cleanup (a messy brain-dump → a clean, organised note) ----
async function cleanup(body, res) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Text required" });

  const system = `You are Donna. Turn the principal's messy, rambling brain-dump into a clean, organised note. Give it a short title, then tight, actionable bullet points grouped under a few headings where it helps. Preserve their meaning and any concrete to-dos; cut filler, repetition and tangents. Markdown only — no preamble.
Return JSON: { "title": string, "content": string /* markdown */, "spoken": string /* one short spoken confirmation */ }`;
  const user = `Brain dump:
"""
${text.slice(0, 8000)}
"""

Organise it now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);
  return res.status(200).json({
    title: parsed?.title ? String(parsed.title).slice(0, 160) : "Note",
    content: parsed?.content ? String(parsed.content) : "",
    spoken: parsed?.spoken ? String(parsed.spoken) : "Sorted — saved to your notes.",
  });
}

// ---- route: log (tidy a spoken log entry to one condensed line + smart-route it to
//      an existing log or suggest a new one). `log` (when named by the user) forces the
//      target and skips routing. `existingLogs` = [{ name, summary }]. ----
async function logEntry(body, res) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Text required" });
  const forced = typeof body.log === "string" && body.log.trim() ? body.log.trim().slice(0, 80) : null;
  const existing = Array.isArray(body.existingLogs)
    ? body.existingLogs.filter((l) => l && l.name).slice(0, 40).map((l) => ({
        name: String(l.name).slice(0, 80),
        summary: String(l.summary || "").slice(0, 200),
      }))
    : [];

  const system = `You are Donna, filing a spoken LOG entry for the principal.
1) Rewrite the entry as ONE terse, information-dense line: keep facts, numbers, names, dates, links; drop filler, hedging, "um/like/you know". No leading bullet or date — just the content. British tone, telegraphic is fine.
2) Decide where it belongs. If a "forced" log name is given, use it. Otherwise look at the existing logs: if the entry clearly belongs to one, set targetLog to that EXACT existing name with a confidence 0-1; if it's a new topic, set targetLog null and propose a short Title-Case suggestedNewName (1-3 words, e.g. "Volunteering", "Book Ideas").
Return JSON: { "line": string, "targetLog": string|null, "confidence": number, "suggestedNewName": string }`;

  const user = `entry: """${text.slice(0, 2000)}"""
forced_log: ${forced ? JSON.stringify(forced) : "null"}
existing_logs: ${JSON.stringify(existing)}

File it now.`;

  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw) || {};
  const line = parsed.line ? String(parsed.line).replace(/^[-*]\s*/, "").slice(0, 400) : text.slice(0, 400);
  let targetLog = forced || (parsed.targetLog ? String(parsed.targetLog).slice(0, 80) : null);
  // Only accept a matched existing log if it really exists (guard LLM drift).
  if (!forced && targetLog && !existing.some((l) => l.name.toLowerCase() === targetLog.toLowerCase())) {
    targetLog = null;
  }
  const confidence = forced ? 1 : (Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0);
  const suggestedNewName = parsed.suggestedNewName ? String(parsed.suggestedNewName).slice(0, 80) : "";
  return res.status(200).json({ line, targetLog, confidence, suggestedNewName });
}

// ---- route: capture (categorise an idea → queue for Obsidian + flag duplicates) ----
async function capture(auth, body, res) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Text required" });

  const system = `You are Donna. Categorise the principal's idea/note into ONE bucket and tidy it up.
Buckets: "SaaS Idea", "Marketing Tactic", "Research", "Task", "Note".
Return JSON: { "bucket": one of those, "title": short string, "content": markdown (a tight, slightly expanded version), "spoken": one short British confirmation }`;
  const user = `Idea:
"""
${text.slice(0, 4000)}
"""

Categorise and tidy it.`;
  const raw = await callLLM({ system, user, json: true });
  const parsed = parseJSON(raw);
  const VALID = ["SaaS Idea", "Marketing Tactic", "Research", "Task", "Note"];
  const bucket = VALID.includes(parsed?.bucket) ? parsed.bucket : "Note";
  const title = parsed?.title ? String(parsed.title).slice(0, 160) : "Idea";
  const content = parsed?.content ? String(parsed.content) : text;
  let spoken = parsed?.spoken ? String(parsed.spoken) : `Filed under ${bucket}.`;

  let duplicate = null;
  try {
    if (isAdminConfigured()) {
      const db = getAdminDb();
      const snap = await db.collection("notes").where("userId", "==", auth.uid).get();
      const terms = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      let best = null, bestScore = 0;
      snap.forEach((d) => {
        const n = d.data();
        const hay = `${n.title || ""} ${n.content || ""}`.toLowerCase();
        let s = 0; for (const t of terms) if (hay.includes(t)) s++;
        if (s > bestScore) { bestScore = s; best = n; }
      });
      if (best && bestScore >= 2) {
        duplicate = { title: best.title, folder: best.folder };
        spoken += ` This is close to your note "${best.title}" — say "merge" to append, or I've filed it as new.`;
      }
      // Queue for the local worker to write into the Obsidian vault.
      await db.collection("note_outbox").add({
        userId: auth.uid, bucket, title, content, status: "pending", created_date: new Date().toISOString(),
      });
    }
  } catch (err) { console.error("capture queue error:", err); }

  return res.status(200).json({ bucket, title, spoken, duplicate });
}

// ---- route: semantic-search (embed the query + candidate notes, cosine rank) ----
async function semanticSearch(auth, body, res) {
  const q = typeof body.query === "string" ? body.query.trim() : "";
  if (!q) return res.status(400).json({ error: "Query required" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Notes not available" });

  const db = getAdminDb();
  const snap = await db.collection("notes").where("userId", "==", auth.uid).get();
  const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!notes.length) return res.status(200).json({ results: [] });

  const terms = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const ranked = notes
    .map((n) => {
      const hay = `${n.title || ""} ${n.content || ""}`.toLowerCase();
      let s = 0; for (const t of terms) if (hay.includes(t)) s++;
      return { n, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.n);
  const pool = ranked.slice(0, 30);

  let results;
  try {
    const vecs = await embed([q, ...pool.map((c) => `${c.title}\n${(c.content || "").slice(0, 1500)}`)]);
    const qv = vecs[0];
    results = pool
      .map((c, i) => ({ title: c.title, folder: c.folder, path: c.path, score: cosine(qv, vecs[i + 1]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    results = pool.slice(0, 5).map((c) => ({ title: c.title, folder: c.folder, path: c.path, score: 0 }));
  }
  return res.status(200).json({ results });
}

// ---- route: command (queue a shell/dev command for the local worker to run) ----
async function command(auth, body, res) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Command required" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Server not configured" });
  const db = getAdminDb();
  const ref = await db.collection("commands").add({
    userId: auth.uid, text, status: "pending", output: "", created_date: new Date().toISOString(),
  });
  return res.status(200).json({ queued: true, id: ref.id });
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

  const system = `You are Donna, a British chief of staff doing quick research for the principal. Answer their question directly and concisely from the search findings — the specifics they need (what's available, days/times, whether it covers their classes, office hours). Spoken-friendly, no markdown or emoji, at most a few short sentences. If the findings don't cover part of it, say what's still unknown and where to check.${key ? "" : " NOTE: live web search is NOT configured, so answer only from general knowledge, keep it high-level, and clearly tell them to verify the current details on the official site."}
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

// Load the owner's Google refresh token and mint a fresh access token, or null.
async function getAccessTokenForUid(uid) {
  if (!isAdminConfigured()) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const snap = await getAdminDb().collection("google_tokens").doc(uid).get();
  const refreshToken = snap.exists ? snap.data().refresh_token : null;
  if (!refreshToken) return null;
  try { return await refreshAccessToken({ clientId, clientSecret, refreshToken }); }
  catch { return null; }
}

// ---- route: google (live, owner-scoped Gmail / Docs / Slides reads for the voice
//      assistant). op = "mail" | "doc" | "slides". Returns a short SPOKEN answer. ----
async function googleRead(auth, body, res) {
  const op = body.op;
  const question = String(body.question || "").slice(0, 500);
  const token = await getAccessTokenForUid(auth.uid);
  if (!token) return res.status(200).json({ spoken: "I can't reach your Google account — try reconnecting it from the Inbox tile.", items: [], link: "" });

  try {
    if (op === "mail") {
      const query = String(body.query || "in:inbox").slice(0, 200);
      const msgs = await searchMail(token, query, 6);
      if (!msgs.length) return res.status(200).json({ spoken: "I didn't find any emails matching that.", items: [], from: "" });
      const system = `You are Donna, a concise British chief of staff answering a SPOKEN question about the principal's email. In 2-4 short sentences answer directly from the messages — who it's from, the subject, the gist, and anything needing action. No markdown, no lists — this is read aloud. Return JSON { "spoken": string }.`;
      const user = `Question: ${question || "What are these emails?"}
Messages: ${JSON.stringify(msgs.map((m) => ({ from: m.from, subject: m.subject, date: m.date, body: (m.body || m.snippet || "").slice(0, 1200) })))}`;
      const parsed = parseJSON(await callLLM({ system, user, json: true }));
      const spoken = parsed?.spoken ? String(parsed.spoken) : `You have ${msgs.length} matching email${msgs.length > 1 ? "s" : ""}.`;
      return res.status(200).json({ spoken, items: msgs.map((m) => ({ subject: m.subject, from: m.from, date: m.date })), from: msgs[0].from });
    }

    if (op === "doc" || op === "slides") {
      const kind = op === "slides" ? "slides" : "doc";
      const files = await searchDrive(token, String(body.query || "").slice(0, 120), kind, 5);
      if (!files.length) return res.status(200).json({ spoken: `I couldn't find a ${op === "slides" ? "slides deck" : "doc"} about that in your Drive.`, link: "" });
      const top = files[0];
      let text = "";
      try { text = await exportFileText(token, top.id); } catch { /* content may be empty/unreadable */ }
      const system = `You are Donna, a concise British chief of staff answering a SPOKEN question about the principal's ${op === "slides" ? "slides deck" : "document"} titled "${top.name}". In 2-5 short sentences, summarise it or answer their question from the content. No markdown or lists — read aloud. Return JSON { "spoken": string }.`;
      const user = `Question: ${question || "What's in this?"}
Title: ${top.name}
Content: ${(text || "(could not read the content)").slice(0, 6000)}`;
      const parsed = parseJSON(await callLLM({ system, user, json: true }));
      const spoken = parsed?.spoken ? String(parsed.spoken) : `I found ${top.name}.`;
      return res.status(200).json({ spoken, title: top.name, link: top.link });
    }

    return res.status(400).json({ error: "Unknown google op" });
  } catch (err) {
    console.error("google route error:", err);
    return res.status(200).json({ spoken: "Something went wrong reading your Google account — it may need reconnecting.", items: [], link: "" });
  }
}

// ---- Server-side TTS (OpenAI) — reliable audio the browser plays via <audio>,
//      sidestepping the flaky Web Speech API. Returns base64 MP3. ----
async function ttsSpeak(auth, body, res) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "TTS not configured (no OPENAI_API_KEY)" });
  const text = String(body.text || "").trim().slice(0, 1200);
  if (!text) return res.status(400).json({ error: "text required" });
  // Map the user's voice prefs to an OpenAI voice. "fable" reads British-ish.
  const voice = body.voice === "male" ? "onyx" : body.british ? "fable" : "nova";
  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", voice, input: text, response_format: "mp3" }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ error: `TTS ${r.status}: ${t.slice(0, 200)}` }); }
    const buf = Buffer.from(await r.arrayBuffer());
    return res.status(200).json({ audio: buf.toString("base64"), mime: "audio/mpeg" });
  } catch (err) {
    return res.status(502).json({ error: err.message || "TTS failed" });
  }
}

// ---- Two-way Google Calendar sync. App events (Tasks with a due_date) push to
//      Google on create/move/delete; a pull sync mirrors Google back into tasks. ----
async function gcalPush(auth, body, res) {
  const accessToken = await getAccessTokenForUid(auth.uid);
  if (!accessToken) return res.status(200).json({ ok: false, error: "no-google" });
  const title = String(body.title || "").trim();
  const date = String(body.date || "").trim();
  if (!title || !date) return res.status(400).json({ error: "title and date required" });
  try {
    if (body.gcalId) { await patchEvent(accessToken, body.gcalId, { title, date }); return res.status(200).json({ ok: true, gcalId: body.gcalId }); }
    const id = await insertEvent(accessToken, { title, date });
    return res.status(200).json({ ok: true, gcalId: id });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message || "Calendar push failed" });
  }
}

async function gcalDelete(auth, body, res) {
  const accessToken = await getAccessTokenForUid(auth.uid);
  if (!accessToken) return res.status(200).json({ ok: false, error: "no-google" });
  if (!body.gcalId) return res.status(400).json({ error: "gcalId required" });
  try { await deleteEvent(accessToken, body.gcalId); return res.status(200).json({ ok: true }); }
  catch (err) { return res.status(502).json({ ok: false, error: err.message || "Calendar delete failed" }); }
}

async function gcalSync(auth, res) {
  if (!isAdminConfigured()) return res.status(503).json({ error: "Server not configured" });
  const r = await syncCalendarForUser(getAdminDb(), auth.uid);
  return res.status(200).json({ ok: !r.error, ...r });
}

// ---- Speech-to-text (OpenAI Whisper) — transcribe a recorded voice memo. ----
async function transcribe(auth, body, res) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "Transcription not configured (no OPENAI_API_KEY)" });
  const b64 = String(body.audio || "");
  if (!b64) return res.status(400).json({ error: "audio required" });
  try {
    const buf = Buffer.from(b64, "base64");
    const form = new FormData();
    form.append("file", new Blob([buf], { type: body.mime || "audio/webm" }), "memo.webm");
    form.append("model", "whisper-1");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ error: `Transcribe ${r.status}: ${t.slice(0, 200)}` }); }
    const data = await r.json();
    return res.status(200).json({ text: data.text || "" });
  } catch (err) {
    return res.status(502).json({ error: err.message || "Transcription failed" });
  }
}

// ---- Plaid: connect banks + sync accounts/transactions into the Money tab. ----
// Access tokens live ONLY in the server-only `plaid_items` collection (Admin SDK).
async function plaidLinkToken(auth, res) {
  if (!plaidConfigured()) return res.status(503).json({ error: "Plaid isn't configured on the server (set PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV)." });
  try {
    const data = await plaidFetch("/link/token/create", {
      user: { client_user_id: auth.uid },
      client_name: "Signal",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    });
    return res.status(200).json({ link_token: data.link_token });
  } catch (err) {
    return res.status(502).json({ error: err.message || "Couldn't start Plaid Link" });
  }
}

async function plaidExchange(auth, body, res) {
  if (!plaidConfigured()) return res.status(503).json({ error: "Plaid not configured" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Server not configured" });
  const publicToken = body.public_token;
  if (!publicToken) return res.status(400).json({ error: "public_token required" });
  try {
    const ex = await plaidFetch("/item/public_token/exchange", { public_token: publicToken });
    const db = getAdminDb();
    const now = new Date().toISOString();
    await db.collection("plaid_items").doc(plaidId(`${auth.uid}_${ex.item_id}`)).set(
      { userId: auth.uid, item_id: ex.item_id, access_token: ex.access_token, cursor: null, created_date: now, updated_date: now },
      { merge: true }
    );
    const summary = await syncPlaidItem(db, auth.uid, ex.item_id, ex.access_token, null);
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error("plaid exchange error:", err);
    return res.status(502).json({ error: err.message || "Couldn't link your bank" });
  }
}

async function plaidSync(auth, res) {
  if (!plaidConfigured()) return res.status(503).json({ error: "Plaid not configured" });
  if (!isAdminConfigured()) return res.status(503).json({ error: "Server not configured" });
  try {
    const db = getAdminDb();
    const snap = await db.collection("plaid_items").where("userId", "==", auth.uid).get();
    let accounts = 0, added = 0, removed = 0;
    for (const doc of snap.docs) {
      const it = doc.data();
      const r = await syncPlaidItem(db, auth.uid, it.item_id, it.access_token, it.cursor || null);
      accounts += r.accounts; added += r.added; removed += r.removed;
    }
    return res.status(200).json({ ok: true, items: snap.size, accounts, added, removed });
  } catch (err) {
    console.error("plaid sync error:", err);
    return res.status(502).json({ error: err.message || "Sync failed" });
  }
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

  // Loaded on demand so the ~every-other request (tts, transcribe, intent…) that
  // never sends email doesn't pay nodemailer's import cost at cold start.
  const { default: nodemailer } = await import("nodemailer");
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
