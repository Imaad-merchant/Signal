import React, { useState, useEffect, useRef } from "react";
import { Sunrise, Moon, X, Check, Loader2, Plus, CalendarClock, Bell, Mic } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getChicagoParts, getBriefingParts, briefingSlotKey } from "./checkinUtils";
import { enablePush, pushSupported } from "./push";
import ContributionStrip from "./ContributionStrip";

// Morning look-ahead + evening habit review, surfaced on /cowork.
// A top alert appears once per slot. Tapping it runs a SPOKEN flow: Donna reads
// the briefing aloud (captions at the top), and for the evening review she asks
// each habit in turn — the questions sit in a list on the right that you can TAP
// or answer by VOICE ("yes"/"no"), and each answer animates as it logs.

const DEFAULT_HABITS = ["Stayed sober", "No vaping", "No smoking", "Went to the gym"];
const DONE_STATES = ["done", "completed"];
const DONE_KEY = "pulse_briefing_done";

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
// The last `count` days ending at `endKey`, oldest → newest, classified for the
// contribution strip: done / logged-miss / no-log.
function buildHistory(logList, endKey, count) {
  const doneSet = new Set(logList.filter((l) => l.done).map((l) => l.date));
  const anySet = new Set(logList.map((l) => l.date));
  const days = [];
  let day = endKey;
  for (let i = 0; i < count; i++) { days.push(day); day = prevDay(day); }
  days.reverse();
  return days.map((date) => ({ date, state: doneSet.has(date) ? "done" : anySet.has(date) ? "miss" : "none" }));
}
// Turn active habits + their logs into the review's per-habit view model, keyed to
// the day being logged (`endKey`): today for the evening, yesterday for the morning
// catch-up. `whenWord` phrases the question ("today?" vs "yesterday?").
function hydrateHabits(active, logs, endKey, whenWord) {
  const byName = {};
  for (const l of Array.isArray(logs) ? logs : []) (byName[l.habit_name] = byName[l.habit_name] || []).push(l);
  return active
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((h) => {
      const list = byName[h.name] || [];
      const doneSet = new Set(list.filter((l) => l.done).map((l) => l.date));
      const dayLog = list.find((l) => l.date === endKey);
      const base = h.question || `${h.name} today?`;
      const question = whenWord === "yesterday" ? base.replace(/\btoday\b/i, "yesterday") : base;
      return {
        id: h.id, name: h.name, question,
        done: dayLog ? !!dayLog.done : null, logId: dayLog?.id || null,
        streak: computeStreak(doneSet, endKey),
        history: buildHistory(list, endKey, 21),
        justLogged: false,
      };
    });
}
function speechAvailable() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}
function parseYesNo(text) {
  const t = (text || "").toLowerCase();
  if (/\b(skip|next|pass|dunno|not sure)\b/.test(t)) return "skip";
  if (/\b(yes|yeah|yep|yup|ya|did|done|sure|affirmative|correct|i did|of course|absolutely)\b/.test(t)) return "yes";
  if (/\b(no|nope|nah|didn'?t|did not|negative|never|unfortunately)\b/.test(t)) return "no";
  return null;
}

export default function DailyBriefing({ onSpeak, onActive }) {
  const parts = getBriefingParts();
  const slot = parts.slot;
  const dateKey = getChicagoParts().dateKey;
  const slotKey = briefingSlotKey(parts);
  const isEvening = slot === "evening";
  const SlotIcon = isEvening ? Moon : Sunrise;

  const [dismissed, setDismissed] = useState(() => readDone().includes(slotKey));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [habits, setHabits] = useState([]);
  const [incomplete, setIncomplete] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [pushMsg, setPushMsg] = useState("");

  const openRef = useRef(false);
  const habitsRef = useRef([]);
  const answerRef = useRef(null); // { id, resolve }
  const recRef = useRef(null);
  const logDateRef = useRef(dateKey); // the day answers are logged against (today, or yesterday for catch-up)
  useEffect(() => { habitsRef.current = habits; }, [habits]);
  useEffect(() => () => {
    try { recRef.current && recRef.current.stop(); } catch { /* ignore */ }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }, []);

  // Speak a line (caption + orb TTS) and wait for it to finish.
  const say = async (text) => {
    setCaption(text || "");
    if (text && onSpeak) { try { await onSpeak(text); } catch { /* ignore */ } }
  };

  async function fetchBriefing(s, context) {
    try {
      const res = await base44.functions.invoke("donna", { route: "briefing", slot: s, context });
      const data = res && res.data ? res.data : res || {};
      return data.say ? String(data.say) : "";
    } catch { return ""; }
  }

  // Mark automation reports as read so they aren't repeated next briefing.
  async function markReportsAnnounced(list) {
    await Promise.all((list || []).map((r) =>
      base44.entities.Report.update(r.id, { announced: true }).catch(() => null)));
  }

  // ---- logging (with a brief "just logged" animation flag + strip update) ----
  const logHabit = async (habit, done) => {
    const logDate = logDateRef.current;
    setHabits((prev) => prev.map((x) => {
      if (x.id !== habit.id) return x;
      const history = Array.isArray(x.history)
        ? x.history.map((c) => (c.date === logDate ? { ...c, state: done ? "done" : "miss" } : c))
        : x.history;
      return { ...x, done, justLogged: true, history, streak: x.streak + (done && x.done !== true ? 1 : 0) };
    }));
    window.setTimeout(() => {
      setHabits((prev) => prev.map((x) => (x.id === habit.id ? { ...x, justLogged: false } : x)));
    }, 1400);
    try {
      if (habit.logId) {
        await base44.entities.HabitLog.update(habit.logId, { done });
      } else {
        const rec = await base44.entities.HabitLog.create({ habit_name: habit.name, date: logDate, done });
        if (rec?.id) setHabits((prev) => prev.map((x) => (x.id === habit.id ? { ...x, logId: rec.id } : x)));
      }
    } catch { /* ignore */ }
  };

  // ---- voice answer for the current question ----
  const stopListen = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) { try { rec.onend = null; rec.stop(); } catch { /* ignore */ } }
  };
  const startListen = (id) => {
    if (!speechAvailable()) return; // tap-only fallback
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-GB";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + " ";
      if (!answerRef.current || answerRef.current.id !== id) return;
      const val = parseYesNo(txt);
      if (val === "yes" || val === "no") {
        const h = habitsRef.current.find((x) => x.id === id);
        if (h) logHabit(h, val === "yes");
        resolveAnswer(id, val);
      } else if (val === "skip") {
        resolveAnswer(id, "skip");
      }
      // no clear yes/no → onend restarts the listen
    };
    rec.onerror = () => { /* onend handles restart */ };
    rec.onend = () => {
      if (answerRef.current && answerRef.current.id === id && openRef.current) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    recRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  };
  const waitForAnswer = (id) => new Promise((resolve) => {
    answerRef.current = { id, resolve };
    startListen(id);
  });
  const resolveAnswer = (id, val) => {
    stopListen();
    const r = answerRef.current;
    answerRef.current = null;
    if (r && r.id === id) r.resolve(val);
  };

  // Tapping Yes/No logs, and (if it's the question being asked) advances the flow.
  const handleTap = async (h, done) => {
    await logHabit(h, done);
    if (answerRef.current && answerRef.current.id === h.id) resolveAnswer(h.id, done ? "yes" : "no");
  };

  // ---- the spoken habit flow (evening review, or morning catch-up) ----
  const runHabitFlow = async (introText, list, closing) => {
    await say(introText || "Right — let's run through your day.");
    for (const h of list) {
      if (!openRef.current) break;
      const cur = habitsRef.current.find((x) => x.id === h.id);
      if (cur && cur.done != null) continue; // already answered by tapping ahead
      setCurrentId(h.id);
      await say(h.question);
      if (!openRef.current) break;
      await waitForAnswer(h.id);
    }
    setCurrentId(null);
    if (openRef.current && closing) await say(closing);
  };

  // Gather data, then either read the morning briefing or run the evening flow.
  const openBriefing = async () => {
    setOpen(true); openRef.current = true;
    onActive && onActive(true); // pause the page's always-on listener during the review
    setLoading(true); setCaption(""); setCurrentId(null);
    try {
      const today = dateKey;
      const [tasksRaw, commitsRaw, signalsRaw, reportsRaw] = await Promise.all([
        base44.entities.Task.list("-created_date", 300).catch(() => []),
        base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
        base44.entities.Signal.list("-created_date", 60).catch(() => []),
        base44.entities.Report.list("-created_date", 40).catch(() => []),
      ]);
      const tasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      const commits = Array.isArray(commitsRaw) ? commitsRaw : [];
      const signals = Array.isArray(signalsRaw) ? signalsRaw : [];

      // Automation reports not yet read aloud — Donna recaps these in the briefing.
      const freshReports = (Array.isArray(reportsRaw) ? reportsRaw : []).filter((r) => r && !r.announced);
      const automations = freshReports.slice(0, 12).map((r) => ({
        source: r.source || "automation", title: r.title || "", summary: r.summary || "", ok: r.ok !== false,
      }));

      const dueToday = tasks.filter((t) => t && t.due_date === today && !DONE_STATES.includes(t.status));
      const events = signals
        .filter((s) => s && s.kind === "calendar" && s.occurred_at)
        .filter((s) => (s.occurred_at || "").slice(0, 10) >= today)
        .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at))
        .slice(0, 8);
      const important = signals.filter((s) => s && s.kind === "email").slice(0, 5);

      if (isEvening) {
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
        logDateRef.current = today;
        const hydrated = hydrateHabits(active, logs, today, "today");
        setHabits(hydrated); habitsRef.current = hydrated;
        setIncomplete(dueToday.map((t) => ({ id: t.id, title: t.title || "(task)", done: false })));
        setLoading(false);

        const streaks = hydrated.filter((h) => h.streak > 0).map((h) => ({ name: h.name, days: h.streak }));
        const remindGrades = (() => { try { return localStorage.getItem("donna_grade_nudge") !== "0"; } catch { return true; } })();
        const intro = await fetchBriefing("evening", { today, incomplete: dueToday.map((t) => t.title), streaks, automations, remind_grades: remindGrades });
        markReportsAnnounced(freshReports);
        await runHabitFlow(intro, hydrated, "That's you logged — nicely done.");
      } else {
        const rem = [];
        for (const t of dueToday.slice(0, 8)) rem.push({ kind: "task", label: t.title || "(task)" });
        for (const e of events) rem.push({ kind: "event", label: `${e.title || "(event)"} — ${e.summary || ""}` });
        for (const c of commits.filter((c) => (c.due_on || today) <= today).slice(0, 5)) rem.push({ kind: "commitment", label: c.text || "(commitment)" });
        setReminders(rem);
        setLoading(false);
        const morningSay = await fetchBriefing("morning", {
          today,
          due_today: dueToday.map((t) => t.title),
          events: events.map((e) => `${e.title} ${e.summary || ""}`),
          commitments: commits.map((c) => c.text).filter(Boolean).slice(0, 10),
          important: important.map((s) => s.title).filter(Boolean),
          automations,
          remind_grades: (() => { try { return localStorage.getItem("donna_grade_nudge") !== "0"; } catch { return true; } })(),
        });
        markReportsAnnounced(freshReports);
        await say(morningSay || "Here's what's on today.");

        // Catch-up: only log yesterday if nothing was logged the night before.
        if (openRef.current) {
          const yesterday = prevDay(today);
          const active = (await base44.entities.Habit.filter({ active: true }).catch(() => [])) || [];
          if (Array.isArray(active) && active.length) {
            const logs = (await base44.entities.HabitLog.list("-date", 400).catch(() => [])) || [];
            const loggedYesterday = (Array.isArray(logs) ? logs : []).some((l) => l.date === yesterday);
            if (!loggedYesterday && openRef.current) {
              logDateRef.current = yesterday;
              const hydrated = hydrateHabits(active, logs, yesterday, "yesterday");
              setHabits(hydrated); habitsRef.current = hydrated;
              await runHabitFlow(
                "Before we get into today — you didn't log last night, so let's catch up on yesterday.",
                hydrated,
                "Lovely — yesterday's logged. Have a good one.",
              );
              logDateRef.current = today;
            }
          }
        }
      }
    } catch { setLoading(false); }
  };

  const addHabit = async (e) => {
    e.preventDefault();
    const name = newHabit.trim();
    if (!name) return;
    setNewHabit("");
    try {
      const rec = await base44.entities.Habit.create({ name, question: `${name} today?`, active: true, sort_order: habits.length + 1 });
      if (rec?.id) setHabits((prev) => [...prev, { id: rec.id, name, question: `${name} today?`, done: null, logId: null, streak: 0, justLogged: false }]);
    } catch { /* ignore */ }
  };

  const markTaskDone = async (item) => {
    setIncomplete((prev) => prev.map((x) => (x.id === item.id ? { ...x, done: true } : x)));
    try { await base44.entities.Task.update(item.id, { status: "done" }); } catch { /* ignore */ }
  };

  const onEnablePush = async () => {
    setPushMsg("…");
    const r = await enablePush();
    setPushMsg(r.ok ? "Reminders on ✓" : r.reason);
  };

  // End the review (stop voice + TTS, resolve any pending question).
  const endReview = (done) => {
    openRef.current = false;
    onActive && onActive(false); // resume the page's always-on listener
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* ignore */ }
    stopListen();
    if (answerRef.current) { const r = answerRef.current; answerRef.current = null; r.resolve("skip"); }
    setCurrentId(null); setCaption("");
    if (done) { markDone(slotKey); setDismissed(true); }
    setOpen(false);
  };

  return (
    <>
      {/* One clean prompt: Donna offers the briefing; tap to hear it. No stray icon
          button — this pill (styled like the proactive nudge) is the single trigger. */}
      {!open && !dismissed && (
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5">
          <button
            type="button"
            onClick={openBriefing}
            className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-3.5 py-1.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur-sm hover:bg-amber-400/25 transition-colors"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            {isEvening ? "Evening review — tap when ready" : "Good morning — tap for your briefing"}
          </button>
          <button type="button" onClick={() => { markDone(slotKey); setDismissed(true); }} aria-label="Dismiss" className="p-1 text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {open && (
        <>
          {/* Donna's words are shown by the main page caption (avoid a duplicate box);
              here we only surface a loading state and the yes/no hint. */}
          {(loading || currentId) && (
            <div className="pointer-events-none absolute top-16 left-1/2 z-[45] w-[min(92vw,640px)] -translate-x-1/2 px-4 text-center">
              {loading && <p className="inline-flex items-center gap-2 rounded-2xl bg-black/50 px-4 py-2 text-sm text-gray-300 backdrop-blur-sm"><Loader2 className="h-4 w-4 animate-spin" /> Pulling your day together…</p>}
              {!loading && currentId && (
                <p className="inline-flex items-center gap-1 text-[11px] text-cyan-300/90"><Mic className="h-3 w-3" /> say “yes” or “no” — or tap on the right</p>
              )}
            </div>
          )}

          {/* Question / review panel — right-docked on desktop, bottom sheet on mobile. */}
          <div className="absolute z-[45] inset-x-0 bottom-0 flex max-h-[68vh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0e1015]/95 p-4 shadow-2xl backdrop-blur-md sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:max-h-none sm:w-80 sm:rounded-t-none sm:border-l sm:border-t-0">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                <SlotIcon className="h-4 w-4 text-blue-300" />
                {isEvening ? "Evening review" : "Morning briefing"}
              </h2>
              <button type="button" onClick={() => endReview(false)} className="p-1 text-gray-500 hover:text-gray-200" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            {/* Morning: reminders */}
            {!isEvening && (
              <div className="flex flex-col gap-2">
                {reminders.length === 0 && !loading && <p className="py-4 text-sm text-gray-500">Nothing on the books today — a clear run.</p>}
                {reminders.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm text-gray-200">
                    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-300" />
                    <span>{r.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Habit questions (tap or say), with logging animation + history strip.
                Shown in the evening review and the morning "log yesterday" catch-up. */}
            {habits.length > 0 && (
              <>
                <div className="flex flex-col gap-2">
                  {habits.map((h) => {
                    const current = h.id === currentId;
                    return (
                      <div
                        key={h.id}
                        className={`rounded-lg border px-3 py-2 transition-all duration-300 ${
                          h.justLogged ? "scale-[1.02] border-emerald-400/60 bg-emerald-500/15"
                          : current ? "border-cyan-400/60 bg-cyan-500/10 ring-1 ring-cyan-400/30"
                          : "border-white/[0.07] bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm text-gray-100">
                              {current && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan-400" />}
                              <span className="truncate">{h.question}</span>
                            </div>
                            {h.streak > 0 && <div className="text-[11px] text-emerald-400">🔥 {h.streak}-day streak</div>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {h.justLogged && <Check className="h-4 w-4 text-emerald-400" />}
                            <button type="button" onClick={() => handleTap(h, true)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${h.done === true ? "bg-emerald-500 text-white" : "border border-white/10 text-gray-300 hover:border-emerald-400/40"}`}>Yes</button>
                            <button type="button" onClick={() => handleTap(h, false)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${h.done === false ? "bg-gray-600 text-white" : "border border-white/10 text-gray-400 hover:border-white/25"}`}>No</button>
                          </div>
                        </div>
                        {/* GitHub-style history: the answered day lands in the strip. */}
                        <ContributionStrip history={h.history} justLogged={h.justLogged} />
                      </div>
                    );
                  })}
                  {isEvening && (
                    <form onSubmit={addHabit} className="flex items-center gap-2">
                      <input value={newHabit} onChange={(e) => setNewHabit(e.target.value)} placeholder="Track another habit…" className="flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25" />
                      <button type="submit" disabled={!newHabit.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-gray-200 disabled:opacity-40 hover:bg-white/15" aria-label="Add habit"><Plus className="h-4 w-4" /></button>
                    </form>
                  )}
                </div>

                {isEvening && incomplete.length > 0 && (
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
              </>
            )}

            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              {pushSupported() ? (
                <button type="button" onClick={onEnablePush} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-blue-400/40">
                  <Bell className="h-3.5 w-3.5" /> {pushMsg || "6am & 6pm reminders"}
                </button>
              ) : <span />}
              <button type="button" onClick={() => endReview(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                {isEvening ? "Done for tonight" : "Got it"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
