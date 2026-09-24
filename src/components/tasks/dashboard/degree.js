// Degree-dashboard logic, ported verbatim from the "Degree Dashboard" design
// artifact (Modernist canvas doc, turn 1a). Transcript/requirements parsing, the
// derived stats the three panes render, and the offline answer fallback all live
// here — React-free, so it unit-tests straight from node against the design's own
// sample documents:
//   node --input-type=module -e "const m = await import('./src/components/tasks/dashboard/degree.js'); ..."
// Keep new domain logic here rather than in DashboardView.jsx for exactly that reason.


export const GP = { "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0 };

export const SAMPLE_TRANSCRIPT = `UNOFFICIAL TRANSCRIPT — State University
Student: Alex Rivera · B.S. Computer Science

Spring 2024
CS 101  Intro to Programming  3.0  A
MATH 151  Calculus I  4.0  B+
ENGL 101  College Writing  3.0  A-
HIST 110  World History  3.0  B
Fall 2024
CS 150  Data Structures  3.0  A-
MATH 152  Calculus II  4.0  B
PHYS 201  Physics I  4.0  B+
COMM 120  Public Speaking  3.0  A
Spring 2025
CS 201  Computer Systems  3.0  B+
CS 220  Discrete Math  3.0  A
MATH 240  Linear Algebra  3.0  A-
ECON 101  Microeconomics  3.0  B+
PSYC 100  Intro Psychology  3.0  A
Fall 2025
CS 250  Algorithms  3.0  B
CS 270  Databases  3.0  A
STAT 210  Probability  3.0  B+
ART 105  Design Fundamentals  3.0  A
PHIL 120  Ethics  3.0  A-
Spring 2026
CS 310  Operating Systems  3.0  A-
CS 330  Software Engineering  3.0  A
CS 340  Networks  3.0  B+
BIO 110  Biology I  4.0  B
Fall 2026
CS 350  Machine Learning  3.0  IP
CS 360  Security  3.0  IP
MATH 330  Numerical Methods  3.0  IP
ENGL 210  Technical Writing  3.0  IP`;

export const SAMPLE_REQS = `B.S. Computer Science — Degree Requirements (Catalog 2023–24)
Total credits required: 120

Core
CS 101 Intro to Programming
CS 150 Data Structures
CS 201 Computer Systems
CS 220 Discrete Math
CS 250 Algorithms
CS 310 Operating Systems
CS 330 Software Engineering
CS 410 Theory of Computation
CS 490 Senior Capstone
Math
MATH 151 Calculus I
MATH 152 Calculus II
MATH 240 Linear Algebra
STAT 210 Probability
Electives (choose 3)
CS 270 Databases
CS 340 Networks
CS 350 Machine Learning
CS 360 Security
CS 380 Compilers`;

export const SAMPLE_NOTES = `Advisor meeting, Sept 12: plan CS 410 and CS 490 for Spring 2027. Considering a Math minor, which would add MATH 330 (in progress) and MATH 350.`;

export function parseTranscript(text) {
  const out = []; let term = "";
  (text || "").split("\n").forEach((l) => {
    const t = l.trim();
    if (/^(fall|spring|summer|winter)\s+\d{4}$/i.test(t)) { term = t; return; }
    const m = t.match(/^([A-Z]{2,5})\s?(\d{3}[A-Z]?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|P|W|IP)$/);
    if (m) out.push({ code: m[1] + " " + m[2], name: m[3], cr: +m[4], grade: m[5], term });
  });
  return out;
}

export function parseReqs(text) {
  let total = null; const groups = []; let g = null;
  (text || "").split("\n").forEach((l) => {
    const t = l.trim(); if (!t) return;
    const tm = t.match(/total credits[^\d]*(\d+)/i);
    if (tm) { total = +tm[1]; return; }
    const m = t.match(/^([A-Z]{2,5})\s?(\d{3}[A-Z]?)\s+(.*)$/);
    if (m) {
      if (!g) { g = { name: "Required", need: null, items: [] }; groups.push(g); }
      g.items.push({ code: m[1] + " " + m[2], name: m[3] });
      return;
    }
    if (groups.length === 0 && /requirement|catalog/i.test(t)) return;
    const n = t.match(/choose\s+(\d+)/i);
    g = { name: t.replace(/\(.*\)/, "").trim(), need: n ? +n[1] : null, items: [] };
    groups.push(g);
  });
  return { total, groups: groups.filter((x) => x.items.length) };
}

let _uid = 0;
const nid = () => "s" + (++_uid) + Math.random().toString(36).slice(2, 6);
export const r1 = (n) => Math.round(n * 10) / 10;
export const fmtCr = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function makeSource(kind, name, text, origin, size) {
  return { id: nid(), kind, name, text: text || "", origin: origin || "paste", size: size || null, on: true };
}

export function statsFor(sources, degreeId) {
  const on = sources.filter((s) => s.on);
  const trSources = on.filter((s) => s.kind === "transcript");
  const map = {};
  trSources.forEach((s) => parseTranscript(s.text).forEach((c) => { map[c.code] = c; }));
  const courses = Object.values(map);
  const reqSrc = on.find((s) => s.kind === "requirements" && s.id === degreeId) || on.find((s) => s.kind === "requirements");
  const req = reqSrc ? parseReqs(reqSrc.text) : null;
  const target = (req && req.total) || 120;
  let earned = 0, ip = 0, pts = 0, gcr = 0;
  courses.forEach((c) => {
    if (c.grade === "IP") ip += c.cr;
    else if (c.grade === "P" || GP[c.grade] > 0) earned += c.cr;
    if (GP[c.grade] != null) { pts += GP[c.grade] * c.cr; gcr += c.cr; }
  });
  const gpa = gcr ? pts / gcr : null;
  let reqNeed = 0, reqDone = 0, reqIp = 0;
  const missing = [], inProg = [];
  const groups = req ? req.groups.map((g) => {
    const items = g.items.map((it) => {
      const c = map[it.code];
      let st = "missing";
      if (c) st = c.grade === "IP" ? "ip" : (c.grade === "W" || c.grade === "F") ? "missing" : "done";
      return { ...it, st, grade: c ? c.grade : "" };
    });
    const need = g.need || items.length;
    const d = items.filter((i) => i.st === "done").length;
    const p = items.filter((i) => i.st === "ip").length;
    if (g.need && d + p >= g.need) items.forEach((i) => { if (i.st === "missing") i.st = "skip"; });
    const dC = Math.min(d, need), pC = Math.min(p, need - dC);
    reqNeed += need; reqDone += dC; reqIp += pC;
    items.forEach((i) => { if (i.st === "missing") missing.push(i); if (i.st === "ip") inProg.push(i); });
    return { name: g.name, need: g.need, items, meta: (g.need ? `choose ${g.need} · ` : "") + `${dC} of ${need} done` };
  }) : [];
  return {
    hasTranscript: trSources.length > 0, hasCourses: courses.length > 0, reqSrc, req, target,
    earned: r1(earned), ip: r1(ip), gpa, gcr: r1(gcr), courses, groups, reqNeed, reqDone, reqIp,
    reqLeft: Math.max(0, reqNeed - reqDone - reqIp), missing, inProg,
    pct: target ? Math.min(100, Math.round((earned / target) * 100)) : 0,
    pctIp: target ? Math.min(100, Math.round(((earned + ip) / target) * 100)) : 0,
    citeNames: on.map((s) => s.name),
    on,
  };
}

export function answerFor(q, st) {
  const s = q.toLowerCase();
  if (!st.hasTranscript) return "I don’t see a transcript in Context yet. Paste it or upload the PDF on the left and I’ll work from that.";
  if (!st.hasCourses) return "I have your file, but I couldn’t read course lines from it yet. Paste the transcript text and I’ll pick up each class, its credits and grade.";
  const left = Math.max(0, st.target - st.earned - st.ip);
  if (/gpa|grade point/.test(s)) {
    // st.gpa is null when nothing is graded yet (e.g. every course is IP).
    if (st.gpa == null) return `No graded classes yet, so there's no GPA to report.` + (st.ip ? ` The ${fmtCr(st.ip)} credits in progress aren't graded.` : "");
    return `Your cumulative GPA is ${st.gpa.toFixed(2)} across ${fmtCr(st.gcr)} graded credits (unweighted 4.0).` + (st.ip ? ` The ${fmtCr(st.ip)} credits in progress aren’t graded yet.` : "");
  }
  if (/missing|left|still|remaining|need to take|what.*need/.test(s)) {
    if (!st.req) return `You have ${fmtCr(Math.max(0, st.target - st.earned))} credits left toward ${st.target}. Add your degree requirements to Context and I can tell you which specific classes are missing.`;
    const m = st.missing.map((i) => `${i.code} ${i.name}`).join(", ");
    const p = st.inProg.map((i) => i.code).join(", ");
    return (st.missing.length ? `${st.missing.length} required classes are still missing: ${m}.` : "Every required class is done or in progress.") + (p ? `\n${p} ${st.inProg.length > 1 ? "are" : "is"} in progress this term.` : "") + `\nBeyond required classes you need ${fmtCr(left)} more credits to reach ${st.target}.`;
  }
  if (/graduat|how long|terms|semesters|when/.test(s)) {
    const terms = Math.ceil(left / 15);
    return `After this term you’ll have ${fmtCr(st.earned + st.ip)} of ${st.target} credits. That leaves ${fmtCr(left)}, about ${terms} more term${terms === 1 ? "" : "s"} at 15 credits each.` + (st.missing.length ? ` Plan ${st.missing.map((i) => i.code).join(" and ")} into those terms.` : "");
  }
  return `You’ve earned ${fmtCr(st.earned)} of ${st.target} credits, so ${st.pct}% of your degree is finished.` + (st.ip ? `\nWith the ${fmtCr(st.ip)} credits in progress this term, you’ll be at ${fmtCr(st.earned + st.ip)} (${st.pctIp}%).` : "") + (st.req ? `\nOf the ${st.reqNeed} required classes, ${st.reqDone} are done and ${st.reqIp} are in progress.` : "");
}

export const STARTERS = [
  "What percent of my degree is finished?",
  "Which required classes am I still missing?",
  "What’s my cumulative GPA?",
  "How many terms until I graduate?",
];


// ── Persistence ───────────────────────────────────────────────────────────────
// The page doc stores this as a JSON string in its `dashboard` field. Parsing is
// tolerant: an empty, corrupt, or older-shaped value opens as a blank dashboard
// rather than crashing the view.

export const EMPTY_STATE = { kind: "degree", sources: [], degreeId: null, messages: [] };

const GRADE_FOR_STATUS = { in_progress: "IP", planned: "" };

// The first Dashboard build stored {kind:"academic", courses:[...]}. Rather than
// dropping that, render those rows back out as a transcript document so anything
// typed into the old course table still counts.
function academicToTranscript(courses) {
  const byTerm = new Map();
  for (const c of courses) {
    const term = (c.term || "").trim() || "Unassigned";
    if (!byTerm.has(term)) byTerm.set(term, []);
    byTerm.get(term).push(c);
  }
  const lines = [];
  for (const [term, list] of byTerm) {
    lines.push(term);
    for (const c of list) {
      const grade = c.status === "completed" ? String(c.grade || "").toUpperCase() : GRADE_FOR_STATUS[c.status];
      if (!grade) continue; // a planned course has no transcript line
      lines.push(`${c.code || "GEN 100"}  ${c.name || "Course"}  ${Number(c.credits || 0).toFixed(1)}  ${grade}`);
    }
  }
  return lines.join("\n");
}

export function parseDashboard(raw) {
  let data = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ...EMPTY_STATE };
    try { data = JSON.parse(raw); } catch { return { ...EMPTY_STATE }; }
  }
  if (!data || typeof data !== "object") return { ...EMPTY_STATE };

  if (data.kind === "academic") {
    const courses = Array.isArray(data.courses) ? data.courses.filter((c) => c && typeof c === "object") : [];
    const text = academicToTranscript(courses);
    if (!text) return { ...EMPTY_STATE };
    return { kind: "degree", sources: [makeSource("transcript", "Courses from your old dashboard", text, "paste")], degreeId: null, messages: [] };
  }

  const sources = Array.isArray(data.sources)
    ? data.sources.filter((s) => s && typeof s === "object").map((s) => ({
        id: s.id || nid(),
        kind: ["transcript", "requirements", "notes"].includes(s.kind) ? s.kind : "notes",
        name: String(s.name || "Untitled"),
        text: typeof s.text === "string" ? s.text : "",
        origin: s.origin === "file" ? "file" : "paste",
        size: s.size || null,
        on: s.on !== false,
      }))
    : [];
  const messages = Array.isArray(data.messages)
    ? data.messages.filter((m) => m && (m.role === "user" || m.role === "ai")).map((m) => ({
        role: m.role,
        text: String(m.text || ""),
        cites: Array.isArray(m.cites) ? m.cites.map(String) : [],
      }))
    : [];
  const degreeId = sources.some((s) => s.id === data.degreeId) ? data.degreeId : null;
  return { kind: "degree", sources, degreeId, messages };
}

export function serializeDashboard(state) {
  return JSON.stringify({
    kind: "degree",
    degreeId: state.degreeId || null,
    sources: (state.sources || []).map((s) => ({ id: s.id, kind: s.kind, name: s.name, text: s.text, origin: s.origin, size: s.size, on: s.on !== false })),
    messages: (state.messages || []).map((m) => ({ role: m.role, text: m.text, cites: m.cites || [] })),
  });
}

// A Firestore document caps at 1 MiB, and a transcript pasted as text is the only
// thing here that can get large. Refuse a source that would blow the whole page up.
export const MAX_SOURCE_CHARS = 180000;
export function tooLarge(text) {
  return (text || "").length > MAX_SOURCE_CHARS;
}
