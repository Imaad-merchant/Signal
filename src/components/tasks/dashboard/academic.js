// Pure academic-dashboard logic: grade scale, persistence shape, GPA math.
//
// Deliberately React-free so it can be unit-tested straight from node:
//   node --input-type=module -e "const m = await import('./src/components/tasks/dashboard/academic.js'); ..."
// Keep new domain logic here rather than in DashboardView.jsx for exactly that reason.

// Standard UNWEIGHTED 4.0 scale with +/-. Honors/AP are not weighted above 4.0 —
// the UI says so, so a 4.3 school can't silently read the wrong number.
export const GRADE_POINTS = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0,
};

// Grades that sit outside the GPA. `credit: true` still counts toward credits earned.
export const NON_GPA_GRADES = {
  P: { label: "Pass", credit: true },
  CR: { label: "Credit", credit: true },
  TR: { label: "Transfer", credit: true },
  NP: { label: "No pass", credit: false },
  NC: { label: "No credit", credit: false },
  W: { label: "Withdrawn", credit: false },
  I: { label: "Incomplete", credit: false },
  AU: { label: "Audit", credit: false },
};

export const GRADE_OPTIONS = [...Object.keys(GRADE_POINTS), ...Object.keys(NON_GPA_GRADES)];

export const STATUSES = [
  { key: "completed", label: "Completed" },
  { key: "in_progress", label: "In progress" },
  { key: "planned", label: "Planned" },
];

export const DEFAULT_TARGET_CREDITS = 120;

export const EMPTY_STATE = {
  kind: "academic",
  scale: "4.0",
  target_credits: DEFAULT_TARGET_CREDITS,
  courses: [],
};

const normGrade = (g) => String(g || "").trim().toUpperCase();

export function gradePoints(grade) {
  const g = normGrade(grade);
  return Object.prototype.hasOwnProperty.call(GRADE_POINTS, g) ? GRADE_POINTS[g] : null;
}

// Does this grade earn its credits? Letter grades above F do; P/CR/TR do; the rest don't.
export function earnsCredit(grade) {
  const g = normGrade(grade);
  if (Object.prototype.hasOwnProperty.call(NON_GPA_GRADES, g)) return NON_GPA_GRADES[g].credit;
  const pts = gradePoints(g);
  return pts !== null && pts > 0;
}

const toCredits = (c) => {
  const n = typeof c === "number" ? c : parseFloat(c);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const round2 = (n) => Math.round(n * 100) / 100;

// Tolerant parse — a page that was never opened, hand-edited, or written by an older
// build must never blow up the view. Anything unusable falls back to the empty state.
export function parseDashboard(raw) {
  let data = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ...EMPTY_STATE, courses: [] };
    try { data = JSON.parse(raw); } catch { return { ...EMPTY_STATE, courses: [] }; }
  }
  if (!data || typeof data !== "object") return { ...EMPTY_STATE, courses: [] };
  const target = toCredits(data.target_credits);
  return {
    kind: data.kind || "academic",
    scale: data.scale || "4.0",
    target_credits: target > 0 ? target : DEFAULT_TARGET_CREDITS,
    courses: Array.isArray(data.courses) ? data.courses.filter((c) => c && typeof c === "object").map(normalizeCourse) : [],
  };
}

export function serializeDashboard(state) {
  return JSON.stringify({
    kind: "academic",
    scale: state.scale || "4.0",
    target_credits: toCredits(state.target_credits) || DEFAULT_TARGET_CREDITS,
    courses: (state.courses || []).map(normalizeCourse),
  });
}

