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
    const m = t.match(/^([A-Z]{2,5})\s?(\d{3,4}[A-Z]?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|P|W|I|IP|CR|NC|TR)$/i);
    if (m) out.push({ code: m[1] + " " + m[2], name: m[3], cr: +m[4], grade: m[5].toUpperCase(), term });
  });
  return out;
}

export function parseReqs(text) {
  let total = null; const groups = []; let g = null;
  (text || "").split("\n").forEach((l) => {
    const t = l.trim(); if (!t) return;
    // Degree plans say "total credits", "total hours required", "120 semester hours" —
    // the artifact only knew the first.
    // "total credits" / "total hours required" / "150 total semester hours" /
    // "120 credit hours required". The word total or required must be present, or a
    // group header like "30 hours upper-level accounting" would read as the degree total.
    const tm = t.match(/total[^\n\d]{0,20}?(?:credit|hour)s?[^\d]{0,12}(\d{2,3})/i)
      || t.match(/(\d{2,3})\s+total\s+(?:semester\s+)?(?:credit|hour)/i)
      || t.match(/(\d{2,3})\s+(?:semester\s+)?(?:credit|hour)\s?(?:hour)?s?\s+required/i);
    if (tm) { total = +tm[1]; return; }
    const m = t.match(/^([A-Z]{2,5})\s?(\d{3,4}[A-Z]?)\s+(.*)$/);
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

// ── Ellucian Degree Works audits ──────────────────────────────────────────────
// A Degree Works export is not a line-per-course transcript: it prints label/value
// stanzas (Course / Title / Grade / Credits / Term) and reports its own applied vs
// required credits per block. Those totals are authoritative — the per-requirement
// tick marks are icons in the PDF and do not survive text extraction — so an audit
// drives the numbers directly rather than being summed up from course lines.

const DW_FOOTER = /^(\d{1,2}\/\d{1,2}\/\d{2,4},?\s.*Degree Works|https?:\/\/)/i;

export function isDegreeWorks(text) {
  return /Ellucian Degree Works|Degree Audit/i.test(text || "");
}

export function parseDegreeWorks(text) {
  if (!isDegreeWorks(text)) return null;
  // Page headers/footers interleave with content on every page break.
  const lines = (text || "").split("\n").map((l) => l.trim()).filter((l) => l && !DW_FOOTER.test(l));

  const joined = lines.join("\n");
  const prog = joined.match(/Program\s+(.+?)\s+Major\s+(.+?)(?:\s+Classification\s+(\S+))?$/m);
  const gpaM = joined.match(/Institutional GPA\s+([\d.]+)/i);
  const student = joined.match(/^([A-Z][\w'-]+,\s?[\w'\- ]+)$/m);

  // Blocks: "Credits required: N [Credits applied: M]" then the block's name, then its status.
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^Credits required:\s*(\d+)(?:\s+Credits applied:\s*(\d+))?/i);
    if (!m) continue;
    let applied = m[2] == null ? null : +m[2];
    let j = i + 1;
    // The degree-level block prints its applied credits on the following line.
    if (applied == null) {
      const cont = lines[j] && lines[j].match(/^Credits applied:\s*(\d+)/i);
      if (cont) { applied = +cont[1]; j++; }
    }
    const name = lines[j] || "";
    const status = (lines[j + 1] || "").match(/^(COMPLETE|INCOMPLETE)$/i) ? lines[j + 1].toUpperCase() : "";
    // Requirement rows run from after the block's "Minimum ... " preamble to the next block.
    const items = [];
    for (let k = j + 2; k < lines.length; k++) {
      if (/^Credits required:/i.test(lines[k]) || /^Course\s/i.test(lines[k]) || /^Legend$|^Disclaimer$/i.test(lines[k])) break;
      if (/^Minimum\b/i.test(lines[k]) || /^(COMPLETE|INCOMPLETE)$/i.test(lines[k])) continue;
      if (/^(Name|Degree|Show more|Degree progress|Requirements Credits)$/i.test(lines[k])) continue;
      if (/^(Credits|Classes) applied:/i.test(lines[k]) || /^Insufficient Credits/i.test(lines[k])) continue;
      items.push(lines[k]);
    }
    blocks.push({ name, status, required: +m[1], applied, items });
  }

  // Course stanzas: Course / Title / Grade / Credits / Term (Repeated is optional).
  const courses = [];
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].match(/^Course\s+([A-Z]{2,5})\s?(\d{3,4}[A-Z]?)$/);
    if (!c) continue;
    const get = (label) => {
      for (let k = i + 1; k < Math.min(i + 7, lines.length); k++) {
        const m = lines[k].match(new RegExp("^" + label + "\\s+(.+)$"));
        if (m) return m[1].trim();
      }
      return "";
    };
    const cr = parseFloat(get("Credits"));
    courses.push({
      code: c[1] + " " + c[2],
      name: get("Title"),
      cr: Number.isFinite(cr) ? cr : 0,
      grade: get("Grade").toUpperCase(),
      term: get("Term"),
      repeated: /^Repeated/i.test(lines[i + 5] || ""),
    });
  }

  const degree = blocks.find((b) => /^Degree in\b/i.test(b.name)) || blocks[0] || null;
  return {
    student: student ? student[1] : "",
    program: prog ? prog[1] : "",
    major: prog ? prog[2] : "",
    classification: prog && prog[3] ? prog[3] : "",
    gpa: gpaM ? +gpaM[1] : null,
    creditsRequired: degree ? degree.required : null,
    creditsApplied: degree && degree.applied != null ? degree.applied : null,
    // Every block but the degree-level one, which is reported as the headline total.
    blocks: blocks.filter((b) => b !== degree),
    courses,
  };
}

