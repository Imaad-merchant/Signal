import React, { useState, useCallback } from "react";
import { Sunrise, Moon, X, Check, Loader2, Plus, CalendarClock, Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getChicagoParts, getBriefingParts, briefingSlotKey } from "./checkinUtils";
import { enablePush, pushSupported } from "./push";

// Morning look-ahead + evening habit review, surfaced on /cowork.
// A top alert appears once per slot (morning / evening). Tapping it opens the panel
// and has Signal *speak* (via onSpeak → the orb) a briefing, then:
//   morning → reminders of what's on today
//   evening → habit yes/no logging (with streaks) + follow-up on today's unchecked tasks
// Habits are stored as Habit + HabitLog; the first evening seeds a starter set you edit.

const DEFAULT_HABITS = ["Stayed sober", "No vaping", "No smoking", "Went to the gym"];
const DONE_STATES = ["done", "completed"];
const DONE_KEY = "pulse_briefing_done"; // JSON array of finished slot keys

function readDone() {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || "[]"); } catch { return []; }
}
function markDone(slotKey) {
  try {
    const arr = readDone();
    if (!arr.includes(slotKey)) localStorage.setItem(DONE_KEY, JSON.stringify([...arr.slice(-8), slotKey]));
  } catch { /* ignore */ }
}
function prevDay(key) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function computeStreak(doneSet, today) {
  let day = doneSet.has(today) ? today : prevDay(today);
  let n = 0;
  while (doneSet.has(day)) { n++; day = prevDay(day); }
  return n;
}

