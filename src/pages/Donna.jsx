import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mic, MicOff, Send, AlertTriangle, RotateCcw, RotateCw, X, Check, Bell, Settings2, Volume2, Brain, Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Orb from "@/components/donna/Orb";
import DailyBriefing from "@/components/donna/DailyBriefing";
import WidgetPanel from "@/components/donna/WidgetPanel";
import SpokenCaption from "@/components/donna/SpokenCaption";
import RoutinesPanel from "@/components/donna/RoutinesPanel";
import CustomizePanel from "@/components/donna/CustomizePanel";
import CustomizeDonnaPanel from "@/components/donna/CustomizeDonnaPanel";
import ThoughtsPanel from "@/components/donna/ThoughtsPanel";
import { resolveTileKey, setTileHidden, ALL_TILES } from "@/components/donna/dashboardConfig";
import {
  loadPrefs, onPrefsChange, patchPrefs, personaPrefsForServer,
  parseOpenSettings, parseAddQuestion, parseRemoveQuestion, parseAddHabit, parseRemoveHabit,
  parsePersonaTweak, parseNudgeTweak, addCheckinQuestion, removeCheckinQuestionByText,
} from "@/components/donna/settings";
import { useVoice } from "@/components/donna/useVoice";
import { useWakeWord } from "@/components/donna/useWakeWord";
import { reverseMany } from "@/components/donna/undo";
import { getBriefingParts, briefingSlotKey } from "@/components/donna/checkinUtils";
import { parseMoneyQuery, answerMoneyQuery } from "@/components/money/voice";
import { parseEventCommand, parseEventEdit, parseDate, friendlyDate, pickUnusedColor, slugify, DEFAULT_CATEGORY_COLORS } from "@/components/donna/calendar";
import {
  loadReminders, saveReminders, newId, parseReminderCreate, parseReminderCancel,
  parseDelivery, matchReminder, everyLabel, deliveryLabel,
} from "@/components/donna/reminders";
import {
  parseLogStart, parseLogAppend, parseLogContinue, parseLogRead, parseLogBare,
  getActiveLog, setActiveLog, normalizeLogName, appendToLog, readLog, listLogs,
} from "@/components/donna/logs";

// Is this slot's morning/evening briefing still pending? If so it owns the top
// alert and the generic nudge stands down to avoid stacking two alerts.
function briefingPending() {
  try {
    const done = JSON.parse(localStorage.getItem("pulse_briefing_done") || "[]");
    return !done.includes(briefingSlotKey(getBriefingParts()));
  } catch { return false; }
}

const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const FEMALE_RE = /female|serena|kate|sonia|martha|libby|hazel|stephanie|amelie|samantha|karen|moira|tessa|fiona/i;
const MALE_RE = /male|daniel|arthur|oliver|james|george|fred|gordon|rishi|alex/i;
// Pick a TTS voice honouring the user's prefs: accent (British vs any English) and
// preferred voice gender. Falls back gracefully to any English voice.
function pickVoice(voices, prefer = "female", british = true) {
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const gb = en.filter((v) => /en[-_]GB/i.test(v.lang));
  const pool = british && gb.length ? gb : en;
  const rank = (list) => {
    if (!list.length) return null;
    let hit = null;
    if (prefer === "female") hit = list.find((v) => FEMALE_RE.test(v.name) && !MALE_RE.test(v.name));
    else if (prefer === "male") hit = list.find((v) => MALE_RE.test(v.name));
    return hit || list[0] || null;
  };
  // Prefer a LOCAL voice — Chrome's remote "Google …" voices are network-backed and
  // often produce no audio (esp. in a PWA), so a local voice is far more reliable.
  return rank(pool.filter((v) => v.localService)) || rank(pool) || rank(en) || null;
}

// Best-effort match of a spoken item ("the logo") to an existing open task,
// preferring one in the named list. Used for complete/remove.
function findTask(tasks, text, list) {
  const q = (text || "").toLowerCase().trim();
  if (!q || !Array.isArray(tasks)) return null;
  const open = tasks.filter((t) => t && t.status !== "done");
  const scoped = list ? open.filter((t) => (t.category || "").toLowerCase() === String(list).toLowerCase()) : open;
  const pool = scoped.length ? scoped : open;
  return (
    pool.find((t) => (t.title || "").toLowerCase().includes(q)) ||
    pool.find((t) => (t.title || "").length > 2 && q.includes((t.title || "").toLowerCase())) ||
    null
  );
}

// Keyword-rank the worker-indexed notes for a search query (title hits weigh more).
function rankNotes(notes, query) {
  const terms = (query || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!terms.length || !Array.isArray(notes)) return [];
  return notes
    .map((n) => {
      const title = (n.title || "").toLowerCase();
      const hay = `${title} ${(n.folder || "").toLowerCase()} ${(n.content || "").toLowerCase()}`;
      let score = 0;
      for (const t of terms) { if (title.includes(t)) score += 5; if (hay.includes(t)) score += 1; }
      return { ...n, _score: score };
    })
    .filter((n) => n._score > 0)
    .sort((a, b) => b._score - a._score || (new Date(b.modified || 0) - new Date(a.modified || 0)));
}

// Pull out the individual questions from Donna's reply so multi-question prompts
// ("…have you vaped today? did you go to the gym?") can be listed on the side.
function extractQuestions(text) {
  if (!text) return [];
  return String(text)
    .split(/(?<=[?？])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[?？]$/.test(s) && s.length > 3)
    .slice(0, 8);
}

