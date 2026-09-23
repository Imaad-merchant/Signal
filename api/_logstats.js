// Pure log-analytics helpers — no I/O, so they unit-test standalone.
//
// A "log" is a Page document whose content is a running record grouped by day.
// It is written as markdown (`## YYYY-MM-DD` headings + `- bullets`) by the voice
// append path, but the docs editor re-saves the same document as HTML. So this
// parser tolerates BOTH shapes and extracts dated entries the LLM can count from.

// Collapse HTML block structure to one-entry-per-line text; leave markdown as-is.
export function toLines(content) {
  let s = String(content || "");
  if (/<\/?[a-z][\s\S]*?>/i.test(s)) {
    s = s
      .replace(/<\s*(br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(h[1-6]|p|div|li|ul|ol|blockquote|tr|section)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"');
  }
  return s.split(/\r?\n/).map((l) => l.trim());
}

const ISO = /\b(\d{4}-\d{2}-\d{2})\b/;

// Is this line a DATE HEADING (returns the date) rather than an entry? True for a
// markdown heading with a date, or a line that is essentially just an ISO date
// (optionally a weekday + the date), which is how HTML `<h2>date</h2>` normalizes.
function dateHeading(line) {
  const m = ISO.exec(line);
  if (!m) return null;
  if (/^#{1,6}\s/.test(line)) return m[1];
  const rest = line
    .replace(/^[-*•]\s*/, "")
    .replace(ISO, "")
    .replace(/^[A-Za-z]{3,9},?\s*/, "") // an optional leading weekday
    .replace(/[\s:–—-]/g, "")
    .trim();
  return rest.length === 0 ? m[1] : null;
}

// Parse a log's content into [{ date, text }]. Entries only count when they sit
// under a date heading (stats need dates); a leading document title is skipped.
export function parseLogEntries(content) {
  const lines = toLines(content);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (!line) continue;
    const d = dateHeading(line);
    if (d) { cur = d; continue; }
    if (!cur) continue; // pre-date content (the title, stray text) — ignore
    const text = line.replace(/^#{1,6}\s*/, "").replace(/^[-*•]\s+/, "").trim();
    if (text) out.push({ date: cur, text: text.slice(0, 240) });
  }
  return out;
}

const monthKey = (d) => d.slice(0, 7);
export function prevMonth(ym) {
  let [y, m] = ym.split("-").map(Number);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
// Whole-day difference b − a for two ISO dates (UTC-anchored, DST-safe).
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
const lastMonths = (byMonth, n) =>
  Object.keys(byMonth).sort().slice(-n).reduce((o, k) => { o[k] = byMonth[k]; return o; }, {});
const bucketByMonth = (dates) => {
  const b = {};
  for (const d of dates) b[monthKey(d)] = (b[monthKey(d)] || 0) + 1;
  return b;
};

// Per-log summary: totals, recency, this-vs-last month, recent examples. All
// arithmetic is done here so the model only ever narrates finished numbers.
export function computeLogSummary(page, today) {
  const entries = parseLogEntries(page && page.content);
  const name = (page && page.title) || "Log";
  if (!entries.length) return { name, total: 0, empty: true };
  const dates = entries.map((e) => e.date).sort();
  const byMonth = bucketByMonth(dates);
  const tm = monthKey(today), lm = prevMonth(tm);
  const lastDate = dates[dates.length - 1];
  return {
    name,
    total: entries.length,
    activeDays: new Set(dates).size,
    firstDate: dates[0],
    lastDate,
    daysSinceLast: daysBetween(lastDate, today),
    thisMonth: byMonth[tm] || 0,
    lastMonth: byMonth[lm] || 0,
    byMonth: lastMonths(byMonth, 4),
    recent: entries
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3)
      .map((e) => `${e.date}: ${e.text.slice(0, 80)}`),
  };
}

// Topic stats: count entries across ALL logs whose text matches any search term
// (e.g. "gym"), so "how many times did I go to the gym" works even when the log
// isn't named for it and gym visits are scattered in a general journal.
export function computeTopicStats(allEntries, terms, today) {
  const t = (terms || []).filter(Boolean).map((s) => s.toLowerCase());
  if (!t.length) return null;
  const matched = (allEntries || []).filter((e) => {
    const h = String(e.text || "").toLowerCase();
    return t.some((w) => h.includes(w));
  });
  if (!matched.length) return null;
  const dates = matched.map((e) => e.date).sort();
  const byMonth = bucketByMonth(dates);
  const tm = monthKey(today), lm = prevMonth(tm);
  const lastDate = dates[dates.length - 1];
  return {
    term: t.join("/"),
    total: matched.length,
    firstDate: dates[0],
    lastDate,
    daysSinceLast: daysBetween(lastDate, today),
    thisMonth: byMonth[tm] || 0,
    lastMonth: byMonth[lm] || 0,
    byMonth: lastMonths(byMonth, 4),
    examples: matched
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3)
      .map((e) => `${e.date}: ${e.text.slice(0, 80)}`),
  };
}

const prevDayISO = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

// Habit stats from HabitLog records ({ habit_name, date, done }) — the check-in
// data behind "gym", "no smoking", "no vaping", "stayed sober". `done: true` is
// the day the positive outcome happened; we report the streak, this-vs-last month
// done-days, and last time it was hit. This is exact structured data (better than
// the free-text logs), so these numbers are authoritative.
export function computeHabitStats(habitName, logs, today) {
  const rows = (logs || []).filter((l) => l && l.date);
  if (!rows.length) return { name: habitName, loggedDays: 0, empty: true };
  const done = rows.filter((l) => l.done).map((l) => l.date).sort();
  const all = rows.map((l) => l.date).sort();
  const doneByMonth = bucketByMonth(done);
  const allByMonth = bucketByMonth(all);
  const tm = monthKey(today), lm = prevMonth(tm);
  const lastDone = done.length ? done[done.length - 1] : null;
  const doneSet = new Set(done);
  let streak = 0;
  let day = doneSet.has(today) ? today : prevDayISO(today);
  while (doneSet.has(day)) { streak++; day = prevDayISO(day); }
  return {
    name: habitName,
    loggedDays: all.length,
    doneDays: done.length,
    firstLogged: all[0],
    lastDone,
    daysSinceLastDone: lastDone ? daysBetween(lastDone, today) : null,
    doneThisMonth: doneByMonth[tm] || 0,
    doneLastMonth: doneByMonth[lm] || 0,
    loggedThisMonth: allByMonth[tm] || 0,
    loggedLastMonth: allByMonth[lm] || 0,
    currentStreak: streak,
    byMonthDone: lastMonths(doneByMonth, 4),
  };
}

const STOP = new Set(
  ("the a an of my me i to for is are am do did does have has had how many much often " +
    "when where what which who whom last this that these those going go went gone been being " +
    "statistic statistics stats log logs logged journal about on in at give given show tell me " +
    "more most average per day days week weeks month months year years frequency frequently " +
    "time times track record streak trend consistent consistency compare compared and or but " +
    "with from into out over under again still yet just been you your")
    .split(/\s+/),
);
// Salient content words from the question ("...going to the gym" → ["gym"]).
export function analyticsTerms(transcript) {
  const seen = new Set();
  return String(transcript || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !seen.has(w) && seen.add(w))
    .slice(0, 6);
}

// Does the question ask for log statistics / habit frequency?
export function wantsLogStats(t) {
  if (!t) return false;
  return /\b(statistics?|stats|how many times|how often|how frequently|how much have i|frequency|last time i|when did i last|when was the last|track record|streak|per (week|month|day)|average|trend|compared? to last|this month|how many days|how consistent|consistency)\b/i.test(t);
}
