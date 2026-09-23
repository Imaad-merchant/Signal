import React, { useEffect, useState } from "react";
import { Settings2, Plus, Trash2, Power, Sparkles, Volume2, MessageCircleQuestion, ListChecks, BellRing, Link2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  loadPrefs, patchPrefs, TONES, VERBOSITIES, VOICE_PREFS, PROACTIVE,
  addCheckinQuestion, removeCheckinQuestion,
} from "./settings";

const SLOTS = ["any", "morning", "evening"];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs capitalize transition-colors ${
        active ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40" : "bg-white/5 text-gray-400 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

// The "Customize Donna" hub — persona, voice, check-in questions, habits, nudges.
// Everything writes live (savePrefs fires donna-prefs-change; habits hit Firestore).
export default function CustomizeDonnaPanel() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [habits, setHabits] = useState([]);
  const [newQ, setNewQ] = useState("");
  const [newQSlot, setNewQSlot] = useState("any");
  const [newHabit, setNewHabit] = useState("");

  const refresh = () => setPrefs(loadPrefs());
  const setPersona = (patch) => setPrefs(patchPrefs("persona", patch));
  const setVoice = (patch) => setPrefs(patchPrefs("voice", patch));
  const setNudges = (patch) => setPrefs(patchPrefs("nudges", patch));

  const loadHabits = () => base44.entities.Habit.list("-created_date", 50).then((h) => setHabits(Array.isArray(h) ? h : [])).catch(() => {});
  useEffect(() => { loadHabits(); }, []);

  const addQuestion = () => { const t = newQ.trim(); if (!t) return; setPrefs(addCheckinQuestion(t, newQSlot)); setNewQ(""); };
  const addHabit = async () => {
    const name = newHabit.trim(); if (!name) return;
    setNewHabit("");
    try { await base44.entities.Habit.create({ name, question: `${name} today?`, active: true, sort_order: habits.length + 1 }); } catch { /* ignore */ }
    loadHabits();
  };
  const toggleHabit = async (h) => { try { await base44.entities.Habit.update(h.id, { active: !h.active }); } catch { /* ignore */ } loadHabits(); };
  const deleteHabit = async (h) => { try { await base44.entities.Habit.delete(h.id); } catch { /* ignore */ } loadHabits(); };
  const [connecting, setConnecting] = useState(false);
  const connectGoogle = async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke("donna", { route: "google-connect" });
      const url = (res && res.data && res.data.url) || res?.url;
      if (url) { window.location.href = url; return; }
    } catch { /* ignore */ }
    setConnecting(false);
  };

  return (
    <div className="max-h-[80vh] w-[min(92vw,22rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#0e1015]/95 p-4 shadow-2xl backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-100">
        <Settings2 className="h-4 w-4 text-cyan-300" /> Customize Donna
      </div>
      <div className="flex flex-col gap-4">
        {/* Persona */}
        <Section icon={Sparkles} title="Personality">
          <label className="flex items-center justify-between gap-2 text-xs text-gray-400">
            Her name
            <input value={prefs.persona.name} onChange={(e) => setPersona({ name: e.target.value.slice(0, 30) })}
              className="w-32 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-gray-100 outline-none focus:border-white/25" />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-gray-400">
            Call you
            <input value={prefs.persona.address || ""} placeholder="(your name)" onChange={(e) => setPersona({ address: e.target.value.slice(0, 30) })}
              className="w-32 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25" />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-gray-500">Tone</span>
            {TONES.map((x) => <Chip key={x} active={prefs.persona.tone === x} onClick={() => setPersona({ tone: x })}>{x}</Chip>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-gray-500">Length</span>
            {VERBOSITIES.map((x) => <Chip key={x} active={prefs.persona.verbosity === x} onClick={() => setPersona({ verbosity: x })}>{x}</Chip>)}
          </div>
          <label className="flex items-center justify-between text-xs text-gray-400">
            British accent & phrasing
            <button type="button" onClick={() => setPersona({ british: !prefs.persona.british })}
              className={`rounded-full px-2.5 py-1 text-xs ${prefs.persona.british ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-gray-500"}`}>
              {prefs.persona.british ? "On" : "Off"}
            </button>
          </label>
        </Section>

        {/* Voice */}
        <Section icon={Volume2} title="Voice">
          <label className="flex items-center justify-between gap-3 text-xs text-gray-400">
            Speed
            <input type="range" min="0.7" max="1.4" step="0.02" value={prefs.voice.rate}
              onChange={(e) => setVoice({ rate: Number(e.target.value) })} className="flex-1 accent-cyan-400" />
            <span className="w-8 text-right text-gray-500">{prefs.voice.rate.toFixed(2)}×</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-gray-500">Voice</span>
            {VOICE_PREFS.map((x) => <Chip key={x} active={prefs.voice.prefer === x} onClick={() => setVoice({ prefer: x })}>{x}</Chip>)}
          </div>
        </Section>

        {/* Check-in questions */}
        <Section icon={MessageCircleQuestion} title="Check-in questions">
          {prefs.checkinQuestions.length === 0 && <p className="text-[11px] text-gray-500">None yet — she generates them for you. Add your own below.</p>}
          {prefs.checkinQuestions.map((q) => (
            <div key={q.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{q.text}</span>
              <span className="shrink-0 text-[10px] uppercase text-gray-500">{q.slot}</span>
              <button type="button" onClick={() => setPrefs(removeCheckinQuestion(q.id))} className="rounded p-1 text-gray-500 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input value={newQ} onChange={(e) => setNewQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQuestion()} placeholder="e.g. Did I journal today?"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25" />
            <select value={newQSlot} onChange={(e) => setNewQSlot(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1.5 text-xs text-gray-300 outline-none">
              {SLOTS.map((s) => <option key={s} value={s} className="bg-[#0e1015] capitalize">{s}</option>)}
            </select>
            <button type="button" onClick={addQuestion} disabled={!newQ.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-gray-200 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
          </div>
        </Section>

        {/* Habits */}
        <Section icon={ListChecks} title="Habits she tracks">
          {habits.map((h) => (
            <div key={h.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${h.active === false ? "bg-white/5 opacity-50" : "bg-white/5"}`}>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{h.name}</span>
              <button type="button" onClick={() => toggleHabit(h)} title={h.active === false ? "Resume" : "Pause"}
                className={`rounded p-1 ${h.active === false ? "text-gray-500" : "text-emerald-300"} hover:bg-white/10`}><Power className="h-4 w-4" /></button>
              <button type="button" onClick={() => deleteHabit(h)} className="rounded p-1 text-gray-500 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input value={newHabit} onChange={(e) => setNewHabit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addHabit()} placeholder="Track a habit…"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25" />
            <button type="button" onClick={addHabit} disabled={!newHabit.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-gray-200 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
          </div>
        </Section>

        {/* Nudges */}
        <Section icon={BellRing} title="Nudges & timing">
          <label className="flex items-center justify-between text-xs text-gray-400">
            Grade-check nudge
            <button type="button" onClick={() => setNudges({ gradeNudge: !prefs.nudges.gradeNudge })}
              className={`rounded-full px-2.5 py-1 text-xs ${prefs.nudges.gradeNudge ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-gray-500"}`}>{prefs.nudges.gradeNudge ? "On" : "Off"}</button>
          </label>
          <label className="flex items-center justify-between text-xs text-gray-400">
            Morning / evening briefing
            <button type="button" onClick={() => setNudges({ briefing: !prefs.nudges.briefing })}
              className={`rounded-full px-2.5 py-1 text-xs ${prefs.nudges.briefing ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-gray-500"}`}>{prefs.nudges.briefing ? "On" : "Off"}</button>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-gray-500">Proactive</span>
            {PROACTIVE.map((x) => <Chip key={x} active={prefs.nudges.proactive === x} onClick={() => setNudges({ proactive: x })}>{x}</Chip>)}
          </div>
          <label className="flex items-center justify-between gap-3 text-xs text-gray-400">
            Pause before she answers
            <input type="range" min="700" max="4000" step="100" value={prefs.nudges.pauseMs}
              onChange={(e) => setNudges({ pauseMs: Number(e.target.value) })} className="flex-1 accent-cyan-400" />
            <span className="w-10 text-right text-gray-500">{(prefs.nudges.pauseMs / 1000).toFixed(1)}s</span>
          </label>
        </Section>

        {/* Connections */}
        <Section icon={Link2} title="Connections">
          <button
            type="button"
            onClick={connectGoogle}
            disabled={connecting}
            className="flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" /> {connecting ? "Opening Google…" : "Connect / reconnect Google"}
          </button>
          <p className="text-[11px] text-gray-500">Reconnect to grant Docs & Slides reading (a wider permission than before).</p>
        </Section>

        <p className="text-center text-[11px] text-gray-500">Or just tell Donna: “be more blunt”, “call me boss”, “add a check-in question…”.</p>
      </div>
    </div>
  );
}
