// "Customize Donna" preferences — one localStorage object driving her persona, voice,
// nudges, and custom check-in questions. Editable from the CustomizeDonnaPanel AND by
// voice (parsers below). A `donna-prefs-change` event lets open screens react live.
// Habits are NOT here — they live in the owner-scoped `habits` Firestore collection and
// are edited in place.

const KEY = "donna_prefs";

export const TONES = ["warm", "blunt", "playful", "formal"];
export const VERBOSITIES = ["brief", "balanced", "detailed"];
export const VOICE_PREFS = ["female", "male", "any"];
export const PROACTIVE = ["often", "sometimes", "rarely"];

export const DEFAULT_PREFS = {
  persona: { name: "Donna", tone: "warm", verbosity: "balanced", british: true },
  voice: { rate: 1.02, prefer: "female" },
  nudges: { gradeNudge: true, briefing: true, proactive: "sometimes", pauseMs: 1500 },
  checkinQuestions: [], // [{ id, text, slot: "morning"|"evening"|"any" }]
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const d = clone(DEFAULT_PREFS);
    return {
      persona: { ...d.persona, ...(raw.persona || {}) },
      voice: { ...d.voice, ...(raw.voice || {}) },
      nudges: { ...d.nudges, ...(raw.nudges || {}) },
      checkinQuestions: Array.isArray(raw.checkinQuestions) ? raw.checkinQuestions.filter((q) => q && q.text) : [],
    };
  } catch {
    return clone(DEFAULT_PREFS);
  }
}

export function savePrefs(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("donna-prefs-change"));
  } catch { /* ignore */ }
}

// Merge a partial patch into a section and persist. section ∈ persona|voice|nudges.
export function patchPrefs(section, patch) {
  const p = loadPrefs();
  p[section] = { ...p[section], ...patch };
  savePrefs(p);
  return p;
}

export function onPrefsChange(fn) {
  const h = () => fn(loadPrefs());
  window.addEventListener("donna-prefs-change", h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener("donna-prefs-change", h);
    window.removeEventListener("storage", h);
  };
}

// The subset the server needs to shape Donna's spoken voice.
export function personaPrefsForServer(prefs) {
  const p = prefs || loadPrefs();
  return { persona: p.persona };
}

// ---- custom check-in questions ----
export function newQuestionId(list) {
  const used = new Set((list || []).map((q) => q.id));
  let i = 1; while (used.has(`cq${i}`)) i++; return `cq${i}`;
}
export function addCheckinQuestion(text, slot = "any") {
  const p = loadPrefs();
  const t = (text || "").trim();
  if (!t) return p;
  p.checkinQuestions = [...p.checkinQuestions, { id: newQuestionId(p.checkinQuestions), text: t.slice(0, 200), slot }];
  savePrefs(p);
  return p;
}
export function removeCheckinQuestion(id) {
  const p = loadPrefs();
  p.checkinQuestions = p.checkinQuestions.filter((q) => q.id !== id);
  savePrefs(p);
  return p;
}
// Fuzzy-remove a question by spoken text; returns the removed question or null.
export function removeCheckinQuestionByText(text) {
  const p = loadPrefs();
  const q = (text || "").toLowerCase().trim();
  if (!q) return null;
  const hit = p.checkinQuestions.find((x) => x.text.toLowerCase().includes(q) || q.includes(x.text.toLowerCase()));
  if (!hit) return null;
  p.checkinQuestions = p.checkinQuestions.filter((x) => x.id !== hit.id);
  savePrefs(p);
  return hit;
}
export function questionsForSlot(prefs, slot) {
  const p = prefs || loadPrefs();
  return (p.checkinQuestions || []).filter((q) => q.slot === "any" || q.slot === slot);
}

// ---- voice-command parsers (return a structured intent, or null) ----

export function parseOpenSettings(text) {
  return /\b(customi[sz]e|set\s*up|open|edit|change)\s+(my\s+|your\s+)?(donna|settings|preferences|persona)\b/i.test(text || "")
    || /\bdonna\s+settings\b/i.test(text || "");
}

// "add a check-in question <X>" / "ask me <X> every morning|evening"
export function parseAddQuestion(text) {
  const t = text || "";
  let m = /\badd\s+(?:a\s+)?(?:check-?in\s+)?question\b[:,]?\s*(.+)$/i.exec(t);
  let slot = "any";
  if (!m) {
    m = /\bask\s+me\s+(.+?)\s+(?:every|each)\s+(morning|evening|night)\b/i.exec(t);
    if (m) slot = /morn/i.test(m[2]) ? "morning" : "evening";
  }
  if (!m) return null;
  let q = m[1].trim().replace(/\s+(every|each)\s+(morning|evening|night)\.?$/i, (mm) => {
    slot = /morn/i.test(mm) ? "morning" : "evening"; return "";
  }).trim();
  if (!q) return null;
  if (!/\?$/.test(q)) q = `${q}?`;
  return { text: q, slot };
}

// "stop asking (me) (about) <X>" / "remove the (check-in) question <X>"
export function parseRemoveQuestion(text) {
  const m = /\b(stop\s+asking(?:\s+me)?(?:\s+about)?|remove\s+(?:the\s+)?(?:check-?in\s+)?question|delete\s+(?:the\s+)?question)\b[:,]?\s*(.*)$/i.exec(text || "");
  if (!m) return null;
  return { text: (m[2] || "").trim() };
}