// Human summary of an audit source, for the Context list.
export function degreeWorksMeta(audit) {
  const bits = [];
  if (audit.creditsApplied != null && audit.creditsRequired) bits.push(`${audit.creditsApplied} of ${audit.creditsRequired} cr applied`);
  if (audit.gpa != null) bits.push(`GPA ${audit.gpa.toFixed(2)}`);
  if (audit.courses.length) bits.push(`${audit.courses.length} listed classes`);
  return "Degree Works audit" + (bits.length ? " · " + bits.join(" · ") : "");
}

export function statsFor(sources, degreeId) {
  const on = sources.filter((s) => s.on);

  // A Degree Works audit reports its own applied/required credits and institutional
  // GPA. Those are the school's numbers, so they win over anything summed from
  // course lines — and its per-requirement status is an icon that text extraction
  // cannot recover, so those rows are listed without a claim about their state.
  const auditSrc = on.find((s) => isDegreeWorks(s.text));
  if (auditSrc) {
    const audit = parseDegreeWorks(auditSrc.text);
    // A transcript alongside the audit still matters: it is the only place the
    // classes a student actually passed are named. It does not move the audit's
    // credit totals — those are the school's — but its courses are carried so
    // they can be checked against any other requirement list in context.
    const transcriptCourses = [];
    for (const src of on) {
      if (src === auditSrc || src.kind !== "transcript") continue;
      for (const c of parseTranscript(src.text)) transcriptCourses.push(c);
    }
    const target = audit.creditsRequired || 120;
    const earned = audit.creditsApplied || 0;
    const groups = audit.blocks.map((b) => ({
      name: b.name,
      need: null,
      items: b.items.map((name) => ({ code: "", name, st: "listed", grade: "" })),
      meta: (b.applied != null && b.required ? `${b.applied} of ${b.required} cr applied` : "") + (b.status ? ` · ${b.status.toLowerCase()}` : ""),
    }));
    const done = audit.blocks.filter((b) => b.status === "COMPLETE").length;
    return {
      audit, auditName: auditSrc.name,
      hasTranscript: true, hasCourses: audit.courses.length > 0 || transcriptCourses.length > 0 || earned > 0,
      reqSrc: auditSrc, req: { total: target, groups: [] }, target,
      earned: r1(earned), ip: 0, gpa: audit.gpa, gcr: r1(earned),
      courses: [...transcriptCourses, ...audit.courses], transcriptCourses, groups,
      reqNeed: audit.blocks.length, reqDone: done, reqIp: 0,
      reqLeft: Math.max(0, audit.blocks.length - done),
      missing: [], inProg: [],
      pct: target ? Math.min(100, Math.round((earned / target) * 100)) : 0,
      pctIp: target ? Math.min(100, Math.round((earned / target) * 100)) : 0,
      citeNames: on.map((s) => s.name),
      on,
    };
  }

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

// Offline answers for a Degree Works audit. Every number here is one the audit
// itself prints, so this never contradicts the Progress pane.
function answerFromAudit(s, st) {
  const a = st.audit;
  const left = Math.max(0, st.target - st.earned);
  const blocks = a.blocks.map((b) => `${b.name}: ${b.applied} of ${b.required} cr (${(b.status || "").toLowerCase() || "in progress"})`).join("; ");
  if (/gpa|grade point/.test(s)) {
    return a.gpa == null
      ? "Your audit doesn't print an institutional GPA."
      : `Your institutional GPA is ${a.gpa.toFixed(2)}, from ${st.auditName}.` + (a.classification ? ` You're classified as a ${a.classification.toLowerCase()}.` : "");
  }
  if (/missing|left|still|remaining|need to take|what.*need/.test(s)) {
    return `You have ${fmtCr(left)} credits left of the ${st.target} your ${a.program || "program"} requires. By block — ${blocks}.` +
      `\nThe audit marks each requirement with an icon rather than text, so I can't tell from this file which individual ones are ticked off. The blocks above are what it reports.`;
  }
  if (/graduat|how long|terms|semesters|when/.test(s)) {
    const terms = Math.ceil(left / 15);
    return `You've applied ${fmtCr(st.earned)} of ${st.target} credits, leaving ${fmtCr(left)} — about ${terms} more term${terms === 1 ? "" : "s"} at 15 credits each.`;
  }
  if (/repeat|withdraw|fail|insufficient|retake/.test(s) && a.courses.length) {
    return `${a.courses.length} classes carried no credit: ` + a.courses.map((c) => `${c.code} (${c.grade}, ${c.term})`).join(", ") + ".";
  }
  return `Your audit shows ${fmtCr(st.earned)} of ${st.target} credits applied toward ${a.program || "your program"} — ${st.pct}% of the degree.` +
    (a.gpa != null ? ` Institutional GPA ${a.gpa.toFixed(2)}.` : "") +
    (blocks ? `\nBy block — ${blocks}.` : "") +
    (a.courses.length ? `\n${a.courses.length} classes are listed as insufficient credit (repeated, withdrawn or failed).` : "");
}

export function answerFor(q, st) {
  const s = q.toLowerCase();
  if (st.audit) return answerFromAudit(s, st);
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
  "Which classes do I still need for a CPA path, and which have I done?",
];


// ── Chat prompt ───────────────────────────────────────────────────────────────
// Built here rather than inline in the view so the exact text sent to the model
// can be inspected and asserted from node.

// What the parsed documents actually establish. Deliberately explicit about what
// is NOT known: a Degree Works audit marks requirements with icons, so "nothing
// listed as missing" must never read as "nothing is missing".
export function contextFacts(st) {
  if (!st.on.length) return "No documents in context yet.";
  const lines = [];
  if (st.audit) {
    const a = st.audit;
    lines.push(`Degree audit for ${a.student || "the student"}: ${a.program || "program unknown"}${a.major ? `, major ${a.major}` : ""}${a.classification ? `, ${a.classification}` : ""}.`);
    lines.push(`${st.earned} of ${st.target} credits applied (${st.pct}% of the degree)${a.gpa != null ? `, institutional GPA ${a.gpa.toFixed(2)}` : ""}.`);
    for (const b of a.blocks) lines.push(`Block "${b.name}": ${b.applied} of ${b.required} credits applied, ${(b.status || "status unknown").toLowerCase()}. Requirements listed: ${b.items.join("; ")}.`);
    if (a.courses.length) lines.push(`Classes the audit lists as earning no credit (repeated, withdrawn or failed): ${a.courses.map((c) => `${c.code} ${c.name} (${c.grade}, ${c.term})`).join("; ")}.`);
    lines.push("IMPORTANT: this audit shows whether each individual requirement is met with an icon, which carries no text. So the per-requirement ticks are NOT available to you. Do not claim a specific requirement is complete or incomplete unless a transcript in context shows the class. Never say the student is missing nothing.");
    const passed = (st.transcriptCourses || []).filter((c) => c.grade !== "W" && c.grade !== "F");
    if (passed.length) {
      lines.push(`Classes from the transcript also in context: ${passed.map((c) => `${c.code} ${c.name} (${c.grade}${c.term ? `, ${c.term}` : ""})`).join("; ")}.`);
    } else if (!st.on.some((s) => s.kind === "transcript")) {
      lines.push("No separate transcript is in context, so the full list of passed classes is unknown — only the block totals above and the no-credit classes. Say so if the question needs them.");
    }
    return lines.join("\n");
  }
  lines.push(`Earned ${st.earned} of ${st.target} credits (${st.pct}%), ${st.ip} in progress, GPA ${st.gpa == null ? "not yet established" : st.gpa.toFixed(2)}.`);
  if (st.req) {
    lines.push(`Required classes still missing: ${st.missing.map((i) => `${i.code} ${i.name}`).join("; ") || "none"}.`);
    if (st.inProg.length) lines.push(`Required classes in progress: ${st.inProg.map((i) => i.code).join(", ")}.`);
  } else {
    lines.push("No degree requirement list is in context, so which specific classes are required is unknown.");
  }
  return lines.join("\n");
}

export function buildChatPrompt(q, st) {
  const ctx = st.on.length
    ? st.on.map((s) => `=== ${s.name} (${s.kind}) ===\n${s.text ? s.text.slice(0, 60000) : "(no text could be read from this file)"}`).join("\n\n")
    : "(nothing in context yet)";
  return [
    "You are Signal, an academic advisor inside a student's degree dashboard.",
    "",
    "Use the context documents below whenever they bear on the question. Quote real course codes, credits and grades from them — never invent a class, a grade or a requirement.",
    "The ESTABLISHED FACTS are computed from those documents and are authoritative: never contradict them, and never restate a number that contradicts them.",
    "If something is not in the documents, say which part you don't have rather than guessing at it.",
    "If the question is not answerable from the documents at all — career paths, certifications, licensing or exam requirements, what a programme generally involves — answer it from your own knowledge anyway and note in one short clause that it is not from their documents. Never refuse a question for lack of context.",
    "Requirements vary by state, school and catalogue year; when that matters, say so in a clause rather than a paragraph, and name what the student should confirm.",
    "Be direct and specific. Plain text, no markdown, no bullet characters. Up to 160 words, shorter when a short answer will do.",
    "",
    "ESTABLISHED FACTS",
    contextFacts(st),
    "",
    "CONTEXT DOCUMENTS",
    ctx,
    "",
    `Question: ${q}`,
  ].join("\n");
}

export const CHAT_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    used_context: { type: "boolean", description: "true only if the context documents informed the answer" },
  },
  required: ["answer", "used_context"],
};

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
