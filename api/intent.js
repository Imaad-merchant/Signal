// Voice intent router for the Jarvis orb.
//
// Owner-scoped (Firebase ID token). Takes a spoken transcript, returns a concise
// British chief-of-staff reply plus a list of structured actions the client
// executes against the user's own entities. Reuses the callLLM provider
// abstraction (OpenAI now, Anthropic when keyed).
import { verifyAuth } from "./_auth.js";
import { callLLM, parseJSON } from "./_llm.js";

const VALID = ["remind", "log", "monitor", "write", "grade", "ask", "none"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body || {};
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
- { "type": "remind",  "text": string, "due_on": "YYYY-MM-DD" | null }   // a commitment / to-do the user stated
- { "type": "log",     "text": string, "domain": string | null }         // note something that happened / an observation
- { "type": "monitor", "metric": string, "value": number | null, "note": string | null }  // a tracked number/metric
- { "type": "write",   "title": string, "body": string }                 // draft a note/document to the workspace
- { "type": "grade",   "course": string, "assignment": string | null, "score": number, "max": number | null }  // a grade the user pasted/read out

RULES:
- Only create actions the user clearly asked for. If it's just a question or chat, use intent "ask"/"none" with an empty actions array and answer in "reply".
- Never invent obligations the user didn't state.
- Resolve relative dates against today (${today}); use null if no date is implied.
- GRADES: if the user pastes or reads out grades (e.g. "got a 92 on the calculus midterm", or a blob of assignment/score lines), emit one "grade" action per grade. Put a percentage or points in "score", the total in "max" when stated. Use intent "grade" and, in "reply", announce the notable new grade(s) crisply — e.g. "Ninety-two on the calculus midterm — nicely done."
- Keep "reply" short and spoken-aloud friendly — this is read by a voice, so no lists, no markdown, no emoji.`;

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

    const intent = VALID.includes(parsed?.intent) ? parsed.intent : "none";
    const reply = parsed?.reply ? String(parsed.reply) : "Right — noted.";
    let actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    // Normalize + guard each action to a known shape.
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

    return res.status(200).json({ reply, intent, actions });
  } catch (err) {
    console.error("Intent error:", err);
    return res.status(500).json({ error: err.message || "Intent parsing failed" });
  }
}