export default function Donna() {
  const [mode, setMode] = useState("idle"); // idle | listening | processing | speaking
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState(""); // action summary or error
  const [typed, setTyped] = useState("");
  const [ttsSupported, setTtsSupported] = useState(true);
  const [lastActions, setLastActions] = useState([]); // undoable records from the last command
  const [undoing, setUndoing] = useState(false);
  const [redoActions, setRedoActions] = useState([]); // actions to re-apply after an undo
  const lastAppliedRef = useRef([]); // the last turn's actions, kept so Redo can re-run them
  const pendingDeletionsRef = useRef(null); // bulk deletions staged for explicit confirmation
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);
  const [nudgeReady, setNudgeReady] = useState(false); // Donna has a follow-up to voice
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("donna_muted") === "1"; } catch { return false; }
  });
  const [turns, setTurns] = useState([]); // captioned conversation history (both sides)
  // Chat mode: a plain typed chat with all of Donna's powers (logging, memory,
  // tasks, Google, money, research) but none of the proactive behaviour — no
  // briefings, nudges, always-on mic, or auto-speaking. Flip back to full Donna
  // anytime. Persisted so it stays where you left it.
  const [chatMode, setChatMode] = useState(() => { try { return localStorage.getItem("assistant_mode") === "chat"; } catch { return false; } });
  const [widgetsCollapsed, setWidgetsCollapsed] = useState(() => { try { return localStorage.getItem("donna_widgets_collapsed") === "1"; } catch { return false; } });
  const toggleWidgets = () => setWidgetsCollapsed((v) => { const next = !v; try { localStorage.setItem("donna_widgets_collapsed", next ? "1" : "0"); } catch { /* ignore */ } return next; });
  const chatModeRef = useRef(chatMode);
  const chatScrollRef = useRef(null);
  const [showThoughts, setShowThoughts] = useState(false); // brain-dump / import panel
  const [emailDraft, setEmailDraft] = useState(null); // { to, subject, body } pending confirm+send
  const [emailSending, setEmailSending] = useState(false);
  const [sources, setSources] = useState([]); // web-research source links for the last answer
  const [answeredQ, setAnsweredQ] = useState(() => new Set()); // questions answered in the right-side box
  const answeringRef = useRef(null); // the question currently being answered
  const ttsAudioRef = useRef(null); // shared <audio> for reliable server-side TTS
  const serverTtsOkRef = useRef(true); // false once server TTS proves unavailable
  const [spoken, setSpoken] = useState({ text: "", idx: 0 }); // caption text + karaoke cursor
  const turnId = useRef(0);
  const transcriptRef = useRef(null);
  const queryClient = useQueryClient();

  // ---- Recurring reminders ("routines"). Stored per-device; run while this page
  //      is open. Refs mirror state so the stable handleTranscript sees the latest. ----
  const [reminders, setReminders] = useState(loadReminders);
  const remindersRef = useRef(reminders);
  const [pendingReminder, setPendingReminder] = useState(null); // awaiting a delivery choice
  const pendingReminderRef = useRef(null);
  const [orbAlert, setOrbAlert] = useState(false); // orb-delivery glow
  const [reminderToast, setReminderToast] = useState(null); // { title, id } — on-screen reminder banner
  const lastReminderRef = useRef(null); // { id, title, at } — the reminder that just fired, so "skip/done" deletes it
  const [showRoutines, setShowRoutines] = useState(false); // routines editor panel
  const [showCustomize, setShowCustomize] = useState(false); // customize overlay (tabbed)
  const [customizeTab, setCustomizeTab] = useState("donna"); // "donna" | "dashboard"
  const [prefs, setPrefs] = useState(loadPrefs);
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => onPrefsChange(setPrefs), []);
  const [briefingActive, setBriefingActive] = useState(false); // daily review owns the mic
  const [pendingLog, setPendingLogState] = useState(null); // awaiting "which log?" answer
  const pendingLogRef = useRef(null);
  const setPendingLog = useCallback((v) => { pendingLogRef.current = v; setPendingLogState(v); }, []);
  const turnsRef = useRef([]); // live conversation history for multi-turn context
  const pendingEventRef = useRef(null); // awaiting a date/category for a calendar event
  const pendingNudgeRef = useRef(null); // { commitments, say, at } — a just-voiced nudge, so "skip/no" can dismiss it
  const setPendingEvent = useCallback((v) => { pendingEventRef.current = v; }, []);
  const lastEmailRef = useRef(null); // { from, subject } of the last email read (for replies)
  const emailDraftRef = useRef(null); // mirror so a voice "send it" can act on the staged draft
  useEffect(() => { emailDraftRef.current = emailDraft; }, [emailDraft]);

  const commitReminders = useCallback((next) => {
    remindersRef.current = next;
    setReminders(next);
    saveReminders(next);
  }, []);
  const addReminder = useCallback((r) => {
    const list = remindersRef.current || [];
    commitReminders([...list, {
      id: newId(list), title: r.title, everyMinutes: r.everyMinutes,
      delivery: r.delivery || "text", enabled: true, lastFired: 0,
    }]);
  }, [commitReminders]);
  const updateReminder = useCallback((id, patch) => {
    commitReminders((remindersRef.current || []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, [commitReminders]);
  const removeReminder = useCallback((id) => {
    commitReminders((remindersRef.current || []).filter((x) => x.id !== id));
  }, [commitReminders]);
  const setPending = useCallback((v) => { pendingReminderRef.current = v; setPendingReminder(v); }, []);

  // Deliver a due reminder in its chosen style. Reassigned each render so it always
  // closes over the current speak()/muted; the interval calls it via the ref.
  const deliverRef = useRef(null);
  deliverRef.current = (r) => {
    const title = r.title;
    // Remember which reminder just fired so "skip / done / get rid of it" can delete it.
    lastReminderRef.current = { id: r.id, title, at: Date.now() };
    pushTurn("signal", `Reminder — ${title}.`);
    if (r.delivery === "voice" && !muted) {
      speak(`Time to ${title}.`);
      return;
    }
    if (r.delivery === "orb") {
      setOrbAlert(true);
      window.setTimeout(() => setOrbAlert(false), 12000);
    }
    // Always show the banner for orb/text (and as the fallback when voice is muted)
    // so it's clear what the reminder is.
    setReminderToast({ title, id: r.id });
    window.setTimeout(() => setReminderToast((c) => (c && c.id === r.id ? null : c)), 30000);
  };

  // Fire due reminders while the page is open (checks every 15s).
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const list = remindersRef.current || [];
      let changed = false, fired = false;
      for (const r of list) {
        if (!r.enabled) continue;
        const period = Math.max(1, r.everyMinutes || 30) * 60000;
        if (!r.lastFired) { r.lastFired = now; changed = true; continue; } // arm on first sight
        if (now - r.lastFired >= period) {
          r.lastFired = now; changed = true; fired = true;
          try { deliverRef.current && deliverRef.current(r); } catch { /* ignore */ }
        }
      }
      if (changed) { saveReminders(list); if (fired) setReminders([...list]); }
    };
    const iv = window.setInterval(tick, 15000);
    return () => window.clearInterval(iv);
  }, []);

  // Append a caption turn ("you" or "signal") to the running transcript.
  // Persist chat/Donna mode; switching stops the mic + any speech so the two modes
  // never fight over audio.
  useEffect(() => {
    chatModeRef.current = chatMode;
    try { localStorage.setItem("assistant_mode", chatMode ? "chat" : "donna"); } catch { /* ignore */ }
    // Clear the shared status line so a note from one mode (e.g. the voice-test
    // result) doesn't bleed into the other after switching.
    setNote(""); setReply(""); setSpoken({ text: "", idx: 0 });
    if (chatMode) {
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      try { if (ttsAudioRef.current) { ttsAudioRef.current.pause(); } } catch { /* ignore */ }
      try { voice.stop(); } catch { /* ignore */ }
      setMode("idle"); setNudgeReady(false);
    }
  }, [chatMode]);

  const pushTurn = useCallback((who, text) => {
    const v = (text || "").trim();
    if (!v) return;
    setTurns((prev) => {
      const next = [...prev.slice(-49), { id: ++turnId.current, who, text: v }];
      turnsRef.current = next; // keep a live copy for multi-turn context
      return next;
    });
  }, []);

  // Handle a finished transcript (from voice or the type box).
  const handleTranscript = useCallback(async (text) => {
    const t = (text || "").trim();
    if (!t) { setMode("idle"); if (!chatModeRef.current) setNote("Didn't catch that — tap the orb and try again."); return; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* interrupt any current speech */ }

    // ---- Logging helpers (Page-backed logs; entries condensed by the server `log`
    //      route; smart-routed to an existing log or a new one). ----
    const logDate = todayKey();
    const commitLine = async (name, line) => {
      setMode("processing");
      try {
        const { page, created, prevContent, title } = await appendToLog(name, line, logDate);
        setLastActions([{ kind: "log", pageId: page.id, prevContent, created }]);
        const say = `Logged to ${title}.`;
        setNote(""); setReply(say); pushTurn("signal", say); speak(say);
        queryClient.invalidateQueries({ queryKey: ["grid"] });
      } catch {
        setMode("idle"); setNote("I couldn't save that to your log.");
      }
    };
    const tidyLine = async (rawText, forcedLog) => {
      try {
        const res = await base44.functions.invoke("donna", { route: "log", text: rawText, log: forcedLog || null });
        const data = res && res.data ? res.data : res || {};
        return data.line || rawText;
      } catch { return rawText; }
    };
    const logToNamed = async (name, rawText) => { setMode("processing"); await commitLine(name, await tidyLine(rawText, name)); };
    const smartLog = async (content) => {
      setMode("processing");
      const existingLogs = await listLogs().catch(() => []);
      let data = {};
      try {
        const res = await base44.functions.invoke("donna", { route: "log", text: content, existingLogs });
        data = res && res.data ? res.data : res || {};
      } catch { /* ignore */ }
      const line = data.line || content;
      const targetLog = data.targetLog || null;
      const confidence = Number(data.confidence) || 0;
      const suggestedNewName = data.suggestedNewName || "";
      if (targetLog && confidence >= 0.55) {
        setPendingLog({ line, targetLog, suggestedNewName });
        const say = `That sounds like your ${targetLog} log — add it there, or start a new one?`;
        setReply(say); setNote(""); pushTurn("signal", say); speak(say);
      } else if (suggestedNewName) {
        setPendingLog({ line, targetLog: null, suggestedNewName });
        const say = `Shall I start a new ${suggestedNewName} log for this?`;
        setReply(say); setNote(""); pushTurn("signal", say); speak(say);
      } else {
        await commitLine("Journal", line);
      }
    };

    // We just asked "which log?" — this utterance chooses.
    if (pendingLogRef.current) {
      const p = pendingLogRef.current; setPendingLog(null);
      setHeard(t); pushTurn("you", t);
      const said = t.toLowerCase();
      const affirmative = /\b(yes|yeah|yep|yup|sure|ok|okay|please|do it|go ahead|that one|there|same|existing|the first)\b/.test(said);
      const wantsNew = /\b(new|separate|another|different|fresh|its own|start a)\b/.test(said);
      const negative = /\b(no|nah|nope)\b/.test(said);
      const spokenName = (() => {
        if (t.trim().split(/\s+/).length > 5) return "";
        const cleaned = t.replace(/^(yes|yeah|sure|ok|okay|please|no|nah|new|start|a|the|my|in|to|call it|called)\b[,\s]*/gi, "");
        return normalizeLogName(cleaned);
      })();
      let target;
      if (p.targetLog) {
        if (wantsNew) target = p.suggestedNewName || spokenName || "Journal";
        else if (affirmative) target = p.targetLog;
        else if (spokenName) target = spokenName;
        else target = p.targetLog;
      } else {
        if (negative && !wantsNew && !spokenName) target = "Journal";
        else if (affirmative) target = p.suggestedNewName || "Journal";
        else target = spokenName || p.suggestedNewName || "Journal";
      }
      await commitLine(target, p.line);
      return;
    }

    // ---- Bulk deletion awaiting confirmation (guard against mass-wipe). ----
    if (pendingDeletionsRef.current) {
      const pend = pendingDeletionsRef.current;
      const yes = /\b(yes|yeah|yep|confirm|do it|delete them|go ahead|proceed|sure)\b/i.test(t);
      const no = /\b(no|cancel|stop|keep them|don'?t|nevermind|never mind|leave them)\b/i.test(t);
      if (yes || no) {
        pendingDeletionsRef.current = null; setPendingDeleteCount(0);
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        if (no) { const say = "Cancelled — I've left them all where they are."; setReply(say); pushTurn("signal", say); speak(say); setMode("idle"); return; }
        const allTasksNow = await base44.entities.Task.list("-created_date", 500).catch(() => []);
        const { count, records } = await applyActions(pend, todayKey(), Array.isArray(allTasksNow) ? allTasksNow : []);
        setLastActions(records); lastAppliedRef.current = pend; setRedoActions([]);
        queryClient.invalidateQueries({ queryKey: ["grid"] });
        queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
        const say = count ? `Done — deleted ${count} item${count > 1 ? "s" : ""}. Tap Undo to bring them back.` : "I couldn't find those to delete.";
        setReply(say); pushTurn("signal", say); speak(say); setMode("idle"); return;
      }
      // Not a clear yes/no — fall through and treat as a new request (leaves the
      // deletions pending so they're never executed without an explicit "yes").
    }

    // ---- Calendar event: we asked for a missing date or category — this answers it. ----
    if (pendingEventRef.current) {
      const p = pendingEventRef.current; setPendingEvent(null);
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      if (p.op === "move") {
        const dm = parseDate(t, new Date());
        if (!dm) { setPendingEvent(p); const say = `I didn't catch a date — say something like "the 6th" or "next Monday".`; setReply(say); pushTurn("signal", say); speak(say); return; }
        await base44.entities.Task.update(p.id, { due_date: dm.date }).catch(() => {});
        pushEventToGoogle(p.title, dm.date, p.gcalId).then((gid) => { if (gid && !p.gcalId) base44.entities.Task.update(p.id, { gcal_id: gid }).catch(() => {}); });
        queryClient.invalidateQueries({ queryKey: ["grid"] });
        const say = `Moved "${p.title}" to ${friendlyDate(dm.date)}.`;
        setNote(say); setReply(say); pushTurn("signal", say); speak(say); return;
      }
      if (p.need === "date") {
        const dm = parseDate(t, new Date());
        if (!dm) { setPendingEvent(p); const say = `I didn't catch a date — say something like "August 4th" or "next Monday".`; setReply(say); pushTurn("signal", say); speak(say); return; }
        const next = { title: p.title, date: dm.date, category: p.category || null };
        if (!next.category) { setPendingEvent({ ...next, need: "category" }); const say = `Got it — ${friendlyDate(next.date)}. What category should "${next.title}" go under? Say a name, or "none".`; setReply(say); pushTurn("signal", say); speak(say); return; }
        await createCalendarEvent(next); return;
      }
      if (p.need === "category") {
        const said = t.trim().toLowerCase();
        let category = null;
        if (!/^(no|none|no category|skip|nope|without|no thanks|don'?t)\b/.test(said)) {
          category = t.trim().replace(/^(under\s+|the\s+|category\s+|a\s+new\s+|call\s+it\s+|put\s+it\s+under\s+)/i, "").replace(/\s+category$/i, "").trim() || null;
        }
        await createCalendarEvent({ title: p.title, date: p.date, category }); return;
      }
    }

    // ---- A nudge was just voiced — "skip / no / cancel / not doing that" DISMISSES
    //      the underlying commitment for good (not just a 6h quiet). ----
    if (pendingNudgeRef.current && (Date.now() - pendingNudgeRef.current.at < 5 * 60 * 1000)) {
      const nudge = pendingNudgeRef.current;
      const isDismiss = /\b(skip|cancel|no|nope|nah|drop it|forget (it|that|about)|never ?mind|not (doing|interested)|we'?re not|don'?t (do|want)|dismiss|stop (bringing|reminding)|remove (it|that)|get rid|leave it)\b/i.test(t) || /^(no|nah|nope|skip|pass)\b/i.test(t.trim());
      if (isDismiss) {
        pendingNudgeRef.current = null;
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        const target = pickCommitment(nudge.commitments || [], t, nudge.say);
        try { localStorage.setItem("jarvis_nudge_until", String(Date.now() + 7 * 24 * 3600 * 1000)); } catch { /* ignore */ }
        if (target?.id) {
          await base44.entities.Commitment.update(target.id, { status: "dismissed" }).catch(() => {});
          const say = `Done — I've dropped that and won't bring it up again.`;
          setReply(say); pushTurn("signal", say); speak(say); return;
        }
        const say = (nudge.commitments || []).length > 1 ? `Alright — which one should I drop? Say a word or two from it.` : `Alright, I'll leave it.`;
        setReply(say); pushTurn("signal", say); speak(say); return;
      }
      pendingNudgeRef.current = null; // engaging, not dismissing → continue normally
    }

    // ---- A reminder just fired — "skip / done / get rid of it / stop" deletes that
    //      recurring routine so it stops nagging (not just closes the banner). ----
    if (lastReminderRef.current && (Date.now() - lastReminderRef.current.at < 4 * 60 * 1000)) {
      const lr = lastReminderRef.current;
      const isDismiss = /\b(skip( it| that)?|get\s+rid\s+of\s+(it|that|this|the reminder)|delete\s+(it|that|this|the reminder)|stop\s*(it|that|reminding( me)?)?|cancel\s+(it|that|the reminder)|remove\s+(it|that)|did\s+it|already\s+(did|done|handled)|handled( it)?|drop it|forget it|nix it)\b/i.test(t) || /^(skip|done|stop)\b/i.test(t.trim());
      if (isDismiss) {
        lastReminderRef.current = null;
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        removeReminder(lr.id);
        setReminderToast((c) => (c && c.id === lr.id ? null : c));
        const say = `Done — I've stopped reminding you to ${lr.title}.`;
        setReply(say); pushTurn("signal", say); speak(say); return;
      }
    }

    // ---- Recurring reminders ("routines"), handled locally before the server route. ----
    // 1) We just asked HOW to deliver a reminder — this utterance is the answer.
    if (pendingReminderRef.current) {
      const pend = pendingReminderRef.current;
      setPending(null);
      const delivery = parseDelivery(t) || "text";
      setHeard(t); pushTurn("you", t);
      addReminder({ ...pend, delivery });
      const say = `Done. I'll remind you to ${pend.title} ${everyLabel(pend.everyMinutes)} and ${deliveryLabel(delivery)}.`;
      setReply(say); setNote(""); pushTurn("signal", say); speak(say);
      return;
    }
    // 2) "remind me to X every N minutes [out loud | orb | on screen]"
    const rc = parseReminderCreate(t);
    if (rc) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      if (rc.delivery) {
        addReminder(rc);
        const say = `Right — I'll remind you to ${rc.title} ${everyLabel(rc.everyMinutes)} and ${deliveryLabel(rc.delivery)}.`;
        setReply(say); pushTurn("signal", say); speak(say);
      } else {
        setPending({ title: rc.title, everyMinutes: rc.everyMinutes });
        const say = `Sure. How should I remind you to ${rc.title} — shall I say it out loud, glow the orb, or show it on screen?`;
        setReply(say); pushTurn("signal", say); speak(say);
      }
      return;
    }
    // 3) "stop reminding me [to X]" / "delete the reminder"
    const rx = parseReminderCancel(t);
    if (rx) {
      const target = matchReminder(remindersRef.current, rx.title);
      if (target) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        removeReminder(target.id);
        const say = `Stopped reminding you to ${target.title}.`;
        setReply(say); pushTurn("signal", say); speak(say);
        return;
      }
      // No matching routine — maybe they mean a standing commitment
      // ("stop reminding me about the shared list"). Try to dismiss that.
      const commitsRaw = await base44.entities.Commitment.filter({ status: "open" }).catch(() => []);
      const commits = (Array.isArray(commitsRaw) ? commitsRaw : []).map((c) => ({ id: c.id, text: c.text }));
      const commit = pickCommitment(commits, `${rx.title || ""} ${t}`, "", false);
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      let say;
      if (commit?.id) {
        await base44.entities.Commitment.update(commit.id, { status: "dismissed" }).catch(() => {});
        try { localStorage.setItem("jarvis_nudge_until", String(Date.now() + 7 * 24 * 3600 * 1000)); } catch { /* ignore */ }
        say = `Done — I've dropped "${commit.text}" and won't bring it up again.`;
      } else {
        say = "You don't have a reminder like that set.";
      }
      setReply(say); pushTurn("signal", say); speak(say);
      return;
    }

    // ---- Reschedule / delete a calendar event ("move X to <date>", "delete X"). ----
    {
      const edit = parseEventEdit(t);
      if (edit) {
        const tasksRaw = await base44.entities.Task.list("-created_date", 500).catch(() => []);
        const match = findTask(Array.isArray(tasksRaw) ? tasksRaw : [], edit.title);
        if (match?.id) {
          setHeard(t); pushTurn("you", t); setNote(""); setReply("");
          if (edit.op === "delete") {
            await base44.entities.Task.delete(match.id).catch(() => {});
            deleteEventFromGoogle(match.gcal_id);
            queryClient.invalidateQueries({ queryKey: ["grid"] });
            const say = `Deleted "${match.title}" from your calendar.`;
            setNote(say); setReply(say); pushTurn("signal", say); speak(say); return;
          }
          if (!edit.date) {
            setPendingEvent({ op: "move", id: match.id, title: match.title, gcalId: match.gcal_id, need: "date" });
            const say = `What date should I move "${match.title}" to?`;
            setReply(say); pushTurn("signal", say); speak(say); return;
          }
          await base44.entities.Task.update(match.id, { due_date: edit.date }).catch(() => {});
          pushEventToGoogle(match.title, edit.date, match.gcal_id).then((gid) => { if (gid && !match.gcal_id) base44.entities.Task.update(match.id, { gcal_id: gid }).catch(() => {}); });
          queryClient.invalidateQueries({ queryKey: ["grid"] });
          const say = `Moved "${match.title}" to ${friendlyDate(edit.date)}.`;
          setNote(say); setReply(say); pushTurn("signal", say); speak(say); return;
        }
        // No matching event — fall through to other handlers / the LLM.
      }
    }

    // ---- Cancel a standing commitment ("forget the Emiliano list", "stop reminding
    //      me about X"). Marks it dismissed so nudges/briefings stop surfacing it. ----
    if (/\b(forget|cancel|drop|scrap|stop\s+(reminding\s+me|bringing\s+up)|get\s+rid\s+of|don'?t\s+remind\s+me)\b/i.test(t)) {
      const commitsRaw = await base44.entities.Commitment.filter({ status: "open" }).catch(() => []);
      const commits = (Array.isArray(commitsRaw) ? commitsRaw : []).map((c) => ({ id: c.id, text: c.text }));
      const target = pickCommitment(commits, t, "", false); // require a keyword match — never guess
      if (target?.id) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        await base44.entities.Commitment.update(target.id, { status: "dismissed" }).catch(() => {});
        try { localStorage.setItem("jarvis_nudge_until", String(Date.now() + 7 * 24 * 3600 * 1000)); } catch { /* ignore */ }
        const say = `Done — I've dropped "${target.text}" and won't bring it up again.`;
        setReply(say); pushTurn("signal", say); speak(say); return;
      }
      // No matching commitment — fall through (might be a task delete / the LLM).
    }

    // ---- Calendar events: "add … to my calendar [on <date>] [under <category>]".
    //      Missing date/category → ask; new category → created with an unused colour. ----
    {
      const ev = parseEventCommand(t);
      if (ev && ev.title) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        if (!ev.date) {
          setPendingEvent({ title: ev.title, category: ev.category || null, need: "date" });
          const say = `Sure — what date should I put "${ev.title}" on?`;
          setReply(say); pushTurn("signal", say); speak(say); return;
        }
        if (!ev.category) {
          setPendingEvent({ title: ev.title, date: ev.date, need: "category" });
          const say = `Adding "${ev.title}" on ${friendlyDate(ev.date)}. What category should it go under? Say a name, or "none".`;
          setReply(say); pushTurn("signal", say); speak(say); return;
        }
        await createCalendarEvent(ev); return;
      }
    }

    // ---- Connect / reconnect Google (works even when the inbox already has signals) ----
    if (/\b(re-?)?(connect|link|sign\s*in\s*to|hook\s*up)\s+(my\s+|to\s+)?(google|gmail|drive|workspace)\b/i.test(t)) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      try {
        const res = await base44.functions.invoke("donna", { route: "google-connect" });
        const url = (res && res.data && res.data.url) || res?.url;
        if (url) { const say = "Opening Google to connect — approve the permissions."; setReply(say); pushTurn("signal", say); speak(say); window.location.href = url; return; }
        const say = "Google isn't set up on the server yet."; setReply(say); pushTurn("signal", say); speak(say); return;
      } catch {
        const say = "I couldn't start the Google connection — try again."; setReply(say); pushTurn("signal", say); speak(say); return;
      }
    }

    // ---- Money Q&A (net worth, spending, subscriptions, budgets) ----
    {
      const moneyQ = parseMoneyQuery(t);
      if (moneyQ) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply(""); setMode("processing");
        let say;
        try { say = await answerMoneyQuery(moneyQ); }
        catch { say = "I couldn't read your money data just now."; }
        setReply(say); pushTurn("signal", say); speak(say);
        return;
      }
    }

    // ---- Customize Donna by voice (persona / voice / questions / habits / nudges) ----
    if (parseOpenSettings(t)) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      setCustomizeTab("donna"); setShowCustomize(true);
      const say = "Here's where you can shape me — my tone, voice, questions, habits, and nudges.";
      setReply(say); pushTurn("signal", say); speak(say);
      return;
    }
    {
      const persona = parsePersonaTweak(t);
      const nudge = !persona ? parseNudgeTweak(t) : null;
      if (persona || nudge) {
        const { section, patch } = persona || nudge;
        setPrefs(patchPrefs(section, patch));
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        const key = Object.keys(patch)[0], val = patch[key];
        const say = key === "name" ? `I'm ${val} now.`
          : key === "address" ? `Right — I'll call you ${val}.`
          : key === "tone" ? `Noted — I'll be more ${val}.`
          : key === "verbosity" ? `I'll keep it ${val}.`
          : key === "british" ? (val ? "Keeping it British." : "Dropping the British accent.")
          : key === "rate" ? `Adjusting my pace.`
          : key === "prefer" ? `Switching to a ${val} voice.`
          : key === "pauseMs" ? `I'll wait ${val >= (prefsRef.current.nudges?.pauseMs || 1500) ? "a bit longer" : "less"} before I answer.`
          : key === "gradeNudge" ? (val ? "I'll nudge you about grades." : "I'll stop nudging you about grades.")
          : key === "briefing" ? (val ? "Briefings back on." : "Briefings off.")
          : key === "proactive" ? `I'll be ${val === "often" ? "more" : "less"} proactive.`
          : "Done.";
        setReply(say); pushTurn("signal", say); speak(say);
        return;
      }
    }
    {
      const addQ = parseAddQuestion(t);
      if (addQ) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        setPrefs(addCheckinQuestion(addQ.text, addQ.slot));
        const say = `Added — I'll ask "${addQ.text}"${addQ.slot !== "any" ? ` every ${addQ.slot}` : ""}.`;
        setReply(say); pushTurn("signal", say); speak(say);
        return;
      }
      const rmQ = parseRemoveQuestion(t);
      if (rmQ) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        const removed = removeCheckinQuestionByText(rmQ.text);
        setPrefs(loadPrefs());
        const say = removed ? `I'll stop asking "${removed.text}".` : "I couldn't find a question like that.";
        setReply(say); pushTurn("signal", say); speak(say);
        return;
      }
    }
    {
      const addH = parseAddHabit(t);
      if (addH) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        try { await base44.entities.Habit.create({ name: addH.name, question: `${addH.name} today?`, active: true, sort_order: 99 }); } catch { /* ignore */ }
        const say = `Now tracking "${addH.name}".`;
        setReply(say); pushTurn("signal", say); speak(say);
        return;
      }
      const rmH = parseRemoveHabit(t);
      if (rmH) {
        setHeard(t); pushTurn("you", t); setNote(""); setReply("");
        let say = "I couldn't find that habit.";
        try {
          const list = await base44.entities.Habit.list("-created_date", 50).catch(() => []);
          const q = rmH.name.toLowerCase();
          const hit = (Array.isArray(list) ? list : []).find((h) => (h.name || "").toLowerCase().includes(q) || q.includes((h.name || "").toLowerCase()));
          if (hit) { await base44.entities.Habit.update(hit.id, { active: false }); say = `Stopped tracking "${hit.name}".`; }
        } catch { /* ignore */ }
        setReply(say); pushTurn("signal", say); speak(say);
        return;
      }
    }

    // ---- Dashboard customisation by voice ----
    // "customize/edit my dashboard" opens the panel; "hide/show the X tile" toggles one.
    if (/\b(customi[sz]e|edit|change|set\s*up)\s+(my\s+|the\s+)?dashboard\b/i.test(t)) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      setCustomizeTab("dashboard"); setShowCustomize(true);
      const say = "Here's your dashboard — hide, show, or reorder any tile.";
      setReply(say); pushTurn("signal", say); speak(say);
      return;
    }
    const tileToggle = /\b(hide|remove|show|add|bring\s+back|unhide)\b.*\b(tile|card|dashboard|from\s+my\s+dashboard)\b/i.test(t)
      || /\b(hide|show|unhide)\s+(the\s+|my\s+)?(today|open|latest|grades?|inbox|email|mail|machine|computer|tasks?)\b/i.test(t);
    if (tileToggle) {
      const key = resolveTileKey(t);
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      let say;
      if (!key) {
        say = "Which tile — Today, Open, Latest, Grades, Inbox, or Machine?";
      } else {
        const hide = /\b(hide|remove)\b/i.test(t);
        setTileHidden(key, hide);
        const label = (ALL_TILES.find((x) => x.key === key) || {}).label || key;
        say = hide ? `Hidden the ${label} tile.` : `The ${label} tile is back.`;
      }
      setReply(say); pushTurn("signal", say); speak(say);
      return;
    }

    // ---- Logs: create / append / continue / read / bare-journal ----
    // A statistics/habit question ("how often…", "gym log stats", "how many times…")
    // is NOT a log read/append — let it fall through to the intent route, which
    // answers from precomputed log analytics.
    const statsQ = /\b(statistics?|stats|how many times|how often|how frequently|frequency|last time i|when did i last|streak|per (week|month|day)|average|trend|how consistent|consistency)\b/i.test(t);
    const logStart = !statsQ ? parseLogStart(t) : null;
    const logAppend = !statsQ && !logStart ? parseLogAppend(t) : null;
    const logRead = !statsQ && !logStart && !logAppend ? parseLogRead(t) : null;
    const logContinue = !statsQ && !logStart && !logAppend && !logRead ? parseLogContinue(t) : null;
    const logBare = !statsQ && !logStart && !logAppend && !logRead && !logContinue ? parseLogBare(t) : null;
    if (logRead) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      const r = await readLog(logRead.name);
      const spoken = !r ? `You don't have a ${logRead.name} log yet.`
        : r.entries.length ? `Your ${r.title} log — ${r.entries.join("; ")}.`
        : `Your ${r.title} log is empty so far.`;
      setReply(spoken); pushTurn("signal", spoken); speak(spoken);
      return;
    }
    if (logStart) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      setActiveLog(logStart.name);
      if (logStart.entry) { await logToNamed(logStart.name, logStart.entry); }
      else { const say = `Started your ${logStart.name} log — what's the first entry?`; setReply(say); pushTurn("signal", say); speak(say); }
      return;
    }
    if (logAppend) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      setActiveLog(logAppend.name);
      if (logAppend.entry) { await logToNamed(logAppend.name, logAppend.entry); }
      else { const say = `Go on — what shall I add to your ${logAppend.name} log?`; setReply(say); pushTurn("signal", say); speak(say); }
      return;
    }
    if (logContinue) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      const active = getActiveLog();
      if (!active) { const say = "Which log? Say, for instance, add to my workouts log."; setReply(say); pushTurn("signal", say); speak(say); return; }
      if (logContinue.entry) { await logToNamed(active, logContinue.entry); }
      else { const say = `Go on — what's next for your ${active} log?`; setReply(say); pushTurn("signal", say); speak(say); }
      return;
    }
    if (logBare) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      // Deictic "log it/this" with nothing after → use the last thing Donna said.
      let content = logBare.entry;
      if (!content) {
        const lastSignal = [...turns].reverse().find((x) => x.who === "signal");
        content = (lastSignal && lastSignal.text) || reply || "";
      }
      if (!content) { const say = "What would you like me to log?"; setReply(say); pushTurn("signal", say); speak(say); return; }
      await smartLog(content);
      return;
    }

    // ---- Google: read Gmail / Docs / Slides, and reply by voice ----
    // Confirm a staged reply/email draft by voice.
    if (emailDraftRef.current && /^\s*(send(\s+it)?|confirm|yes,?\s*send|go ahead|send that|send the email)\s*[.!]?$/i.test(t)) {
      setHeard(t); pushTurn("you", t); sendEmailDraft(); return;
    }
    const isSendish = /^\s*(send|write|draft|compose|reply)\b/i.test(t) || /^\s*e?mails?\s+(my|to|him|her|them|the|prof|\w+@)/i.test(t);
    const mailRead = !isSendish && /\b(e?mails?|inbox|gmail)\b/i.test(t)
      && /\b(read|check|show|any|have|got|what|whats|summari[sz]e|go\s+through|latest|new|newest|recent|unread|from|about|catch)\b/i.test(t);
    const docM = /\bdoc(ument)?s?\b/i.test(t) && /\b(read|open|show|summari[sz]e|what|whats|pull\s*up|find|get|about|on|called|titled)\b/i.test(t);
    const slideM = /\b(slides?|deck|presentation|powerpoint)\b/i.test(t) && /\b(read|open|show|summar|what|whats|about|on|for|find|pull\s*up|get)\b/i.test(t);

    if (mailRead) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply(""); setSources([]); setMode("processing");
      let mailQuery = "in:inbox newer_than:7d";
      const fromM = /\bfrom\s+([a-z0-9 ._@-]{2,40})/i.exec(t);
      if (fromM) { const nm = fromM[1].replace(/^(my|the)\s+/i, "").trim().split(/\s+/)[0]; if (nm) mailQuery = `from:${nm}`; }
      else if (/\bunread\b/i.test(t)) mailQuery = "is:unread newer_than:7d";
      else if (/\b(latest|last|newest)\b/i.test(t)) mailQuery = "in:inbox";
      try {
        const r = await base44.functions.invoke("donna", { route: "google", op: "mail", query: mailQuery, question: t });
        const d = r && r.data ? r.data : r || {};
        if (d.from) lastEmailRef.current = { from: d.from, subject: (d.items && d.items[0] && d.items[0].subject) || "" };
        const spoken = d.spoken || "I couldn't read your inbox.";
        setReply(spoken); pushTurn("signal", spoken); speak(spoken);
      } catch { setMode("idle"); setNote("I couldn't reach your Google account."); }
      return;
    }
    if (/^\s*reply\b/i.test(t)) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply("");
      const addr = (lastEmailRef.current?.from || "").match(/[^<>\s]+@[^<>\s]+/);
      const sayM = /\b(saying|say|that|with the message|with)\s+(.+)$/i.exec(t);
      const replyBody = sayM ? sayM[2].trim() : "";
      let say;
      if (!addr) say = "Read an email first, then I'll know who to reply to.";
      else if (!replyBody) say = "What should the reply say?";
      else {
        const subj = lastEmailRef.current?.subject || "";
        setEmailDraft({ to: addr[0], subject: subj ? (/^re:/i.test(subj) ? subj : `Re: ${subj}`) : "Re:", body: replyBody });
        const who = (lastEmailRef.current?.from || "").replace(/<[^>]+>/, "").trim() || addr[0];
        say = `Here's your reply to ${who} — say "send it" to send, or edit it below.`;
      }
      setReply(say); pushTurn("signal", say); speak(say);
      return;
    }
    if (docM || slideM) {
      setHeard(t); pushTurn("you", t); setNote(""); setReply(""); setSources([]); setMode("processing");
      const op = slideM ? "slides" : "doc";
      const topicM = /\b(?:about|on|called|named|titled|for|regarding)\s+(.+)$/i.exec(t);
      const query = topicM ? topicM[1].replace(/[.?!]$/, "").trim()
        : t.replace(/\b(read|open|show|summari[sz]e|what.?s|whats|in|my|the|a|an|doc|document|documents|slides?|deck|presentation|powerpoint|pull|up|find|get)\b/gi, " ").replace(/\s+/g, " ").trim();
      try {
        const r = await base44.functions.invoke("donna", { route: "google", op, query, question: t });
        const d = r && r.data ? r.data : r || {};
        if (d.link) setSources([{ title: d.title || (op === "slides" ? "Slides" : "Document"), url: d.link }]);
        const spoken = d.spoken || "I couldn't find that.";
        setReply(spoken); pushTurn("signal", spoken); speak(spoken);
      } catch { setMode("idle"); setNote("I couldn't reach your Drive."); }
      return;
    }

    setHeard(t);
    // If this input answers a tapped question in the "To answer" box, check it off.
    const answeringQ = answeringRef.current;
    answeringRef.current = null;
    if (answeringQ) setAnsweredQ((prev) => new Set(prev).add(answeringQ));
    pushTurn("you", t);
    setReply("");
    setNote("");
    setSources([]);
    setMode("processing");
    try {
      // Brain-dump cleaner: "brain dump …", "clean this up …", "organise this …"
      // → sends the ramble to the cleanup route and saves a tidy note.
      const cleanupMatch = /^(brain\s*dump|clean\s+(this\s+)?up|organi[sz]e\s+(this|these|my)\b)[:,]?\s*/i.exec(t);
      if (cleanupMatch) {
        const raw = t.slice(cleanupMatch[0].length).trim() || t;
        const cres = await base44.functions.invoke("donna", { route: "cleanup", text: raw });
        const cdata = cres && cres.data ? cres.data : cres || {};
        if (cdata.content) {
          await base44.entities.Page.create({ title: cdata.title || "Note", type: "document", content: cdata.content, source: "donna" }).catch(() => null);
        }
        const spoken = cdata.spoken || `Sorted — saved "${cdata.title || "your note"}".`;
        setNote(`Saved "${cdata.title || "Note"}" to your notes`);
        setReply(spoken); pushTurn("signal", spoken); speak(spoken);
        queryClient.invalidateQueries({ queryKey: ["grid"] });
        return;
      }

      // Local knowledge search: "search my notes for X" / "find my note about X".
      const searchMatch =
        /^(search|find|look\s+up)\s+(my\s+)?(notes?|files?|vault|documents?)\b[:\s]*(for|about|on)?\s*/i.exec(t) ||
        /^find\s+(my\s+|the\s+)?note[s]?\s+(about|on|for|called)\s+/i.exec(t);
      if (searchMatch) {
        const q = t.slice(searchMatch[0].length).trim() || t;
        // Try semantic search (embeddings) first; fall back to client keyword ranking.
        let results = [];
        try {
          const sres = await base44.functions.invoke("donna", { route: "semantic-search", query: q });
          const sdata = sres && sres.data ? sres.data : sres || {};
          results = Array.isArray(sdata.results) ? sdata.results : [];
        } catch { /* fall through */ }
        if (!results.length) {
          const all = await base44.entities.Note.list("-modified", 400).catch(() => []);
          results = rankNotes(Array.isArray(all) ? all : [], q).slice(0, 5);
        }
        let spoken;
        if (!results.length) {
          spoken = `I couldn't find anything about ${q} in your notes. Is the local worker indexing them?`;
        } else {
          const top = results[0];
          spoken = `Found ${results.length}. Top match: ${top.title}${top.folder ? `, in ${top.folder}` : ""}.`;
          setSources(results.map((r) => ({
            title: r.title + (r.folder ? ` · ${r.folder}` : ""),
            url: r.path ? `obsidian://open?path=${encodeURIComponent(r.path)}` : "",
          })));
        }
        setReply(spoken); pushTurn("signal", spoken); speak(spoken);
        return;
      }

      // Capture an idea: "capture this idea …", "new idea …", "save this idea …"
      // → categorised + queued for the Obsidian vault, with a duplicate check.
      const captureMatch =
        /^(capture|save|jot|note|log)\s+(this\s+)?(idea|thought)\b[:,]?\s*/i.exec(t) ||
        /^(new idea|idea)[:,]\s*/i.exec(t);
      if (captureMatch) {
        const idea = t.slice(captureMatch[0].length).trim() || t;
        const cres = await base44.functions.invoke("donna", { route: "capture", text: idea });
        const cdata = cres && cres.data ? cres.data : cres || {};
        const spoken = cdata.spoken || `Filed under ${cdata.bucket || "Note"}.`;
        setNote(`Captured → ${cdata.bucket || "Note"}: ${cdata.title || ""}`);
        setReply(spoken); pushTurn("signal", spoken); speak(spoken);
        return;
      }

      // Orchestration: "orchestrate …", "run command …", "execute …", "tell claude …"
      // → queued for the local worker to run (only executes if orchestration is on).
      const commandMatch =
        /^orchestrate\s+/i.exec(t) ||
        /^(tell|ask)\s+claude(\s+code)?\b[:,]?\s*(to\s+)?/i.exec(t) ||
        /^run\s+command\b[:,]?\s*/i.exec(t) ||
        /^execute\b[:,]?\s*/i.exec(t);
      if (commandMatch) {
        const cmd = t.slice(commandMatch[0].length).trim();
        if (cmd) {
          const qres = await base44.functions.invoke("donna", { route: "command", text: cmd });
          const qdata = qres && qres.data ? qres.data : qres || {};
          if (qdata.queued) {
            const spoken = "On it — running that now.";
            setNote("Running…"); setReply(spoken); pushTurn("signal", spoken); speak(spoken);
            pollCommand(qdata.id);
          } else {
            setMode("idle"); setNote("Couldn't queue that command.");
          }
          return;
        }
      }

      const [commitments, tasksRaw, domains, signalsRaw, gradesRaw, pagesRaw] = await Promise.all([
        base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
        base44.entities.Task.list("-created_date").catch(() => []),
        base44.entities.Domain.list("sort_order").catch(() => []),
        base44.entities.Signal.list("-created_date", 80).catch(() => []),
        base44.entities.Grade.list("-updated_date", 60).catch(() => []),
        base44.entities.Page.list("-updated_date", 25).catch(() => []),
      ]);
      // Recent notes/logs so Donna can recall what was captured earlier (not just this chat).
      const recentNotes = (Array.isArray(pagesRaw) ? pagesRaw : []).slice(0, 20).map((p) => ({
        title: p.title || "Note",
        snippet: String(p.content || "").replace(/\s+/g, " ").slice(0, 180),
      }));
      const today = todayKey();
      const allTasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      const todayTasks = allTasks
        .filter((x) => x && x.due_date === today)
        .slice(0, 25)
        .map((x) => ({ title: x.title || "", status: x.status || "" }));

      // Derive calendar + email context from ingested Google signals (Phase C).
      const signals = Array.isArray(signalsRaw) ? signalsRaw : [];
      const nowMs = Date.now();
      const calendar = signals
        .filter((s) => s && s.kind === "calendar" && s.occurred_at)
        .filter((s) => new Date(s.occurred_at).getTime() > nowMs - 2 * 3600 * 1000)
        .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at))
        .slice(0, 30)
        .map((s) => ({ title: s.title || "", when: s.summary || s.occurred_at }));
      const emails = signals
        .filter((s) => s && s.kind === "email")
        .slice(0, 15)
        .map((s) => ({ subject: s.title || "", summary: s.summary || "" }));

      // Open to-do lists = open tasks grouped by category (the list name).
      const openTasks = allTasks.filter((x) => x && x.status !== "done");
      const listMap = {};
      for (const x of openTasks) {
        const k = x.category || "General";
        (listMap[k] = listMap[k] || []).push(x.title || "");
      }
      const lists = Object.entries(listMap).map(([name, items]) => ({ name, items: items.slice(0, 25) })).slice(0, 12);

      const grades = (Array.isArray(gradesRaw) ? gradesRaw : []).slice(0, 40).map((g) => ({
        course: g.course || "", assignment: g.assignment || null,
        score: g.score ?? null, max: g.max_score ?? g.max ?? null,
      }));

      const res = await base44.functions.invoke("donna", {
        route: "intent",
        transcript: t,
        prefs: personaPrefsForServer(prefsRef.current),
        // Recent conversation (excluding this very message) so follow-ups like
        // "no" after "add a deadline?" resolve in context instead of resetting.
        history: (turnsRef.current || []).filter((x) => x.text !== t).slice(-8).map((x) => ({ who: x.who === "you" ? "user" : "assistant", text: x.text })),
        context: {
          today,
          commitments: (Array.isArray(commitments) ? commitments : []).map((c) => ({ text: c.text, due_on: c.due_on })),
          tasks: todayTasks,
          lists,
          calendar,
          emails,
          grades,
          recent_notes: recentNotes,
          domains: Array.isArray(domains) ? domains : [],
        },
      });
      const data = res && res.data ? res.data : res || {};
      const actions = Array.isArray(data.actions) ? data.actions : [];
      const spoken = data.reply ? String(data.reply) : "Noted.";

      // Email actions are DRAFTS — never auto-sent. Stage the first for review.
      const emailAction = actions.find((a) => a && a.type === "email");
      if (emailAction) {
        setEmailDraft({ to: emailAction.to || "", subject: emailAction.subject || "", body: emailAction.body || "" });
      }
      const researchAction = actions.find((a) => a && a.type === "research" && a.query);
      const otherActions = actions.filter((a) => a && a.type !== "email" && a.type !== "research");

      // SAFETY: never let one command delete a pile of things. If it would remove
      // more than 2 items, run everything EXCEPT the deletions and hold those for an
      // explicit spoken confirmation — this is the guard against the "delete a couple
      // → deleted everything" wipe.
      const removeActions = otherActions.filter((a) => a.type === "remove");
      if (removeActions.length > 2) {
        const safeActions = otherActions.filter((a) => a.type !== "remove");
        const { records } = await applyActions(safeActions, today, allTasks);
        setLastActions(records);
        lastAppliedRef.current = safeActions;
        pendingDeletionsRef.current = removeActions;
        setPendingDeleteCount(removeActions.length);
        queryClient.invalidateQueries({ queryKey: ["grid"] });
        const warn = `Hold on — that would delete ${removeActions.length} items. Say "yes, delete them" to confirm, or "cancel" to keep them.`;
        setHeard(t); pushTurn("you", t); setReply(warn); pushTurn("signal", warn); speak(warn);
        setMode("idle");
        return;
      }

      const { count, records } = await applyActions(otherActions, today, allTasks);
      setLastActions(records);
      lastAppliedRef.current = otherActions;
      setRedoActions([]);
      if (count) {
        setNote(`${count} action${count > 1 ? "s" : ""} done`);
        queryClient.invalidateQueries({ queryKey: ["grid"] });
        queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
      }

      if (researchAction) {
        // Show the "let me look that up" line, then fetch and speak the real answer.
        setReply(spoken);
        pushTurn("signal", spoken);
        setNote("Looking that up…");
        try {
          const rres = await base44.functions.invoke("donna", { route: "research", query: researchAction.query });
          const rdata = rres && rres.data ? rres.data : rres || {};
          const answer = rdata.answer ? String(rdata.answer) : "I couldn't find much on that.";
          setSources(Array.isArray(rdata.sources) ? rdata.sources.filter((s) => s && s.url) : []);
          setNote(rdata.live === false ? "From general knowledge — verify the current details." : "");
          setReply(answer);
          pushTurn("signal", answer);
          speak(answer);
        } catch {
          setNote("I couldn't complete that lookup — try again.");
          setMode("idle");
        }
      } else {
        setReply(spoken);
        pushTurn("signal", spoken);
        speak(spoken);
      }
    } catch (err) {
      setMode("idle");
      setNote(err?.message || "I couldn't reach the server — try again.");
    }
  }, [queryClient, pushTurn]);

  const voice = useVoice({ onFinalTranscript: handleTranscript });

  // Always listening (unless muted) — no wake word: anything you say is a command.
  // The mic pauses whenever Donna isn't idle: while a command is being captured or
  // handled (so we don't re-trigger mid-thought) AND while she's speaking. Pausing
  // during speech is essential on phones — an open mic holds the audio session and
  // her reply comes out inaudible, and it also stops the recognizer from mishearing
  // her own voice and cutting her off. To interrupt her, tap the orb.
  useWakeWord({
    enabled: !muted && !chatMode,
    active: mode !== "idle" || briefingActive,
    onCommand: handleTranscript,
    echoText: spoken.text,   // ignore her own audio echoing back through the mic
    pauseMs: prefs.nudges?.pauseMs || 1500,
  });

  // A fresh reply from Donna = a fresh set of questions → clear the answered marks.
  useEffect(() => { setAnsweredQ(new Set()); answeringRef.current = null; }, [reply]);
  const [sendingBrief, setSendingBrief] = useState(false);
  const sendTestBriefing = async () => {
    if (sendingBrief) return;
    setSendingBrief(true);
    setNote("Sending a test briefing to your email…");
    try {
      const r = await base44.functions.invoke("donna", { route: "test-brief" });
      const d = (r && r.data) || r || {};
      if (d.sent) setNote(`Sent (${d.mode || "?"}${d.mode === "static" && d.reason ? ` — ${d.reason}` : ""}) — check your inbox.`);
      else setNote(`Couldn't send${d.reason ? ` — ${d.reason}` : " — email not configured"}.`);
    } catch {
      setNote("Couldn't send the test briefing.");
    } finally {
      setSendingBrief(false);
    }
  };

  const toggleMute = () => {
    setMuted((v) => {
      const next = !v;
      try { localStorage.setItem("donna_muted", next ? "1" : "0"); } catch { /* ignore */ }
      if (!next) {
        primeTTS(); // unmuting is a gesture → unlock TTS + prompt mic
      } else {
        // Muting must release the mic completely — no orange dot while muted.
        try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
        try { voice.stop(); } catch { /* ignore */ }   // release any push-to-talk capture
        setBriefingActive(false);                        // stop the briefing's recognizer
        setMode("idle");                                 // tears down the always-on wake word
      }
      return next;
    });
  };

  // Surface the result of the Google OAuth round-trip (?google=connected|denied|…).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (!g) return;
    const msg = {
      connected: "Google connected — I'll start pulling your highlights.",
      denied: "Google connection was cancelled.",
      norefresh: "Google didn't return a refresh token — try connecting again.",
      unconfigured: "Google isn't set up on the server yet.",
      error: "Something went wrong connecting Google.",
    }[g] || "";
    if (msg) setNote(msg);
    // Clean the query string so a refresh doesn't repeat the message.
    params.delete("google");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    setTtsSupported(ok);
    if (!ok) return;
    window.speechSynthesis.getVoices();
    const onVoices = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", onVoices);

    // Mobile browsers block speech until a user gesture has unlocked audio. Prime it
    // once on the first tap/keypress anywhere so replies (which fire asynchronously,
    // outside a gesture) are audible from then on.
    const unlock = () => {
      try {
        window.speechSynthesis.resume();
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch { /* ignore */ }
      // Prime the <audio> element so server-TTS replies can autoplay later.
      try {
        const a = ttsAudioRef.current || (ttsAudioRef.current = new Audio());
        a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YQAAAAA=";
        a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      } catch { /* ignore */ }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    // Resume pump — Chrome's synth silently wedges (pauses) after idle/long text;
    // nudging resume() when it's mid-speech but paused keeps audio flowing.
    const pump = window.setInterval(() => {
      try { const s = window.speechSynthesis; if (s && s.speaking && s.paused) s.resume(); } catch { /* ignore */ }
    }, 3000);

    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.clearInterval(pump);
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    };
  }, []);

  // Keep the chat transcript pinned to the newest message.
  useEffect(() => {
    if (!chatMode) return;
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, chatMode, mode]);

  // Decide (once, on load) whether Signal has something worth asking about — i.e.
  // there are open commitments or open list items — and it hasn't nudged recently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (chatModeRef.current) return; // chat mode is never proactive
        const until = Number(localStorage.getItem("jarvis_nudge_until") || 0);
        if (Date.now() < until) return;
        if (briefingPending()) return; // let the daily briefing own the alert first
        const [commits, tasksRaw] = await Promise.all([
          base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
          base44.entities.Task.list("-created_date", 100).catch(() => []),
        ]);
        const openTasks = (Array.isArray(tasksRaw) ? tasksRaw : []).filter((x) => x && x.status !== "done");
        const openCount = (Array.isArray(commits) ? commits.length : 0) + openTasks.length;
        if (!cancelled && openCount > 0) setNudgeReady(true);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep the caption transcript scrolled to the latest line.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, voice.partial, mode]);

  // Silence the nudge for a while (after it's heard or dismissed).
  const quietNudge = () => {
    try { localStorage.setItem("jarvis_nudge_until", String(Date.now() + 6 * 3600 * 1000)); } catch { /* ignore */ }
    setNudgeReady(false);
  };

  // The user granted "permission to talk" — fetch a short proactive question and speak it.
  const hearNudge = async () => {
    if (mode === "processing") return;
    primeTTS();
    quietNudge();
    setHeard(""); setReply(""); setNote(""); setLastActions([]);
    setMode("processing");
    try {
      const today = todayKey();
      const [commits, tasksRaw] = await Promise.all([
        base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
        base44.entities.Task.list("-created_date", 100).catch(() => []),
      ]);
      const openTasks = (Array.isArray(tasksRaw) ? tasksRaw : []).filter((x) => x && x.status !== "done");
      const listMap = {};
      for (const x of openTasks) { const k = x.category || "General"; (listMap[k] = listMap[k] || []).push(x.title || ""); }
      const lists = Object.entries(listMap).map(([name, items]) => ({ name, items: items.slice(0, 20) })).slice(0, 12);
      const res = await base44.functions.invoke("donna", {
        route: "nudge",
        prefs: personaPrefsForServer(prefsRef.current),
        context: {
          today,
          commitments: (Array.isArray(commits) ? commits : []).map((c) => ({ text: c.text, due_on: c.due_on })),
          lists,
          tasks: openTasks.slice(0, 20).map((x) => ({ title: x.title, category: x.category })),
        },
      });
      const data = res && res.data ? res.data : res || {};
      const say = data.say ? String(data.say) : "";
      if (say) {
        // Remember what this nudge was about so a "skip/no/cancel" reply can
        // actually dismiss the underlying commitment (not just quiet it 6h).
        pendingNudgeRef.current = { commitments: (Array.isArray(commits) ? commits : []).map((c) => ({ id: c.id, text: c.text })), say, at: Date.now() };
        setReply(say); pushTurn("signal", say); speak(say);
      } else setMode("idle");
    } catch {
      setMode("idle");
      setNote("Couldn't reach the server — try again.");
    }
  };

  // Choose which open commitment a dismissal refers to: keywords from the user's
  // reply first, then the nudge's own wording, then the sole candidate.
  const pickCommitment = (candidates, replyText, sayText, allowSingle = true) => {
    const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
    const stop = new Set(["skip", "cancel", "forget", "about", "that", "this", "stop", "reminding", "bringing", "remind", "dont", "don", "want", "doing", "never", "mind", "drop", "them", "with", "make", "share", "shared", "list"]);
    const overlap = (text, keys) => keys.filter((w) => !stop.has(w) && String(text || "").toLowerCase().includes(w)).length;
    let best = null, bestScore = 0;
    for (const c of candidates) {
      const s = overlap(c.text, words(replyText)) * 2 + overlap(c.text, words(sayText));
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && bestScore > 0) return best;
    return allowSingle && candidates.length === 1 ? candidates[0] : null;
  };

  // ---- Create a calendar event (a dated Task), auto-creating its category with an
  //      unused colour when it's new. Speaks a confirmation and offers Undo. ----
  // Mirror a calendar event to Google (create or update); returns the event id or null.
  const pushEventToGoogle = async (title, date, gcalId) => {
    try {
      const res = await base44.functions.invoke("donna", { route: "gcal-push", title, date, gcalId: gcalId || null });
      const d = (res && res.data) ? res.data : res || {};
      return d.ok ? (d.gcalId || null) : null;
    } catch { return null; }
  };
  const deleteEventFromGoogle = (gcalId) => {
    if (!gcalId) return;
    base44.functions.invoke("donna", { route: "gcal-delete", gcalId }).catch(() => {});
  };

  async function createCalendarEvent({ title, date, category }) {
    setMode("processing");
    try {
      let catKey = null, catLabel = null, madeNew = false;
      if (category) {
        const catsRaw = await base44.entities.Category.list().catch(() => []);
        const cats = Array.isArray(catsRaw) ? catsRaw : [];
        const key = slugify(category);
        const existing = cats.find((c) => (c.label || "").toLowerCase() === category.toLowerCase() || (c.key || "") === key);
        if (existing) { catKey = existing.key || key; catLabel = existing.label || category; }
        else {
          catKey = key; catLabel = category; madeNew = true;
          const color = pickUnusedColor([...cats.map((c) => c.color), ...DEFAULT_CATEGORY_COLORS]);
          await base44.entities.Category.create({ label: category, key: catKey, color }).catch(() => {});
        }
      }
      const rec = await base44.entities.Task.create({ title, due_date: date, category: catKey || "work", status: "not_started" });
      // Mirror to Google Calendar (best-effort); store the event id for later edits/sync.
      pushEventToGoogle(title, date, null).then((gid) => { if (gid && rec?.id) base44.entities.Task.update(rec.id, { gcal_id: gid }).catch(() => {}); });
      try {
        const logged = await base44.entities.AgentAction.create({
          action_type: "add", target: "tasks/" + (rec?.id || ""),
          payload: { title, due_date: date, category: catKey },
          executed_at: new Date().toISOString(),
          undo_deadline: new Date(Date.now() + 86400000).toISOString(),
        });
        if (logged?.id) setLastActions([logged]);
      } catch { /* undo logging is best-effort */ }
      queryClient.invalidateQueries({ queryKey: ["grid"] });
      const catPart = catLabel ? ` under ${catLabel}${madeNew ? " (new category)" : ""}` : "";
      const say = `Added "${title}" on ${friendlyDate(date)}${catPart}.`;
      setNote(say); setReply(say); pushTurn("signal", say); speak(say);
    } catch {
      setMode("idle");
      const say = "I couldn't add that to your calendar — try again.";
      setReply(say); pushTurn("signal", say); speak(say);
    }
  }

  // ---- create the entities the intent asked for, logging each to AgentAction ----
  // Returns { count, records } where records are the AgentAction docs (with id +
  // target) so the caller can offer an immediate Undo.
  async function applyActions(actions, today, allTasks = []) {
    if (!actions.length) return { count: 0, records: [] };
    let n = 0;
    const records = [];
    for (const a of actions) {
      try {
        let target = "";
        if (a.type === "remind") {
          const rec = await base44.entities.Commitment.create({
            text: a.text, domain_id: null, stated_on: today, due_on: a.due_on || null, status: "open", source: "stated",
          });
          target = "commitments/" + (rec?.id || "");
        } else if (a.type === "log") {
          // Append to a running LOG document (named, or the default Journal).
          const { page, created, prevContent } = await appendToLog(a.log || "Journal", a.text, today);
          n++;
          records.push({ kind: "log", pageId: page.id, prevContent, created });
          continue; // carries its own undo record; skip the generic AgentAction below
        } else if (a.type === "monitor") {
          const rec = await base44.entities.Insight.create({
            kind: "metric", content: a.metric + (a.value != null ? ": " + a.value : ""), evidence: a.note ? { note: a.note } : null,
          });
          target = "insights/" + (rec?.id || "");
        } else if (a.type === "write") {
          const rec = await base44.entities.Page.create({ title: a.title, type: "document", content: a.body, source: "donna" });
          target = "pages/" + (rec?.id || "");
        } else if (a.type === "grade") {
          const rec = await base44.entities.Grade.create({
            course: a.course, assignment: a.assignment || null,
            score: a.score, max_score: a.max ?? null,
            graded_on: today, source: "pasted",
          });
          target = "grades/" + (rec?.id || "");
        } else if (a.type === "add") {
          // A new item on a named to-do list = a Task tagged with the list name.
          const rec = await base44.entities.Task.create({
            title: a.text, category: a.list || "Business", status: "not_started",
          });
          target = "tasks/" + (rec?.id || "");
        } else if (a.type === "complete" || a.type === "remove") {
          // Resolve which existing list item they meant, then complete/delete it.
          const match = findTask(allTasks, a.text, a.list);
          if (match?.id) {
            if (a.type === "complete") {
              await base44.entities.Task.update(match.id, { status: "done" });
              n++;
            } else {
              // Snapshot BEFORE deleting so the deletion can be fully undone (task
              // re-created + re-pushed to Google Calendar).
              const snapshot = {
                title: match.title, category: match.category || null, status: match.status || "not_started",
                due_date: match.due_date || null, gcal_id: match.gcal_id || null, notes: match.notes || null,
              };
              await base44.entities.Task.delete(match.id);
              deleteEventFromGoogle(match.gcal_id);
              n++;
              const rec = { kind: "delete", snapshot };
              try {
                const logged = await base44.entities.AgentAction.create({
                  action_type: "remove", target: "tasks/" + match.id, payload: { ...a, snapshot },
                  executed_at: new Date().toISOString(),
                  undo_deadline: new Date(Date.now() + 86400000).toISOString(),
                });
                if (logged?.id) rec.actionId = logged.id;
              } catch { /* deletion still undoable via the in-memory record */ }
              records.push(rec);
            }
          }
          continue; // executed in place
        } else {
          continue;
        }
        n++;
        // Log for the 24h undo trail; capture the record so we can offer Undo now.
        try {
          const logged = await base44.entities.AgentAction.create({
            action_type: a.type,
            target,
            payload: a,
            executed_at: new Date().toISOString(),
            undo_deadline: new Date(Date.now() + 86400000).toISOString(),
          });
          if (logged?.id) records.push(logged);
        } catch { /* logging failure shouldn't break the action */ }
      } catch { /* one failed action shouldn't sink the rest */ }
    }
    return { count: n, records };
  }

  // ---- Speak a reply. Prefers reliable server-side TTS (OpenAI → <audio>), which
  //      sidesteps the flaky Web Speech API; falls back to the browser engine only
  //      if the server route is unavailable. Returns a Promise that resolves when
  //      speech ends, so callers (e.g. the evening review) can sequence lines. ----
  function speak(text) {
    if (!text) { setMode("idle"); return Promise.resolve(); }
    // Chat mode is text-only — the reply is already shown in the transcript.
    if (chatModeRef.current) { setMode("idle"); return Promise.resolve(); }
    if (!serverTtsOkRef.current) return browserSpeak(text);
    return serverSpeak(text).then((played) => (played ? undefined : browserSpeak(text)));
  }

  // Fetch MP3 from the server and play it through a shared <audio> element. Resolves
  // true if it actually played, false to fall back to the browser engine.
  async function serverSpeak(text) {
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* interrupt browser TTS */ }
    let data;
    try {
      const res = await base44.functions.invoke("donna", {
        route: "tts", text,
        voice: prefsRef.current.voice?.prefer || "female",
        british: prefsRef.current.persona?.british !== false,
      });
      data = (res && res.data) ? res.data : res || {};
    } catch { serverTtsOkRef.current = false; return false; }
    if (!data || !data.audio) { if (data && data.error) serverTtsOkRef.current = false; return false; }

    const audio = ttsAudioRef.current || (ttsAudioRef.current = new Audio());
    audio.src = `data:${data.mime || "audio/mpeg"};base64,${data.audio}`;
    audio.volume = 1;

    setSpoken({ text, idx: 0 });
    setMode("speaking"); voice.amplitudeRef.current = 1;
    const startTs = Date.now();
    const rate = Number(prefsRef.current.voice?.rate) || 1;
    const timer = window.setInterval(() => {
      const est = Math.min(text.length, (Date.now() - startTs) * 0.016 * rate * 60 / 60);
      setSpoken((s) => (s.text === text ? { ...s, idx: Math.max(s.idx, est) } : s));
    }, 80);

    let played = true;
    await new Promise((res) => {
      let settled = false;
      const done = () => { if (settled) return; settled = true; res(); };
      audio.onended = done;
      audio.onerror = () => { played = false; done(); };
      audio.play().then(() => {}).catch(() => { played = false; done(); });
      // Safety timeout in case events never fire.
      window.setTimeout(() => { if (!settled) { played = audio.currentTime > 0; done(); } }, Math.max(4000, text.length * 90));
    });

    window.clearInterval(timer);
    if (played) {
      setSpoken((s) => (s.text === text ? { ...s, idx: text.length } : s));
      window.setTimeout(() => setSpoken((s) => (s.text === text ? { text: "", idx: 0 } : s)), 800);
    }
    setMode("idle"); voice.amplitudeRef.current = 0;
    return played;
  }

  // ---- Browser Web Speech fallback. Returns a Promise that resolves when speech ends. ----
  function browserSpeak(text) {
    return new Promise((resolve) => {
      if (!ttsSupported || !text) { setMode("idle"); resolve(); return; }
      try {
        const synth = window.speechSynthesis;
        try { synth.cancel(); } catch { /* clear any stuck utterance */ }
        const u = new SpeechSynthesisUtterance(text);
        const vp = prefsRef.current.voice || {};
        u.rate = Number(vp.rate) || 1.02; u.pitch = 1; u.volume = 1;
        const v = pickVoice(synth.getVoices() || [], vp.prefer || "female", prefsRef.current.persona?.british !== false);
        if (v) u.voice = v;

        setSpoken({ text, idx: 0 });
        let boundaryFired = false;
        let started = false;
        let done = false;
        let timer = null;
        let watchdog = null;
        const startTs = Date.now();
        const startTimer = () => {
          // Advance the karaoke cursor by a time estimate; boundary events (when the
          // voice fires them) override it for accuracy.
          timer = setInterval(() => {
            if (boundaryFired) return;
            const est = Math.min(text.length, (Date.now() - startTs) * 0.0145 * (u.rate || 1));
            setSpoken((s) => (s.text === text ? { ...s, idx: Math.max(s.idx, est) } : s));
          }, 80);
        };
        const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
        const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };
        // Chrome pauses the synth mid-utterance after ~15s; nudge it to keep talking.
        let keepAlive = window.setInterval(() => {
          try { if (synth.speaking && !synth.paused) synth.resume(); } catch { /* ignore */ }
        }, 4000);
        const stopKeepAlive = () => { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } };
        const finish = () => {
          if (done) return; done = true;
          clearWatchdog(); stopTimer(); stopKeepAlive();
          setMode("idle"); voice.amplitudeRef.current = 0;
          resolve();
        };

        u.onstart = () => { started = true; clearWatchdog(); setMode("speaking"); voice.amplitudeRef.current = 1; startTimer(); };
        u.onboundary = (e) => {
          boundaryFired = true; voice.amplitudeRef.current = 1;
          if (typeof e.charIndex === "number") setSpoken((s) => (s.text === text ? { ...s, idx: e.charIndex } : s));
        };
        u.onend = () => {
          setSpoken((s) => (s.text === text ? { ...s, idx: text.length } : s));
          // Clear the caption a beat after she finishes talking.
          window.setTimeout(() => setSpoken((s) => (s.text === text ? { text: "", idx: 0 } : s)), 800);
          finish();
        };
        u.onerror = () => finish();

        setMode("speaking");
        // Chrome silently drops an utterance queued in the same tick as cancel()
        // (no onstart/onend → no audio and a stuck orb). Queue on the next tick,
        // and if it never starts, retry once, then recover gracefully.
        let retried = false;
        const fire = () => {
          if (done) return;
          try { synth.resume(); } catch { /* some browsers start paused */ }
          try { synth.speak(u); } catch { finish(); return; }
          clearWatchdog();
          watchdog = window.setTimeout(() => {
            if (started || done) return;
            if (!retried) {
              retried = true;
              try { synth.cancel(); } catch { /* ignore */ }
              window.setTimeout(fire, 60);
            } else {
              // The engine won't start — don't hang the orb on "speaking".
              setSpoken((s) => (s.text === text ? { text: "", idx: 0 } : s));
              finish();
            }
          }, 1600);
        };
        window.setTimeout(fire, 60);
      } catch {
        setMode("idle");
        resolve();
      }
    });
  }

  // Undo everything the last command did — including restoring deleted events
  // (re-created + re-pushed to Google). Stashes the actions so Redo can re-apply.
  async function undoLast() {
    if (!lastActions.length || undoing) return;
    setUndoing(true);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    const n = await reverseMany(lastActions);
    setRedoActions(lastAppliedRef.current || []);
    setLastActions([]);
    setNote(n ? `Undone — restored ${n} item${n > 1 ? "s" : ""}.` : "Nothing to undo.");
    setReply("");
    setMode("idle");
    queryClient.invalidateQueries({ queryKey: ["grid"] });
    queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
    setUndoing(false);
  }

  // Execute the bulk deletions that were staged for confirmation.
  async function confirmPendingDeletions() {
    const pend = pendingDeletionsRef.current;
    if (!pend || undoing) return;
    pendingDeletionsRef.current = null; setPendingDeleteCount(0);
    setUndoing(true);
    const allTasksNow = await base44.entities.Task.list("-created_date", 500).catch(() => []);
    const { count, records } = await applyActions(pend, todayKey(), Array.isArray(allTasksNow) ? allTasksNow : []);
    setLastActions(records); lastAppliedRef.current = pend; setRedoActions([]);
    queryClient.invalidateQueries({ queryKey: ["grid"] });
    queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
    const say = count ? `Deleted ${count} item${count > 1 ? "s" : ""}. Tap Undo to bring them back.` : "I couldn't find those to delete.";
    setNote(say); setReply(say);
    setUndoing(false);
  }
  function cancelPendingDeletions() {
    pendingDeletionsRef.current = null; setPendingDeleteCount(0);
    setNote("Kept them — nothing deleted.");
  }

  // Redo: re-apply the actions that were just undone.
  async function redoLast() {
    if (!redoActions.length || undoing) return;
    setUndoing(true);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    const allTasksNow = await base44.entities.Task.list("-created_date", 500).catch(() => []);
    const { count, records } = await applyActions(redoActions, todayKey(), Array.isArray(allTasksNow) ? allTasksNow : []);
    setLastActions(records);
    setRedoActions([]);
    setNote(count ? `Redone ${count} action${count > 1 ? "s" : ""}.` : "Nothing to redo.");
    setMode("idle");
    queryClient.invalidateQueries({ queryKey: ["grid"] });
    queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
    setUndoing(false);
  }

  // Send the reviewed email draft via the user's SMTP (server-side).
  async function sendEmailDraft() {
    if (!emailDraft || emailSending) return;
    const to = (emailDraft.to || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { setNote("Add a valid recipient email first."); return; }
    setEmailSending(true);
    try {
      const res = await base44.functions.invoke("donna", {
        route: "send-email", to, subject: emailDraft.subject || "", body: emailDraft.body || "",
      });
      const data = res && res.data ? res.data : res || {};
      if (data.sent) {
        setEmailDraft(null);
        setNote("Email sent.");
        pushTurn("signal", `Sent your email to ${to}.`);
      } else {
        setNote(data.error || "Couldn't send — check the SMTP settings.");
      }
    } catch (err) {
      setNote(err?.message || "Couldn't send the email.");
    }
    setEmailSending(false);
  }

  // Poll a queued orchestration command for its result, then speak/show it.
  async function pollCommand(id) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const list = await base44.entities.Command.list("-created_date", 20).catch(() => []);
      const doc = (Array.isArray(list) ? list : []).find((c) => c.id === id);
      if (doc && doc.status === "done") {
        const out = String(doc.output || "").trim();
        const spoken = doc.ok ? "Done." : "That command errored.";
        setNote(out ? out.slice(0, 1500) : spoken);
        pushTurn("signal", spoken + (out ? ` — ${out.slice(0, 200)}` : ""));
        speak(spoken);
        return;
      }
    }
    setNote("Still running — I'll have the output when it finishes.");
  }

  // Prime the speech engine inside a user gesture so iOS Safari lets the reply play later.
  function primeTTS() {
    if (!ttsSupported) return;
    try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(" ")); } catch { /* ignore */ }
  }

  // Gesture-driven voice check — exercises the real speak() path (server audio first,
  // browser engine fallback) so the test matches actual replies.
  function testVoice() {
    serverTtsOkRef.current = true; // give server TTS another shot on an explicit test
    setNote("Testing voice…");
    speak("Voice test. If you can hear this, I'm working.").then(() => {
      setNote("Voice test done. If you heard nothing, make sure the browser tab isn't muted (right-click the tab → Unmute site) and the system volume/output device is up.");
    });
  }

  // Tap a question in the "To answer" box → answer it by voice (or the type box);
  // the next thing you say/type checks it off.
  const answerQuestion = (q) => {
    if (answeredQ.has(q)) { setAnsweredQ((prev) => { const n = new Set(prev); n.delete(q); return n; }); return; }
    answeringRef.current = q;
    if (voice.supported && mode === "idle") {
      primeTTS();
      setHeard(""); setReply(""); setNote("");
      setMode("listening");
      voice.start();
    }
  };

  const onOrbAction = () => {
    if (mode === "idle") {
      // If the orb is pulsing to talk, a tap hears the nudge instead of listening.
      if (nudgeReady) { hearNudge(); return; }
      if (!voice.supported) return; // type box is the path
      setHeard(""); setReply(""); setNote(""); setLastActions([]);
      setMode("listening");
      voice.start();
    } else if (mode === "listening") {
      primeTTS();
      voice.stop(); // → onFinalTranscript → processing
    } else if (mode === "speaking") {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      setMode("idle");
    }
  };

  const submitTyped = (e) => {
    e.preventDefault();
    const t = typed.trim();
    if (!t || mode === "processing") return;
    setTyped("");
    // Treat "undo" / "undo that" / "undo last" as the undo action, not a command —
    // but only while there's something from the last turn to undo (else fall
    // through so the assistant can explain, and the Recent panel stays the path).
    if (/^undo(\s+(that|it|last))?$/i.test(t) && lastActions.length) {
      undoLast();
      return;
    }
    primeTTS();
    setLastActions([]);
    handleTranscript(t);
  };

  const statusLabel = {
    idle: !voice.supported
      ? "Voice needs Chrome — type below"
      : muted
      ? ""
      : "Listening — just talk, no need to say “Donna”",
    listening: "Listening…",
    processing: "On it…",
    speaking: "Speaking",
  }[mode];

  // The caption shows only while she's speaking, then clears itself (see speak()).
  const captionText = spoken.text;
  const userLine =
    mode === "listening" ? (voice.partial || "Listening…")
    : (heard && mode !== "idle") ? heard
    : (mode === "idle" && !reply) ? statusLabel : "";
  const donnaQuestions = extractQuestions(reply);

  return (
    <div className="flex h-full w-full overflow-hidden">
    <div
      className="relative flex flex-1 min-w-0 flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(circle at 50% 42%, #12151c 0%, #08090c 72%)" }}
    >
      <Link to="/Dashboard" className="absolute top-4 left-4 z-10 p-2 rounded-full text-gray-400 hover:text-gray-100 hover:bg-white/5 transition-colors" title="Back" aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="absolute top-5 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-[0.35em] text-gray-500 uppercase">{chatMode ? "Chat" : "Donna"}</h1>

      {/* Top-right controls — one flex row so they never collide on narrow screens. */}
      <div className="absolute top-3.5 right-3 z-30 flex items-center gap-1.5">
        {/* Capture thoughts — record / paste / import, organized into your notes. */}
        <button
          type="button"
          onClick={() => setShowThoughts(true)}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] font-medium text-gray-300 backdrop-blur-sm transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
          title="Capture thoughts — record, paste, or import"
          aria-label="Capture thoughts"
        >
          <Brain className="h-3.5 w-3.5" /> <span className="hidden xs:inline sm:inline">Thoughts</span>
        </button>
        {/* Send yourself a test of the smart daily briefing email. */}
        <button
          type="button"
          onClick={sendTestBriefing}
          disabled={sendingBrief}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] font-medium text-gray-300 backdrop-blur-sm transition-colors hover:border-blue-400/40 hover:text-blue-200 disabled:opacity-50"
          title="Send yourself a test briefing email"
          aria-label="Send test briefing"
        >
          {sendingBrief ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        </button>
        {/* Mode switcher — full assistant (Donna) vs plain typed chat with the same powers. */}
        <div className="flex items-center rounded-full border border-white/10 bg-black/40 p-0.5 text-[11px] backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setChatMode(false)}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${!chatMode ? "bg-cyan-500/20 text-cyan-200" : "text-gray-400 hover:text-gray-200"}`}
            title="Full assistant — voice, briefings, always listening"
          >
            Donna
          </button>
          <button
            type="button"
            onClick={() => setChatMode(true)}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${chatMode ? "bg-blue-500/25 text-blue-200" : "text-gray-400 hover:text-gray-200"}`}
            title="Plain typed chat — same powers, no briefings or auto-talking"
          >
            Chat
          </button>
        </div>
      </div>

      {/* Customize (Donna + dashboard). */}
      <button
        type="button"
        onClick={() => { setCustomizeTab("donna"); setShowCustomize(true); }}
        className="absolute top-4 left-[6.5rem] z-20 rounded-full p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-cyan-300"
        title="Customize Donna"
        aria-label="Customize Donna"
      >
        <Settings2 className="h-5 w-5" />
      </button>

      {/* Routines opener (shows a count when reminders exist). */}
      {reminders.length > 0 && (
        <button
          type="button"
          onClick={() => setShowRoutines(true)}
          className="absolute top-4 left-[9rem] z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10"
          title="Your routines"
        >
          <Bell className="h-3.5 w-3.5" /> {reminders.length}
        </button>
      )}

      {/* On-screen reminder banner (text delivery, or orb/voice-muted fallback). */}
      {reminderToast && (
        <div className="absolute top-14 left-1/2 z-30 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100 shadow-lg backdrop-blur-sm">
            <Bell className="h-4 w-4 text-cyan-300" />
            <span>Reminder — {reminderToast.title}</span>
            {/* Skip = stop this recurring reminder for good (not just close the banner). */}
            <button
              type="button"
              onClick={() => { if (reminderToast.id) removeReminder(reminderToast.id); lastReminderRef.current = null; setReminderToast(null); }}
              className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-cyan-50 hover:bg-white/20"
              title="Stop this reminder"
            >
              <Trash2 className="h-3 w-3" /> Skip
            </button>
            <button type="button" onClick={() => setReminderToast(null)} aria-label="Close" className="text-cyan-200/70 hover:text-cyan-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Routines editor overlay. */}
      {showRoutines && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 pt-20 backdrop-blur-sm" onClick={() => setShowRoutines(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <RoutinesPanel reminders={reminders} onUpdate={updateReminder} onDelete={removeReminder} />
            <p className="mt-2 max-w-xs text-center text-[11px] text-gray-500">
              Say “remind me to … every 30 minutes”. Routines run while Donna is open.
            </p>
          </div>
        </div>
      )}

      {/* Customize overlay — tabbed: Donna (persona/voice/questions/habits/nudges) + Dashboard tiles. */}
      {showCustomize && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 pt-16 backdrop-blur-sm" onClick={() => setShowCustomize(false)}>
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-2">
            <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs">
              <button type="button" onClick={() => setCustomizeTab("donna")} className={`rounded-full px-3 py-1 ${customizeTab === "donna" ? "bg-cyan-500/20 text-cyan-200" : "text-gray-400"}`}>Donna</button>
              <button type="button" onClick={() => setCustomizeTab("dashboard")} className={`rounded-full px-3 py-1 ${customizeTab === "dashboard" ? "bg-cyan-500/20 text-cyan-200" : "text-gray-400"}`}>Dashboard</button>
            </div>
            {customizeTab === "donna" ? <CustomizeDonnaPanel /> : <CustomizePanel />}
          </div>
        </div>
      )}

      {/* Proactive nudge: Donna asks permission to speak; tap to hear it. Donna mode only. */}
      {nudgeReady && mode === "idle" && !chatMode && (
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5">
          <button
            type="button"
            onClick={hearNudge}
            className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-3.5 py-1.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur-sm hover:bg-amber-400/25 transition-colors"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            Donna has a word — tap to listen
          </button>
          <button type="button" onClick={quietNudge} aria-label="Dismiss" className="p-1 text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Status widgets + recent-action undo now live in the right WidgetPanel. */}

      {/* Morning look-ahead / evening habit review (speaks via the orb). Donna mode only. */}
      {!chatMode && <DailyBriefing onSpeak={speak} onActive={setBriefingActive} muted={muted} />}

      {/* Donna's captions ABOVE the orb; your words small BELOW it. */}
      <div className="relative z-[6] flex flex-col items-center gap-2 px-4">
        {/* caption above (Donna) — karaoke word-by-word while speaking */}
        <div className="flex min-h-[3rem] w-[min(92vw,620px)] items-end justify-center">
          {mode === "processing" ? (
            <p className="inline-flex items-center gap-2 rounded-2xl bg-black/50 px-4 py-2 text-sm text-gray-300 backdrop-blur-sm">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> On it…
            </p>
          ) : (captionText ? (
            <div className={`inline-block max-w-full rounded-2xl px-4 py-2 shadow-lg backdrop-blur-sm ${mode === "speaking" ? "bg-cyan-500/10" : "bg-black/50"}`}>
              <SpokenCaption text={captionText} idx={spoken.idx} speaking={mode === "speaking"} />
            </div>
          ) : null)}
        </div>

        <button
          type="button"
          onClick={onOrbAction}
          aria-label="Talk to Donna"
          className="relative outline-none"
          style={{ width: "min(66vw, 42vh)", height: "min(66vw, 42vh)" }}
        >
          <Orb state={mode} amplitudeRef={voice.amplitudeRef} attention={orbAlert || (mode === "idle" && nudgeReady)} />
        </button>

        {/* your words small below the orb */}
        <div className="flex min-h-[1.5rem] w-[min(92vw,620px)] flex-col items-center gap-0.5">
          {userLine && <p className="text-center text-xs text-gray-400">{userLine}</p>}
          {note && <p className="text-center text-[11px] text-gray-500">{note}</p>}
          {voice.micError && <p className="flex items-center justify-center gap-1 text-[11px] text-amber-400/80"><AlertTriangle className="h-3 w-3" />{voice.micError}</p>}
          {sources.length > 0 && (
            <div className="mt-0.5 flex max-w-[min(92vw,620px)] flex-wrap justify-center gap-1.5">
              {sources.slice(0, 5).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="max-w-[46%] truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-blue-300 hover:border-blue-400/40" title={s.title || s.url}>
                  {s.title || s.url}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* When Donna asks several things, list them on the right so you can track answers. */}
      {donnaQuestions.length >= 2 && mode !== "listening" && (
        <div className="absolute right-3 top-1/2 z-[8] max-h-[60vh] w-[min(62vw,15rem)] -translate-y-1/2 overflow-y-auto rounded-2xl border border-cyan-400/20 bg-[#0e1015]/92 p-3 shadow-2xl backdrop-blur-md">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80">Tap to answer</div>
          <ul className="flex flex-col gap-1.5">
            {donnaQuestions.map((q, i) => {
              const done = answeredQ.has(q);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => answerQuestion(q)}
                    className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs leading-snug transition-colors ${
                      done ? "border-emerald-400/40 bg-emerald-500/10 text-gray-400 line-through" : "border-white/[0.06] bg-white/[0.03] text-gray-200 hover:border-cyan-400/40"
                    }`}
                    title={done ? "Answered — tap to un-check" : "Tap and answer by voice"}
                  >
                    {done ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" /> : <Mic className="mt-0.5 h-3 w-3 shrink-0 text-cyan-300/70" />}
                    <span className="min-w-0">{q}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Controls: undo (when available) + mic + always-available type fallback.
          Sits above the safe area and, crucially, above the orb in stacking order
          (z-10 > orb's z-6) so the Undo tap target is never eaten by the orb. */}
      <div className="absolute left-0 right-0 z-10 flex flex-col items-center gap-3" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)" }}>
        {pendingDeleteCount > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
            <span className="text-xs text-rose-100">Delete {pendingDeleteCount} items?</span>
            <button type="button" onClick={confirmPendingDeletions} disabled={undoing} className="rounded-full bg-rose-500/80 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50">Delete</button>
            <button type="button" onClick={cancelPendingDeletions} className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-gray-200 hover:bg-white/20">Keep</button>
          </div>
        )}
        {(lastActions.length > 0 || redoActions.length > 0) && mode !== "processing" && (
          <div className="flex items-center gap-2">
            {lastActions.length > 0 && (
              <button
                type="button"
                onClick={undoLast}
                disabled={undoing}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-medium text-amber-200 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
              >
                {undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Undo {lastActions.length > 1 ? `${lastActions.length} actions` : "that"}
              </button>
            )}
            {redoActions.length > 0 && (
              <button
                type="button"
                onClick={redoLast}
                disabled={undoing}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-medium text-gray-300 hover:bg-white/[0.12] transition-colors disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Redo
              </button>
            )}
          </div>
        )}
        <form onSubmit={submitTyped} className="flex items-center gap-2 w-[min(92vw,460px)]">
          {voice.supported && (
            <button
              type="button"
              onClick={toggleMute}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                muted ? "border border-white/10 bg-white/5 text-gray-500" : "border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 shadow-[0_0_16px_-6px_rgba(34,211,238,0.7)]"
              }`}
              title={muted ? "Muted — tap to unmute (Donna listens & you can interrupt)" : "Listening — tap to mute"}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              {!muted && <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />}
            </button>
          )}
          <button
            type="button"
            onClick={testVoice}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-400 transition-colors hover:text-cyan-200 hover:border-cyan-400/40"
            title="Test Donna's voice"
            aria-label="Test voice"
          >
            <Volume2 className="h-5 w-5" />
          </button>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={voice.supported ? "…or type a command" : "Type a command (voice not supported here)"}
            className="flex-1 rounded-xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25"
          />
          <button type="submit" disabled={!typed.trim() || mode === "processing"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-500 transition-colors" aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* ---- Chat mode: a plain ChatGPT-style typed conversation over the same
             pipeline (all of Donna's powers), covering the orb UI. ---- */}
      {chatMode && (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#0b0d11]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 pr-28">
            <Link to="/Dashboard" className="rounded-full p-1.5 text-gray-400 hover:bg-white/5 hover:text-gray-100" title="Back" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Chat</span>
            <span className="w-8" />
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {turns.length === 0 ? (
              <div className="mx-auto mt-10 max-w-md text-center text-sm text-gray-500">
                <p className="mb-2 text-gray-300">Chat with all of Donna's powers — quietly.</p>
                <p>Log things, manage tasks, ask about your money, search the web, read your inbox. No briefings, no nudges, no talking back — just type. Switch to <span className="text-cyan-300">Donna</span> anytime for the full assistant.</p>
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                {turns.map((tn) => (
                  <div key={tn.id} className={`flex ${tn.who === "you" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                      tn.who === "you" ? "bg-blue-600 text-white" : "bg-white/[0.06] text-gray-100"
                    }`}>
                      {tn.text}
                    </div>
                  </div>
                ))}
                {mode === "processing" && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-2 text-sm text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> Thinking…
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {note && <p className="px-4 pb-1 text-center text-[11px] text-cyan-300">{note}</p>}
          <form onSubmit={submitTyped} className="flex items-center gap-2 border-t border-white/10 p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              placeholder="Message…"
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25"
            />
            <button type="submit" disabled={!typed.trim() || mode === "processing"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-500" aria-label="Send">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Capture-thoughts panel — record/paste/import → organized into your notes. */}
      {showThoughts && (
        <ThoughtsPanel
          onClose={() => setShowThoughts(false)}
          onSaved={(title) => {
            setShowThoughts(false);
            setNote(`Saved "${title}" to your notes`);
            queryClient.invalidateQueries({ queryKey: ["grid"] });
          }}
        />
      )}

      {/* Email draft — review & edit, then send. Never sent automatically. */}
      {emailDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => !emailSending && setEmailDraft(null)}>
          <div
            className="w-full max-w-lg rounded-t-2xl border border-white/10 bg-[#0e1015] p-4 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-200">Review email</h2>
              <button type="button" onClick={() => setEmailDraft(null)} disabled={emailSending} className="p-1 text-gray-500 hover:text-gray-200" aria-label="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mb-1.5 block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">To</span>
              <input
                type="email"
                value={emailDraft.to}
                onChange={(e) => setEmailDraft((d) => ({ ...d, to: e.target.value }))}
                placeholder="recipient@example.com"
                className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25"
              />
            </label>
            <label className="mb-1.5 block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Subject</span>
              <input
                value={emailDraft.subject}
                onChange={(e) => setEmailDraft((d) => ({ ...d, subject: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-gray-100 outline-none focus:border-white/25"
              />
            </label>
            <label className="mb-3 block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Message</span>
              <textarea
                value={emailDraft.body}
                onChange={(e) => setEmailDraft((d) => ({ ...d, body: e.target.value }))}
                rows={7}
                className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-gray-100 outline-none focus:border-white/25"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEmailDraft(null)} disabled={emailSending} className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button
                type="button"
                onClick={sendEmailDraft}
                disabled={emailSending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Right-hand widget panel (Donna mode only) — collapsible, edit via Customize. */}
      {!chatMode && (
        <WidgetPanel
          collapsed={widgetsCollapsed}
          onToggleCollapse={toggleWidgets}
          onEdit={() => { setCustomizeTab("dashboard"); setShowCustomize(true); }}
        />
      )}
    </div>
  );
}
