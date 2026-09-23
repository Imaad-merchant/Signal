// Voice-driven LOGS. A "log" is a Page document (category "Log") whose markdown
// content is a running, tidy record grouped by day. You create logs and append to
// them by voice; Donna condenses each entry (server `log` route) before it lands, so
// the document stays neat. The default journal is a log named "Journal".
//
// This module = pure parsers + content helpers + Page-backed append/read. The
// conversational smart-routing (ask "add to X or new?") lives in Donna.jsx.
import { base44 } from "@/api/base44Client";

export const LOG_CATEGORY = "Log";
const ACTIVE_KEY = "donna_active_log";

export function getActiveLog() {
  try { return localStorage.getItem(ACTIVE_KEY) || ""; } catch { return ""; }
}
export function setActiveLog(name) {
  try { if (name) localStorage.setItem(ACTIVE_KEY, name); } catch { /* ignore */ }
}

const clean = (s) => (s || "").trim().replace(/[.?!,]+$/, "").trim();
// Tidy a spoken log name ("my workouts", "the volunteering log") → "Workouts".
export function normalizeLogName(raw) {
  let n = clean(raw).replace(/^(my|the)\s+/i, "").replace(/\s+log$/i, "").trim();
  if (!n) return "";
  return n.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
}

// ---- parsers (return null when they don't match) ----

// "start/create/make a (new) log called/named/for X[: entry]"
export function parseLogStart(text) {
  const m = /^\s*(start|create|make|begin|open|new)\s+(a\s+)?(new\s+)?log\s+(?:called|named|titled|for|about|on)\s+(.+)$/i.exec(text || "");
  if (!m) return null;
  let rest = m[4].trim();
  let entry = "";
  const split = rest.split(/\s*[:,]\s*(.+)$/); // "Workouts: ran 3 miles"
  if (split.length >= 2) { rest = split[0]; entry = split[1].trim(); }
  const name = normalizeLogName(rest);
  if (!name) return null;
  return { name, entry };
}

// "add (this) to my X log[: entry]", "log to X: entry", "in my X log, entry",
// "continue my X log: entry"
export function parseLogAppend(text) {
  const t = text || "";
  let m =
    /^\s*add\s+(?:this\s+)?to\s+(?:my\s+|the\s+)?(.+?)\s+log\b[:,]?\s*(.*)$/i.exec(t) ||
    /^\s*(?:continue|keep|resume)\s+(?:my\s+|the\s+)?(.+?)\s+log\b[:,]?\s*(.*)$/i.exec(t) ||
    /^\s*log\s+(?:to|in|under)\s+(?:my\s+|the\s+)?(.+?)\b[:,]\s*(.+)$/i.exec(t) ||
    /^\s*in\s+(?:my\s+|the\s+)?(.+?)\s+log\b[,:]?\s+(.+)$/i.exec(t);
  if (!m) return null;
  const name = normalizeLogName(m[1]);
  const entry = (m[2] || "").trim();
  if (!name) return null;
  return { name, entry };
}

// "continue logging[: entry]", "keep logging", "resume my log" → active log
export function parseLogContinue(text) {
  const m = /^\s*(continue|keep|resume)\s+(logging|the\s+log|my\s+log)\b[:,]?\s*(.*)$/i.exec(text || "");
  if (!m) return null;
  return { entry: (m[3] || "").trim() };
}

// "read/show/what's in my X log", "read my journal"
export function parseLogRead(text) {
  const t = text || "";
  let m =
    /^\s*(?:read|show|open|pull up|what'?s\s+in|whats\s+in|read\s+me)\s+(?:my\s+|the\s+)?(.+?)\s+log\b/i.exec(t) ||
    /^\s*(?:read|show|what'?s\s+in|whats\s+in)\s+(?:my\s+|the\s+)?(journal|diary)\b/i.exec(t);
  if (!m) return null;
  return { name: normalizeLogName(m[1]) || "Journal" };
}

// Bare "log that/this X", "log: X" → default journal (checked last). Returns the
// inline content, or "" for a deictic "log it/this/that" with nothing after.
export function parseLogBare(text) {
  const m = /^\s*log\s+(?:that|this|it)?\b[:,]?\s*(.*)$/i.exec(text || "");
  if (!m) return null;
  return { entry: (m[1] || "").trim() };
}

// ---- content shaping ----

// Insert `line` newest-first: keep the "# Title" header, put today's `## date`
// section right below it, and the newest bullet at the top of that section.
export function insertEntry(content, title, heading, line) {
  let body = (content || "").trim();
  if (!body) body = `# ${title}`;
  const firstNL = body.indexOf("\n");
  const head = firstNL === -1 ? body : body.slice(0, firstNL);
  let rest = (firstNL === -1 ? "" : body.slice(firstNL + 1)).replace(/^\n+/, "");
  const marker = `## ${heading}`;
  if (rest.startsWith(marker)) {
    const nl = rest.indexOf("\n", marker.length);
    const at = nl === -1 ? rest.length : nl + 1;
    rest = rest.slice(0, at) + `- ${line}\n` + rest.slice(at);
  } else {
    rest = `${marker}\n- ${line}\n\n${rest}`;
  }
  return `${head}\n\n${rest}`.trimEnd() + "\n";
}

// The most recent `n` bullet entries (for reading a log aloud).
export function recentEntries(content, n = 3) {
  return (content || "")
    .split("\n")
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, "").trim())
    .slice(0, n);
}

// ---- Page-backed helpers ----

async function loadLogPages() {
  const pages = await base44.entities.Page.filter({ category: LOG_CATEGORY }).catch(() => []);
  return Array.isArray(pages) ? pages : [];
}

export function findLogPage(pages, name) {
  const q = (name || "").toLowerCase().trim();
  if (!q) return null;
  return (pages || []).find((p) => (p.title || "").toLowerCase().trim() === q)
    || (pages || []).find((p) => (p.title || "").toLowerCase().includes(q))
    || null;
}

// [{ name, summary }] for smart-routing + the Tasks view.
export function buildLogList(pages) {
  return (pages || []).map((p) => ({
    name: p.title || "Log",
    summary: `${p.title || ""} — ${String(p.content || "").replace(/[#>*-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)}`,
  }));
}

export async function listLogs() {
  return buildLogList(await loadLogPages());
}

// Append one already-condensed `line` to the named log (create the Page if new).
// Returns { page, created, prevContent } so the caller can log an undoable action.
export async function appendToLog(name, line, dateKey) {
  const title = normalizeLogName(name) || "Journal";
  const pages = await loadLogPages();
  let page = findLogPage(pages, title);
  const created = !page;
  const prevContent = page ? (page.content || "") : "";
  const nextContent = insertEntry(prevContent, title, dateKey, line);
  if (page) {
    await base44.entities.Page.update(page.id, { content: nextContent });
    page = { ...page, content: nextContent };
  } else {
    // A regular Document (type "document"), so it renders correctly in the docs
    // workspace — NOT a whiteboard.
    page = await base44.entities.Page.create({
      title, type: "document", category: LOG_CATEGORY, content: nextContent,
      parent_id: null, section: "private", status: "not_started", source: "donna",
    });
  }
  return { page, created, prevContent, title };
}

// Read a log back: returns { title, entries } (most-recent first) or null if absent.
export async function readLog(name) {
  const title = normalizeLogName(name) || "Journal";
  const pages = await loadLogPages();
  const page = findLogPage(pages, title);
  if (!page) return null;
  return { title: page.title || title, entries: recentEntries(page.content, 3), page };
}