let seq = 0;
export function newCourseId() {
  seq += 1;
  return `c_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export function normalizeCourse(c = {}) {
  const status = STATUSES.some((s) => s.key === c.status) ? c.status : "planned";
  return {
    id: c.id || newCourseId(),
    term: c.term == null ? "" : String(c.term),
    code: c.code == null ? "" : String(c.code),
    name: c.name == null ? "" : String(c.name),
    credits: toCredits(c.credits),
    // Only a completed course carries a grade; clearing it on the others keeps a
    // course that moves back to "planned" from silently staying in the GPA.
    grade: status === "completed" ? normGrade(c.grade) : "",
    status,
    category: c.category == null ? "" : String(c.category),
  };
}

export function blankCourse(status = "planned") {
  return normalizeCourse({ id: newCourseId(), status, credits: 3 });
}

// GPA over a set of courses: only COMPLETED courses with a letter grade count.
// Returns null when nothing is graded yet (vs 0.0, which means straight F's).
export function gpaOf(courses) {
  let points = 0;
  let credits = 0;
  for (const c of courses || []) {
    if (c.status !== "completed") continue;
    const pts = gradePoints(c.grade);
    if (pts === null) continue;
    const cr = toCredits(c.credits);
    if (cr <= 0) continue;
    points += pts * cr;
    credits += cr;
  }
  if (credits <= 0) return { gpa: null, gradedCredits: 0, qualityPoints: 0 };
  return { gpa: round2(points / credits), gradedCredits: round2(credits), qualityPoints: round2(points) };
}

// Everything the dashboard header and term tables need, in one pass.
export function computeStats(courses = [], targetCredits = DEFAULT_TARGET_CREDITS) {
  const list = (courses || []).map(normalizeCourse);
  const cum = gpaOf(list);

  let creditsEarned = 0;
  let creditsInProgress = 0;
  let creditsPlanned = 0;
  const byCategory = {};
  const termMap = new Map();

  for (const c of list) {
    const cr = toCredits(c.credits);
    if (c.status === "completed" && earnsCredit(c.grade)) creditsEarned += cr;
    else if (c.status === "in_progress") creditsInProgress += cr;
    else if (c.status === "planned") creditsPlanned += cr;

    const cat = c.category.trim() || "Uncategorized";
    const bucket = byCategory[cat] || (byCategory[cat] = { category: cat, earned: 0, inProgress: 0, planned: 0, courses: 0 });
    bucket.courses += 1;
    if (c.status === "completed" && earnsCredit(c.grade)) bucket.earned += cr;
    else if (c.status === "in_progress") bucket.inProgress += cr;
    else if (c.status === "planned") bucket.planned += cr;

    const termKey = c.term.trim() || "Unassigned";
    if (!termMap.has(termKey)) termMap.set(termKey, []);
    termMap.get(termKey).push(c);
  }

  const terms = [...termMap.entries()].map(([term, termCourses]) => {
    const t = gpaOf(termCourses);
    return {
      term,
      courses: termCourses,
      gpa: t.gpa,
      gradedCredits: t.gradedCredits,
      credits: round2(termCourses.reduce((s, c) => s + toCredits(c.credits), 0)),
    };
  }).sort((a, b) => termSortKey(b.term) - termSortKey(a.term) || a.term.localeCompare(b.term));

  const target = toCredits(targetCredits) || DEFAULT_TARGET_CREDITS;
  return {
    cumulativeGpa: cum.gpa,
    gradedCredits: cum.gradedCredits,
    qualityPoints: cum.qualityPoints,
    creditsEarned: round2(creditsEarned),
    creditsInProgress: round2(creditsInProgress),
    creditsPlanned: round2(creditsPlanned),
    creditsRemaining: round2(Math.max(0, target - creditsEarned)),
    // Earned + in-progress + planned vs the target: "is my plan enough to graduate?"
    creditsShortfall: round2(Math.max(0, target - (creditsEarned + creditsInProgress + creditsPlanned))),
    targetCredits: target,
    percentComplete: target > 0 ? Math.min(100, Math.round((creditsEarned / target) * 100)) : 0,
    totalCourses: list.length,
    byCategory: Object.values(byCategory).sort((a, b) => b.earned - a.earned || a.category.localeCompare(b.category)),
    terms,
  };
}

// Sort terms newest-first by a rough "Fall 2025" / "2025 Spring" / "Sem 3" reading.
// Unparseable terms sort last (key -1) and then alphabetically.
const SEASON_ORDER = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };
export function termSortKey(term) {
  const s = String(term || "").toLowerCase();
  const yearMatch = s.match(/(19|20)\d{2}/);
  if (!yearMatch) {
    const n = s.match(/\d+/);
    return n ? parseInt(n[0], 10) : -1;
  }
  const year = parseInt(yearMatch[0], 10);
  let season = 0;
  for (const [key, val] of Object.entries(SEASON_ORDER)) {
    if (s.includes(key)) { season = val; break; }
  }
  return year * 10 + season;
}

// What GPA the remaining graded credits must average to hit a target cumulative GPA.
// null when there's nothing left to grade. Can legitimately exceed 4.0 (= unreachable).
export function requiredGpaForTarget(courses, targetGpa, plannedCredits) {
  const cum = gpaOf(courses);
  const remaining = toCredits(plannedCredits);
  if (remaining <= 0) return null;
  const totalCredits = cum.gradedCredits + remaining;
  const needed = targetGpa * totalCredits - cum.qualityPoints;
  return round2(needed / remaining);
}

export function formatGpa(gpa) {
  return gpa === null || gpa === undefined ? "—" : gpa.toFixed(2);
}