// "track a habit (called) <X>" / "add (a) habit <X>"
export function parseAddHabit(text) {
  const m = /\b(?:track|add|start\s+tracking|log)\s+(?:a\s+)?habit\s+(?:called\s+|named\s+)?(.+)$/i.exec(text || "");
  if (!m) return null;
  const name = m[1].trim().replace(/[.?!]$/, "");
  return name ? { name } : null;
}
// "stop tracking <X>" / "remove the habit <X>"
export function parseRemoveHabit(text) {
  const m = /\b(?:stop\s+tracking|remove\s+(?:the\s+)?habit|delete\s+(?:the\s+)?habit|no\s+longer\s+track)\b[:,]?\s*(.+)$/i.exec(text || "");
  if (!m) return null;
  const name = m[1].trim().replace(/[.?!]$/, "");
  return name ? { name } : null;
}

// Persona / voice tweaks → a { section, patch } to apply, or null.
export function parsePersonaTweak(text) {
  const t = text || "";
  let m;
  if ((m = /\bcall\s+me\s+([a-z0-9 ._-]{1,30})$/i.exec(t))) {
    // Not a persona *name* change — this is how she addresses YOU; store on persona.address.
    return { section: "persona", patch: { address: m[1].trim().replace(/[.?!]$/, "") } };
  }
  if ((m = /\b(?:your\s+name\s+is|rename\s+you\s+to|call\s+you)\s+([a-z0-9 ._-]{1,30})$/i.exec(t))) {
    return { section: "persona", patch: { name: m[1].trim().replace(/[.?!]$/, "") } };
  }
  if (/\bbe\s+(more\s+)?(blunt|direct|harsh|savage)\b/i.test(t)) return { section: "persona", patch: { tone: "blunt" } };
  if (/\bbe\s+(more\s+)?(warm|kind|nice|gentle|sweet)\b/i.test(t)) return { section: "persona", patch: { tone: "warm" } };
  if (/\bbe\s+(more\s+)?(playful|funny|fun|cheeky)\b/i.test(t)) return { section: "persona", patch: { tone: "playful" } };
  if (/\bbe\s+(more\s+)?(formal|professional|serious)\b/i.test(t)) return { section: "persona", patch: { tone: "formal" } };
  if (/\b(be\s+(more\s+)?(brief|concise|short|terse)|keep\s+it\s+(short|brief))\b/i.test(t)) return { section: "persona", patch: { verbosity: "brief" } };
  if (/\bbe\s+(more\s+)?(detailed|thorough|verbose|descriptive)\b/i.test(t)) return { section: "persona", patch: { verbosity: "detailed" } };
  if (/\b(drop|lose|stop)\s+the\s+british\b/i.test(t)) return { section: "persona", patch: { british: false } };
  if (/\b(be|sound|keep)\s+(more\s+)?british\b/i.test(t)) return { section: "persona", patch: { british: true } };
  if (/\b(talk|speak)\s+(faster|quicker)\b/i.test(t)) return { section: "voice", patch: { rate: Math.min(1.4, (loadPrefs().voice.rate || 1.02) + 0.12) } };
  if (/\b(talk|speak)\s+(slower|more\s+slowly)\b/i.test(t)) return { section: "voice", patch: { rate: Math.max(0.7, (loadPrefs().voice.rate || 1.02) - 0.12) } };
  if (/\b(use\s+a\s+)?(male|man'?s)\s+voice\b/i.test(t)) return { section: "voice", patch: { prefer: "male" } };
  if (/\b(use\s+a\s+)?(female|woman'?s)\s+voice\b/i.test(t)) return { section: "voice", patch: { prefer: "female" } };
  return null;
}

// Nudge toggles → { section:"nudges", patch } or null.
export function parseNudgeTweak(text) {
  const t = text || "";
  if (/\b(stop|don'?t|turn\s+off|no\s+more|disable)\b.*\bgrade[s]?\b/i.test(t) && /\b(nudg|remind|check|ask)/i.test(t)) return { section: "nudges", patch: { gradeNudge: false } };
  if (/\b(start|turn\s+on|enable)\b.*\bgrade[s]?\b/i.test(t) && /\b(nudg|remind|check)/i.test(t)) return { section: "nudges", patch: { gradeNudge: true } };
  if (/\b(turn\s+off|stop|disable|no)\b.*\b(briefing|morning\s+briefing|check-?in)\b/i.test(t)) return { section: "nudges", patch: { briefing: false } };
  if (/\b(turn\s+on|enable|start)\b.*\b(briefing|check-?in)\b/i.test(t)) return { section: "nudges", patch: { briefing: true } };
  if (/\bwait\s+longer\b|\b(give me|take)\s+more\s+time\b|\bdon'?t\s+(cut\s+me\s+off|interrupt)\b/i.test(t)) return { section: "nudges", patch: { pauseMs: Math.min(4000, (loadPrefs().nudges.pauseMs || 1500) + 700) } };
  if (/\b(respond|answer)\s+(faster|quicker|sooner)\b|\bdon'?t\s+wait\s+so\s+long\b/i.test(t)) return { section: "nudges", patch: { pauseMs: Math.max(700, (loadPrefs().nudges.pauseMs || 1500) - 500) } };
  if (/\bbe\s+(more\s+)?proactive\b/i.test(t)) return { section: "nudges", patch: { proactive: "often" } };
  if (/\b(be\s+)?less\s+proactive\b|\bstop\s+bugging\s+me\b|\bleave\s+me\s+alone\b/i.test(t)) return { section: "nudges", patch: { proactive: "rarely" } };
  return null;
}
