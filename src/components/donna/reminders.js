// Recurring reminders ("routines") the user teaches Donna by voice or type, e.g.
// "remind me to get up every 30 minutes". Each reminder has a delivery style the
// user picks — speak it out loud, glow the orb, or show it on screen. Stored
// per-device in localStorage (they run while the Donna page is open) and are
// fully editable from the Routines panel.

const KEY = "donna_reminders";

export const DELIVERIES = ["voice", "orb", "text"];

export function deliveryLabel(d) {
  return d === "voice" ? "say it out loud" : d === "orb" ? "glow the orb" : "show it on screen";
}

export function loadReminders() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && r.title) : [];
  } catch {
    return [];
  }
}

export function saveReminders(list) {
  try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch { /* ignore */ }
}

// Deterministic id without Math.random/Date.now dependence at call sites.
export function newId(list) {
  const used = new Set((list || []).map((r) => r.id));
  let i = 1;
  while (used.has(`r${i}`)) i++;
  return `r${i}`;
}

// Pull a delivery preference out of a phrase. Returns 'voice' | 'orb' | 'text' | null.
export function parseDelivery(text) {
  const t = (text || "").toLowerCase();
  if (/\b(out\s*loud|speak|say\s+it|spoken|voice|talk|tell\s+me\s+out|aloud)\b/.test(t)) return "voice";
  if (/\b(orb|glow|glowing|pulse|pulsing|light|flash)\b/.test(t)) return "orb";
  if (/\b(screen|on-?screen|text|banner|show|display|write|caption)\b/.test(t)) return "text";
  return null;
}

// Parse an intent to CREATE a recurring reminder. Returns
// { title, everyMinutes, delivery|null } or null.
export function parseReminderCreate(text) {
  const t = (text || "").trim();
  const m = /\b(?:remind|nudge|prompt)\s+me\s+(?:to\s+|about\s+)?(.+?)\s+every\s+(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?)\b/i.exec(t);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  if (!n) return null;
  const unit = m[3].toLowerCase();
  const everyMinutes = /^h/.test(unit) ? n * 60 : n;
  // Title = what's between "to" and "every"; strip a trailing delivery phrase.
  let title = m[1]
    .replace(/[,.]$/,"")
    .replace(/\s+(and|then|,)?\s*(please\s+)?(say(ing)?\s+it\s+out\s+loud|out\s+loud|aloud|speak(ing)?|by\s+voice|with\s+(a\s+)?voice|on(-|\s)?screen|on\s+the\s+screen|with\s+text|as\s+text|show(ing)?\s+it|glow(ing)?\s+the\s+orb|the\s+orb.*|make\s+the\s+orb.*)$/i, "")
    .trim();
  if (!title) return null;
  if (everyMinutes < 1) return null;
  return { title, everyMinutes, delivery: parseDelivery(t) };
}

// Parse an intent to CANCEL/DELETE a reminder. Returns { title } (title may be "").
export function parseReminderCancel(text) {
  const t = (text || "").trim();
  const m = /\b(stop|cancel|delete|remove|turn\s+off)\s+(the\s+|my\s+)?(reminders?|reminding\s+me|routines?|nudges?)\b\s*(?:to\s+|about\s+|for\s+)?(.*)$/i.exec(t);
  if (!m) return null;
  return { title: (m[4] || "").replace(/[,.]$/,"").trim() };
}

// Best-effort match a spoken title to an existing reminder.
export function matchReminder(list, title) {
  const q = (title || "").toLowerCase().trim();
  if (!Array.isArray(list) || !list.length) return null;
  if (!q) return list.length === 1 ? list[0] : null;
  return (
    list.find((r) => (r.title || "").toLowerCase() === q) ||
    list.find((r) => (r.title || "").toLowerCase().includes(q)) ||
    list.find((r) => q.includes((r.title || "").toLowerCase())) ||
    null
  );
}

export function everyLabel(minutes) {
  const n = Number(minutes) || 0;
  if (n % 60 === 0 && n >= 60) { const h = n / 60; return `every ${h} hour${h > 1 ? "s" : ""}`; }
  return `every ${n} min`;
}
