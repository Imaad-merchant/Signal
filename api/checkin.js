// Provider-abstracted check-in AI route.
//
// Owner-scoped: requires a valid Firebase ID token. Uses callLLM so it runs on the
// already-configured OpenAI key today and auto-upgrades to Anthropic once
// ANTHROPIC_API_KEY is set.
//
// Body: { action, slot, context }
//   action "questions" -> { questions: [{ id, text, kind }] (max 3) }
//   action "payback"   -> { payback: { type, title, body, evidence? } }
import { verifyAuth } from "./_auth.js";
import { callLLM, parseJSON } from "./_llm.js";

// Safely stringify a slice of a context field for prompting.
function summarize(value, max = 25) {
  if (Array.isArray(value)) return value.slice(0, max);
  if (value === undefined || value === null) return [];
  return value;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body || {};
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
      // Normalize and enforce the max-3 guarantee.
      questions = questions
        .filter((q) => q && (q.text || typeof q === "string"))
        .slice(0, 3)
        .map((q, i) => {
          if (typeof q === "string") return { id: `q${i + 1}`, text: q, kind: "reflection" };
          return {
            id: String(q.id || `q${i + 1}`),
            text: String(q.text || ""),
            kind: String(q.kind || "reflection"),
          };
        });

      return res.status(200).json({ questions });
    }

    if (action === "payback") {
      const answers = summarize(context.answers, 20);
      const memory = summarize(context.memory, 20);
      const domains = summarize(context.domains);
      const newsTopics = summarize(context.news_topics ?? context.newsTopics);

      const hasPersonalSignal =
        (Array.isArray(answers) && answers.length > 0) ||
        (Array.isArray(memory) && memory.length > 0);

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

      // Guarantee a well-formed, always-answerable payback (cold-start safe).
      if (!payback || !payback.body) {
        const topicHint = Array.isArray(newsTopics) && newsTopics.length ? newsTopics : ["general"];
        payback = {
          type: "world",
          title: "Something worth knowing",
          body: `Here's a relevant update on ${
            typeof topicHint[0] === "string" ? topicHint[0] : "your topics"
          } to keep you oriented today.`,
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
  } catch (err) {
    console.error("Check-in error:", err);
    return res.status(500).json({ error: err.message || "Check-in failed" });
  }
}