export default function DailyBriefing({ onSpeak }) {
  // Slot is anchored to 6am / 6pm; the day for data queries is the actual today.
  const parts = getBriefingParts();
  const slot = parts.slot;
  const dateKey = getChicagoParts().dateKey;
  const slotKey = briefingSlotKey(parts);
  const [dismissed, setDismissed] = useState(() => readDone().includes(slotKey));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [reminders, setReminders] = useState([]); // morning
  const [habits, setHabits] = useState([]);        // evening: [{ id, name, question, done, streak }]
  const [incomplete, setIncomplete] = useState([]); // evening: [{ id, title, done }]
  const [newHabit, setNewHabit] = useState("");
  const [pushMsg, setPushMsg] = useState("");

  const onEnablePush = async () => {
    setPushMsg("…");
    const r = await enablePush();
    setPushMsg(r.ok ? "Reminders on ✓" : r.reason);
  };

  const isEvening = slot === "evening";
  const SlotIcon = isEvening ? Moon : Sunrise;

  const close = () => setOpen(false);
  const finish = () => { markDone(slotKey); setDismissed(true); setOpen(false); };

  // Gather everything, speak the briefing, and open the panel.
  const openBriefing = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    try {
      const today = dateKey;
      const [tasksRaw, commitsRaw, signalsRaw] = await Promise.all([
        base44.entities.Task.list("-created_date", 300).catch(() => []),
        base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
        base44.entities.Signal.list("-created_date", 60).catch(() => []),
      ]);
      const tasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      const commits = Array.isArray(commitsRaw) ? commitsRaw : [];
      const signals = Array.isArray(signalsRaw) ? signalsRaw : [];

      const dueToday = tasks.filter((t) => t && t.due_date === today && !DONE_STATES.includes(t.status));
      const events = signals
        .filter((s) => s && s.kind === "calendar" && s.occurred_at)
        .filter((s) => (s.occurred_at || "").slice(0, 10) >= today)
        .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at))
        .slice(0, 8);
      const important = signals.filter((s) => s && s.kind === "email").slice(0, 5);

      if (isEvening) {
        // Habits (seed a starter set the first time).
        let active = (await base44.entities.Habit.filter({ active: true }).catch(() => [])) || [];
        if (!Array.isArray(active) || active.length === 0) {
          const created = [];
          for (let i = 0; i < DEFAULT_HABITS.length; i++) {
            const name = DEFAULT_HABITS[i];
            const rec = await base44.entities.Habit.create({ name, question: `${name} today?`, active: true, sort_order: i + 1 }).catch(() => null);
            if (rec) created.push(rec);
          }
          active = created;
        }
        const logs = (await base44.entities.HabitLog.list("-date", 400).catch(() => [])) || [];
        const byName = {};
        for (const l of Array.isArray(logs) ? logs : []) {
          (byName[l.habit_name] = byName[l.habit_name] || []).push(l);
        }
        const hydrated = active
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((h) => {
            const list = byName[h.name] || [];
            const doneSet = new Set(list.filter((l) => l.done).map((l) => l.date));
            const todayLog = list.find((l) => l.date === today);
            return {
              id: h.id, name: h.name, question: h.question || `${h.name} today?`,
              done: todayLog ? !!todayLog.done : null, logId: todayLog?.id || null,
              streak: computeStreak(doneSet, today),
            };
          });
        setHabits(hydrated);
        setIncomplete(dueToday.map((t) => ({ id: t.id, title: t.title || "(task)", done: false })));

        const streaks = hydrated.filter((h) => h.streak > 0).map((h) => ({ name: h.name, days: h.streak }));
        const say = await fetchBriefing("evening", { today, incomplete: dueToday.map((t) => t.title), streaks });
        if (say && onSpeak) onSpeak(say);
      } else {
        const rem = [];
        for (const t of dueToday.slice(0, 8)) rem.push({ kind: "task", label: t.title || "(task)" });
        for (const e of events) rem.push({ kind: "event", label: `${e.title || "(event)"} — ${e.summary || ""}` });
        for (const c of commits.filter((c) => (c.due_on || today) <= today).slice(0, 5)) {
          rem.push({ kind: "commitment", label: c.text || "(commitment)" });
        }
        setReminders(rem);
        const say = await fetchBriefing("morning", {
          today,
          due_today: dueToday.map((t) => t.title),
          events: events.map((e) => `${e.title} ${e.summary || ""}`),
          commitments: commits.map((c) => c.text).filter(Boolean).slice(0, 10),
          important: important.map((s) => s.title).filter(Boolean),
        });
        if (say && onSpeak) onSpeak(say);
      }
    } catch { /* non-fatal */ }
    setLoading(false);
  }, [dateKey, isEvening, onSpeak]);

  async function fetchBriefing(s, context) {
    try {
      const res = await base44.functions.invoke("jarvis", { route: "briefing", slot: s, context });
      const data = res && res.data ? res.data : res || {};
      return data.say ? String(data.say) : "";
    } catch { return ""; }
  }

  // Log a habit yes/no for today (upsert).
  const setHabitDone = async (habit, done) => {
    setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, done } : h)));
    try {
      if (habit.logId) {
        await base44.entities.HabitLog.update(habit.logId, { done });
      } else {
        const rec = await base44.entities.HabitLog.create({ habit_name: habit.name, date: dateKey, done });
        if (rec?.id) setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, logId: rec.id } : h)));
      }
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, streak: h.streak + (done && h.done !== true ? 1 : 0) } : h)));
    } catch { /* ignore */ }
  };

  const addHabit = async (e) => {
    e.preventDefault();
    const name = newHabit.trim();
    if (!name) return;
    setNewHabit("");
    try {
      const rec = await base44.entities.Habit.create({ name, question: `${name} today?`, active: true, sort_order: habits.length + 1 });
      if (rec?.id) setHabits((prev) => [...prev, { id: rec.id, name, question: `${name} today?`, done: null, logId: null, streak: 0 }]);
    } catch { /* ignore */ }
  };

  const markTaskDone = async (item) => {
    setIncomplete((prev) => prev.map((x) => (x.id === item.id ? { ...x, done: true } : x)));
    try { await base44.entities.Task.update(item.id, { status: "done" }); } catch { /* ignore */ }
  };

  return (
    <>
      {/* Always-available manual trigger (on demand, any time). */}
      <button
        type="button"
        onClick={openBriefing}
        className="absolute top-4 left-16 z-20 rounded-full p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-blue-300"
        title={isEvening ? "Evening review" : "Morning briefing"}
        aria-label="Daily briefing"
      >
        <SlotIcon className="h-5 w-5" />
      </button>

      {!open && !dismissed && (
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5">
          <button
            type="button"
            onClick={openBriefing}
            className="flex items-center gap-2 rounded-full border border-blue-400/40 bg-blue-500/15 px-3.5 py-1.5 text-xs font-medium text-blue-100 shadow-lg backdrop-blur-sm hover:bg-blue-500/25 transition-colors"
          >
            <SlotIcon className="h-3.5 w-3.5" />
            {isEvening ? "Evening review — tap when ready" : "Good morning — tap for your briefing"}
          </button>
          <button type="button" onClick={() => { markDone(slotKey); setDismissed(true); }} aria-label="Dismiss" className="p-1 text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {open && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={close}>
          <div className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0e1015] p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                <SlotIcon className="h-4 w-4 text-blue-300" />
                {isEvening ? "Evening review" : "Morning briefing"}
              </h2>
              <button type="button" onClick={close} className="p-1 text-gray-500 hover:text-gray-200" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            {loading && <div className="flex items-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Pulling your day together…</div>}

            {!loading && !isEvening && (
              <div className="flex flex-col gap-2">
                {reminders.length === 0 && <p className="py-4 text-sm text-gray-500">Nothing on the books today — a clear run.</p>}
                {reminders.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm text-gray-200">
                    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-300" />
                    <span>{r.label}</span>
                  </div>
                ))}
              </div>
            )}

            {!loading && isEvening && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  {habits.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-gray-200">{h.question}</div>
                        {h.streak > 0 && <div className="text-[11px] text-emerald-400">🔥 {h.streak}-day streak</div>}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button type="button" onClick={() => setHabitDone(h, true)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${h.done === true ? "bg-emerald-500 text-white" : "border border-white/10 text-gray-300 hover:border-emerald-400/40"}`}>Yes</button>
                        <button type="button" onClick={() => setHabitDone(h, false)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${h.done === false ? "bg-gray-600 text-white" : "border border-white/10 text-gray-400 hover:border-white/25"}`}>No</button>
                      </div>
                    </div>
                  ))}
                  <form onSubmit={addHabit} className="flex items-center gap-2">
                    <input value={newHabit} onChange={(e) => setNewHabit(e.target.value)} placeholder="Track another habit…" className="flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25" />
                    <button type="submit" disabled={!newHabit.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-gray-200 disabled:opacity-40 hover:bg-white/15" aria-label="Add habit"><Plus className="h-4 w-4" /></button>
                  </form>
                </div>

                {incomplete.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Still open from today</div>
                    <div className="flex flex-col gap-1.5">
                      {incomplete.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm">
                          <span className={item.done ? "text-gray-500 line-through" : "text-gray-200"}>{item.title}</span>
                          <button type="button" onClick={() => markTaskDone(item)} disabled={item.done} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${item.done ? "text-emerald-400" : "border border-white/10 text-gray-300 hover:border-emerald-400/40"}`}>
                            <Check className="h-3 w-3" /> {item.done ? "Done" : "Did it"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loading && (
              <div className="mt-4 flex items-center justify-between gap-2">
                {pushSupported() ? (
                  <button type="button" onClick={onEnablePush} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-blue-400/40">
                    <Bell className="h-3.5 w-3.5" /> {pushMsg || "Get 6am & 6pm reminders"}
                  </button>
                ) : <span />}
                <button type="button" onClick={finish} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                  {isEvening ? "Done for tonight" : "Got it"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
