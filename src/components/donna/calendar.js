// Voice/text → calendar event parsing for Donna.
//   "add August 4 intake interview to my calendar under a new event Internship"
//     → { title: "intake interview", date: "2026-08-04", category: "Internship" }
// Missing pieces come back null so the caller can ask a clarifying question.
// An event is stored as a Task with a due_date + category; a new category is
// created with an unused colour.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthIndex = (m) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));

// Parse the first date phrase in `text`. Returns { date:"YYYY-MM-DD", text } or null.
export function parseDate(text, now = new Date()) {
  const s = String(text || "");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let m;

  // ISO YYYY-MM-DD
  if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { date: `${m[1]}-${m[2]}-${m[3]}`, text: m[0] };

  // Month name + day  (August 4, Aug 4th, August 4 2027)
  if ((m = s.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, "i")))) {
    const mo = monthIndex(m[1]); const day = +m[2];
    let year = m[3] ? +m[3] : now.getFullYear();
    let d = new Date(year, mo, day);
    if (!m[3] && d < today) d = new Date(year + 1, mo, day); // roll to next year if already past
    return { date: iso(d), text: m[0] };
  }

  // Day + month  (4 August, 4th of August)
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b`, "i")))) {
    const mo = monthIndex(m[2]); const day = +m[1];
    let d = new Date(now.getFullYear(), mo, day);
    if (d < today) d = new Date(now.getFullYear() + 1, mo, day);
    return { date: iso(d), text: m[0] };
  }

  // Numeric M/D or M/D/Y
  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const mo = +m[1] - 1; const day = +m[2];
    let year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    let d = new Date(year, mo, day);
    if (!m[3] && d < today) d = new Date(year + 1, mo, day);
    return { date: iso(d), text: m[0] };
  }

  // Bare ordinal day ("the 6th", "the 20th") → this month, or next month if past.
  if ((m = s.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)) || (m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i))) {
    const day = +m[1];
    if (day >= 1 && day <= 31) {
      let d = new Date(now.getFullYear(), now.getMonth(), day);
      if (d < today) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
      return { date: iso(d), text: m[0] };
    }
  }

  if ((m = s.match(/\btoday\b/i))) return { date: iso(today), text: m[0] };
  if ((m = s.match(/\btomorrow\b/i))) { const d = new Date(today); d.setDate(d.getDate() + 1); return { date: iso(d), text: m[0] }; }
  if ((m = s.match(/\bin\s+(\d{1,2})\s+days?\b/i))) { const d = new Date(today); d.setDate(d.getDate() + +m[1]); return { date: iso(d), text: m[0] }; }

  // (next|this)? weekday
  if ((m = s.match(/\b(next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i))) {
    const target = WEEKDAYS.indexOf(m[2].toLowerCase());
    const d = new Date(today);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;               // "monday" → the coming Monday
    if (/next/i.test(m[1] || "") && delta <= 7) delta += (delta === 7 ? 0 : 0); // "next" keeps the coming one
    d.setDate(d.getDate() + delta);
    return { date: iso(d), text: m[0] };
  }

  return null;
}

// Format an ISO date as a friendly spoken string, e.g. "Monday, August 4".
export function friendlyDate(isoStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoStr || ""));
  if (!m) return String(isoStr || "");
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

const CAL_VERB = /\b(add|put|schedule|create|book|set\s?up|new)\b/i;
const CAL_NOUN = /\b(calendar|event|appointment|meeting)\b/i;

// Parse a calendar-event command. Returns null if it isn't one, else
// { title, date|null, category|null }.
export function parseEventCommand(text, now = new Date()) {
  let s = String(text || "").trim();
  if (!CAL_VERB.test(s) || !CAL_NOUN.test(s)) return null;
  if (/\bremind me\b/i.test(s)) return null; // reminders are handled elsewhere

  // Category: "under [a new event] X" / "category X" / "in my X calendar", at the end.
  let category = null;
  let mc = s.match(/\bunder\s+(?:a\s+|an\s+)?(?:new\s+)?(?:event\s+)?(?:category\s+)?(?:called\s+|named\s+)?["']?([a-z0-9][a-z0-9 &/_-]{0,39}?)["']?\s*$/i)
    || s.match(/\b(?:category|group|folder)\s+["']?([a-z0-9][a-z0-9 &/_-]{0,39}?)["']?\s*$/i)
    || s.match(/\bin\s+my\s+["']?([a-z0-9][a-z0-9 &/_-]{0,39}?)["']?\s+calendar\b/i);
  if (mc) { category = mc[1].trim(); s = s.replace(mc[0], " "); }

  // Date anywhere in the remaining text.
  let date = null;
  const dm = parseDate(s, now);
  if (dm) { date = dm.date; s = s.replace(dm.text, " "); }

  // Title: strip command words + "to/on my calendar", then recover the event name.
  let title = s
    .replace(/^\s*(hey\s+|ok\s+|okay\s+)?donna[,\s]*/i, "")
    .replace(CAL_VERB, " ")
    .replace(/\b(to|on|in|for)\s+(my\s+)?calendar\b/ig, " ")
    .replace(/\bmy\s+calendar\b/ig, " ");

  // "event/appointment/meeting called|titled|named X" → X is the title.
  const named = title.match(/\b(?:event|appointment|meeting)\s+(?:called|titled|named|for)\s+(.+)$/i);
  if (named) {
    title = named[1];
  } else {
    // Drop a leading filler noun ("an event …", "a meeting …") but keep it when it's
    // part of the name ("team meeting").
    title = title.replace(/\b(an?|the)\s+(event|appointment|meeting)\b/ig, " ").replace(/^\s*(event|appointment|meeting)\b/i, " ");
  }

  title = title
    .replace(/\b(an?|the)\b/ig, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:on|at|for|of|to|in)\s+/i, "")   // dangling prepositions left by date removal
    .replace(/\s+(?:on|at|for|of|to|in)$/i, "")
    .trim();

  return { title: title || "", date, category };
}

// Parse a reschedule/delete command. Returns { op:"move"|"delete", title, date }
// or null. `title` is the event name to match against existing events.
export function parseEventEdit(text, now = new Date()) {
  let s = String(text || "").trim().replace(/^\s*(?:hey\s+|ok\s+|okay\s+)?donna[,\s]*/i, "");
  const strip = (t) => t
    .replace(/\bfrom\s+(?:my\s+)?calendar\b/ig, " ")
    .replace(/\b(to|the|my|an?|on|for|event|appointment|meeting|calendar|please)\b/ig, " ")
    .replace(/\s+/g, " ").trim();

  const mv = s.match(/\b(move|reschedule|re-?schedule|change|push|bump|shift)\b/i);
  if (mv) {
    const rest = s.slice(mv.index + mv[0].length);
    const dm = parseDate(rest, now);
    let title = rest;
    if (dm) title = title.replace(dm.text, " ");
    title = strip(title);
    if (title) return { op: "move", title, date: dm ? dm.date : null };
  }

  const dv = s.match(/\b(delete|remove|cancel|scrap|clear|get rid of)\b/i);
  if (dv) {
    if (/\bremind/i.test(s)) return null; // reminder cancellation is handled elsewhere
    const title = strip(s.slice(dv.index + dv[0].length));
    if (title) return { op: "delete", title, date: null };
  }
  return null;
}

// --- Category colours ---
const PALETTE = [
  "#e11d48", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
];
// The 5 built-in category colours, so a new one never collides with them.
export const DEFAULT_CATEGORY_COLORS = ["#4285f4", "#a142f4", "#0f9d58", "#f4b400", "#db4437"];

// Pick a random colour that isn't already used by an existing category.
export function pickUnusedColor(used = []) {
  const u = new Set(used.filter(Boolean).map((c) => String(c).toLowerCase()));
  const free = PALETTE.filter((c) => !u.has(c.toLowerCase()));
  const pool = free.length ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function slugify(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "cat";
}
