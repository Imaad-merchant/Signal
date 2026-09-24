import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, GraduationCap, Target, TrendingUp, BookOpen, AlertTriangle, LayoutList, CalendarDays } from "lucide-react";
import { useAutosave } from "./useAutosave";
import {
  parseDashboard,
  serializeDashboard,
  computeStats,
  blankCourse,
  normalizeCourse,
  requiredGpaForTarget,
  formatGpa,
  GRADE_POINTS,
  NON_GPA_GRADES,
  STATUSES,
} from "./dashboard/academic";

const STATUS_STYLE = {
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  in_progress: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  planned: "bg-white/[0.05] text-gray-400 border-white/[0.09]",
};

function StatTile({ icon: Icon, label, value, sub, accent = "text-gray-100" }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${accent}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p> : null}
    </div>
  );
}

// Borderless cell input so the table reads like a spreadsheet, not a form.
function Cell({ value, onChange, placeholder, className = "", type = "text", ...rest }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-transparent px-2 py-1.5 text-[13px] text-gray-200 placeholder-gray-600 rounded focus:outline-none focus:bg-white/[0.05] ${className}`}
      {...rest}
    />
  );
}

function CourseRow({ course, onChange, onDelete }) {
  const set = (patch) => onChange(normalizeCourse({ ...course, ...patch }));
  return (
    <tr className="border-t border-white/[0.04] hover:bg-white/[0.02] group">
      <td className="w-[120px]"><Cell value={course.term} onChange={(v) => set({ term: v })} placeholder="Fall 2025" /></td>
      <td className="w-[110px]"><Cell value={course.code} onChange={(v) => set({ code: v })} placeholder="CS 101" className="font-medium" /></td>
      <td><Cell value={course.name} onChange={(v) => set({ name: v })} placeholder="Course name" /></td>
      <td className="w-[120px]"><Cell value={course.category} onChange={(v) => set({ category: v })} placeholder="Major" /></td>
      <td className="w-[70px]">
        <Cell type="number" min="0" step="0.5" value={course.credits} onChange={(v) => set({ credits: v })} placeholder="3" className="text-right tabular-nums" />
      </td>
      <td className="w-[120px]">
        <select
          value={course.status}
          onChange={(e) => set({ status: e.target.value })}
          className={`w-full rounded-md border px-2 py-1 text-[11.5px] focus:outline-none ${STATUS_STYLE[course.status]}`}
        >
          {STATUSES.map((s) => <option key={s.key} value={s.key} className="bg-[#1e1f20] text-gray-200">{s.label}</option>)}
        </select>
      </td>
      <td className="w-[86px]">
        {course.status === "completed" ? (
          <select
            value={course.grade}
            onChange={(e) => set({ grade: e.target.value })}
            className="w-full rounded-md border border-white/[0.09] bg-white/[0.03] px-2 py-1 text-[11.5px] text-gray-200 focus:outline-none"
          >
            <option value="" className="bg-[#1e1f20]">—</option>
            {Object.keys(GRADE_POINTS).map((g) => <option key={g} value={g} className="bg-[#1e1f20]">{g}</option>)}
            {Object.keys(NON_GPA_GRADES).map((g) => <option key={g} value={g} className="bg-[#1e1f20]">{g}</option>)}
          </select>
        ) : (
          <span className="block px-2 text-[11.5px] text-gray-600">—</span>
        )}
      </td>
      <td className="w-[36px]">
        <button
          onClick={() => onDelete(course.id)}
          title="Remove course"
          className="p-1.5 rounded text-gray-600 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-white/[0.05] transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function CourseTable({ courses, onChange, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.015]">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-gray-500">
            <th className="px-2 py-2 text-left font-medium">Term</th>
            <th className="px-2 py-2 text-left font-medium">Code</th>
            <th className="px-2 py-2 text-left font-medium">Course</th>
            <th className="px-2 py-2 text-left font-medium">Category</th>
            <th className="px-2 py-2 text-right font-medium">Cr</th>
            <th className="px-2 py-2 text-left font-medium">Status</th>
            <th className="px-2 py-2 text-left font-medium">Grade</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => <CourseRow key={c.id} course={c} onChange={onChange} onDelete={onDelete} />)}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardView({ page, onSave }) {
  const [state, setState] = useState(() => parseDashboard(page.dashboard));
  const [groupBy, setGroupBy] = useState("term"); // "term" | "status"
  const [targetGpa, setTargetGpa] = useState(() => {
    try { return localStorage.getItem("pulse_dashboard_target_gpa") || "3.5"; } catch { return "3.5"; }
  });
  const loadedRef = useRef(false);

  // Bound to THIS page's id (the component is keyed per page.id), so a debounced
  // write that lands after a page switch still targets the right dashboard.
  const save = useCallback((patch) => onSave(page.id, patch), [onSave, page.id]);
  const { schedule } = useAutosave(500);

  useEffect(() => {
    setState(parseDashboard(page.dashboard));
    loadedRef.current = true;
  }, [page.id]);

  useEffect(() => {
    try { localStorage.setItem("pulse_dashboard_target_gpa", targetGpa); } catch { /* ignore */ }
  }, [targetGpa]);

  // Every mutation goes through here so nothing can change state without scheduling a save.
  const commit = useCallback((next) => {
    setState(next);
    if (loadedRef.current) schedule({ dashboard: serializeDashboard(next) }, save);
  }, [schedule, save]);

  const updateCourse = useCallback((course) => {
    commit({ ...state, courses: state.courses.map((c) => (c.id === course.id ? course : c)) });
  }, [commit, state]);

  const deleteCourse = useCallback((id) => {
    commit({ ...state, courses: state.courses.filter((c) => c.id !== id) });
  }, [commit, state]);

  const addCourse = useCallback((status = "planned") => {
    // Seed the term from the most recent row so adding a semester isn't all retyping.
    const last = state.courses[state.courses.length - 1];
    const seeded = { ...blankCourse(status), term: last ? last.term : "" };
    commit({ ...state, courses: [...state.courses, seeded] });
  }, [commit, state]);

  const stats = useMemo(() => computeStats(state.courses, state.target_credits), [state.courses, state.target_credits]);

  const plannedAhead = stats.creditsInProgress + stats.creditsPlanned;
  const needed = useMemo(() => {
    const t = parseFloat(targetGpa);
    if (!Number.isFinite(t)) return null;
    return requiredGpaForTarget(state.courses, t, plannedAhead);
  }, [state.courses, targetGpa, plannedAhead]);

  const groups = useMemo(() => {
    if (groupBy === "status") {
      return STATUSES.map((s) => ({
        key: s.key,
        label: s.label,
        meta: `${state.courses.filter((c) => c.status === s.key).reduce((n, c) => n + c.credits, 0)} cr`,
        courses: state.courses.filter((c) => c.status === s.key),
      })).filter((g) => g.courses.length);
    }
    return stats.terms.map((t) => ({
      key: t.term,
      label: t.term,
      meta: `${t.credits} cr${t.gpa === null ? "" : ` · GPA ${formatGpa(t.gpa)}`}`,
      courses: t.courses,
    }));
  }, [groupBy, state.courses, stats.terms]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={GraduationCap}
            label="Cumulative GPA"
            value={formatGpa(stats.cumulativeGpa)}
            sub={`${stats.gradedCredits} graded cr · unweighted 4.0`}
            accent={stats.cumulativeGpa === null ? "text-gray-500" : "text-blue-300"}
          />
          <StatTile
            icon={BookOpen}
            label="Credits earned"
            value={stats.creditsEarned}
            sub={`of ${stats.targetCredits} · ${stats.percentComplete}% done`}
            accent="text-emerald-300"
          />
          <StatTile icon={TrendingUp} label="In progress" value={stats.creditsInProgress} sub={`${stats.creditsPlanned} cr planned`} />
          <StatTile icon={Target} label="Still to take" value={stats.creditsRemaining} sub={`${stats.totalCourses} courses tracked`} />
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
          <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${stats.percentComplete}%` }} />
        </div>

        {/* Targets */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <label className="flex items-center gap-2 text-[12px] text-gray-400">
            Degree credits
            <input
              type="number"
              min="0"
              value={state.target_credits}
              onChange={(e) => commit({ ...state, target_credits: e.target.value })}
              className="w-20 rounded-md border border-white/[0.09] bg-white/[0.03] px-2 py-1 text-[12.5px] tabular-nums text-gray-200 focus:outline-none focus:border-blue-500/40"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-gray-400">
            Target GPA
            <input
              type="number"
              min="0"
              max="4"
              step="0.1"
              value={targetGpa}
              onChange={(e) => setTargetGpa(e.target.value)}
              className="w-20 rounded-md border border-white/[0.09] bg-white/[0.03] px-2 py-1 text-[12.5px] tabular-nums text-gray-200 focus:outline-none focus:border-blue-500/40"
            />
          </label>
          <p className="text-[12px] text-gray-400">
            {needed === null ? (
              <span className="text-gray-600">Add in-progress or planned courses to see what you need to average.</span>
            ) : needed > 4 ? (
              <span className="text-amber-300">Not reachable — {plannedAhead} remaining credits would need a {formatGpa(needed)} average.</span>
            ) : needed <= 0 ? (
              <span className="text-emerald-300">Already there — your target holds even at a 0.0 across the remaining {plannedAhead} credits.</span>
            ) : (
              <>Need a <span className="font-medium text-gray-100">{formatGpa(needed)}</span> average across the remaining {plannedAhead} credits.</>
            )}
          </p>
          {stats.creditsShortfall > 0 ? (
            <p className="flex items-center gap-1.5 text-[12px] text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {stats.creditsShortfall} credits short of the degree — plan more courses.
            </p>
          ) : null}
        </div>

        {/* Courses */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-gray-200">Courses</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/[0.07] p-0.5">
              {[
                { key: "term", label: "By term", icon: CalendarDays },
                { key: "status", label: "By status", icon: LayoutList },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setGroupBy(opt.key)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] transition ${groupBy === opt.key ? "bg-white/[0.08] text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => addCourse("planned")}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[12px] text-blue-300 hover:bg-blue-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Add course
            </button>
          </div>
        </div>

        {state.courses.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/[0.09] py-14 text-center">
            <GraduationCap className="mx-auto mb-3 h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-400">No courses yet</p>
            <p className="mt-1 text-[12px] text-gray-600">Add the classes you have taken and the ones you still need — GPA and credits update as you go.</p>
            <button
              onClick={() => addCourse("completed")}
              className="mt-4 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[12px] text-gray-300 hover:bg-white/[0.06]"
            >
              Add your first course
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-5">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <h3 className="text-[12.5px] font-medium text-gray-300">{g.label}</h3>
                  <span className="text-[11px] text-gray-600">{g.meta}</span>
                </div>
                <CourseTable courses={g.courses} onChange={updateCourse} onDelete={deleteCourse} />
              </div>
            ))}
          </div>
        )}

        {/* Category rollup */}
        {stats.byCategory.length > 0 ? (
          <div className="mt-7">
            <h2 className="mb-2 text-sm font-medium text-gray-200">By category</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stats.byCategory.map((c) => (
                <div key={c.category} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                  <p className="text-[12.5px] text-gray-200">{c.category}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    <span className="text-emerald-300">{c.earned} earned</span>
                    {c.inProgress ? <span className="text-blue-300"> · {c.inProgress} in progress</span> : null}
                    {c.planned ? <span> · {c.planned} planned</span> : null}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-8 text-[11px] leading-relaxed text-gray-600">
          GPA uses the standard unweighted 4.0 scale with +/− (A = 4.0, A− = 3.7, B+ = 3.3 … F = 0.0).
          Honors and AP courses are not weighted above 4.0. P/CR/TR earn credit but stay out of the GPA;
          W, I, NP, NC and AU affect neither. Nothing here syncs with a school registrar — it is what you enter.
        </p>
      </div>
    </div>
  );
}
