import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mic, Square, Send, AlertTriangle, RotateCcw, X, AudioLines } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Orb from "@/components/donna/Orb";
import StatusGrid from "@/components/donna/StatusGrid";
import RecentActions from "@/components/donna/RecentActions";
import DailyBriefing from "@/components/donna/DailyBriefing";
import { useVoice } from "@/components/donna/useVoice";
import { useWakeWord, wakeSupported } from "@/components/donna/useWakeWord";
import { reverseMany } from "@/components/donna/undo";
import { getBriefingParts, briefingSlotKey } from "@/components/donna/checkinUtils";

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

function pickBritishVoice(voices) {
  const gb = voices.filter((v) => /en[-_]GB/i.test(v.lang));
  const female =
    gb.find((v) => /female|serena|kate|sonia|martha|libby|hazel|stephanie|amelie/i.test(v.name)) ||
    gb.find((v) => /google uk english female/i.test(v.name));
  return female || gb[0] || voices.find((v) => /^en/i.test(v.lang)) || null;
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

export default function Donna() {
  const [mode, setMode] = useState("idle"); // idle | listening | processing | speaking
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState(""); // action summary or error
  const [typed, setTyped] = useState("");
  const [ttsSupported, setTtsSupported] = useState(true);
  const [lastActions, setLastActions] = useState([]); // undoable records from the last command
  const [undoing, setUndoing] = useState(false);
  const [nudgeReady, setNudgeReady] = useState(false); // Donna has a follow-up to voice
  const [handsFree, setHandsFree] = useState(() => {
    try { return localStorage.getItem("donna_handsfree") === "1"; } catch { return false; }
  });
  const [turns, setTurns] = useState([]); // captioned conversation history (both sides)
  const [emailDraft, setEmailDraft] = useState(null); // { to, subject, body } pending confirm+send
  const [emailSending, setEmailSending] = useState(false);
  const [sources, setSources] = useState([]); // web-research source links for the last answer
  const turnId = useRef(0);
  const transcriptRef = useRef(null);
  const queryClient = useQueryClient();

  // Append a caption turn ("you" or "signal") to the running transcript.
  const pushTurn = useCallback((who, text) => {
    const v = (text || "").trim();
    if (!v) return;
    setTurns((prev) => [...prev.slice(-19), { id: ++turnId.current, who, text: v }]);
  }, []);

  // Handle a finished transcript (from voice or the type box).
  const handleTranscript = useCallback(async (text) => {
    const t = (text || "").trim();
    if (!t) { setMode("idle"); return; }
    setHeard(t);
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
          await base44.entities.Page.create({ title: cdata.title || "Note", type: "document", content: cdata.content }).catch(() => null);
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
        const all = await base44.entities.Note.list("-modified", 400).catch(() => []);
        const results = rankNotes(Array.isArray(all) ? all : [], q).slice(0, 5);
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

      const [commitments, tasksRaw, domains, signalsRaw] = await Promise.all([
        base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
        base44.entities.Task.list("-created_date").catch(() => []),
        base44.entities.Domain.list("sort_order").catch(() => []),
        base44.entities.Signal.list("-created_date", 80).catch(() => []),
      ]);
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

      const res = await base44.functions.invoke("donna", {
        route: "intent",
        transcript: t,
        context: {
          today,
          commitments: (Array.isArray(commitments) ? commitments : []).map((c) => ({ text: c.text, due_on: c.due_on })),
          tasks: todayTasks,
          lists,
          calendar,
          emails,
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
      const { count, records } = await applyActions(otherActions, today, allTasks);
      setLastActions(records);
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

  // Hands-free: while enabled and the orb is idle, listen for "Donna" / "Hey Donna"
  // and treat what follows as the command.
  useWakeWord({ enabled: handsFree, active: mode !== "idle", onCommand: handleTranscript });
  const toggleHandsFree = () => {
    setHandsFree((v) => {
      const next = !v;
      try { localStorage.setItem("donna_handsfree", next ? "1" : "0"); } catch { /* ignore */ }
      if (next) primeTTS(); // in-gesture: unlock TTS + prompt mic for the wake listener
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
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    };
  }, []);

  // Decide (once, on load) whether Signal has something worth asking about — i.e.
  // there are open commitments or open list items — and it hasn't nudged recently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        context: {
          today,
          commitments: (Array.isArray(commits) ? commits : []).map((c) => ({ text: c.text, due_on: c.due_on })),
          lists,
          tasks: openTasks.slice(0, 20).map((x) => ({ title: x.title, category: x.category })),
        },
      });
      const data = res && res.data ? res.data : res || {};
      const say = data.say ? String(data.say) : "";
      if (say) { setReply(say); pushTurn("signal", say); speak(say); }
      else setMode("idle");
    } catch {
      setMode("idle");
      setNote("Couldn't reach the server — try again.");
    }
  };

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
          const rec = await base44.entities.Memory.create({
            kind: "observed", content: a.text, source: "observed", domain_id: null,
          });
          target = "memory/" + (rec?.id || "");
        } else if (a.type === "monitor") {
          const rec = await base44.entities.Insight.create({
            kind: "metric", content: a.metric + (a.value != null ? ": " + a.value : ""), evidence: a.note ? { note: a.note } : null,
          });
          target = "insights/" + (rec?.id || "");
        } else if (a.type === "write") {
          const rec = await base44.entities.Page.create({ title: a.title, type: "document", content: a.body });
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
            if (a.type === "complete") await base44.entities.Task.update(match.id, { status: "done" });
            else await base44.entities.Task.delete(match.id);
            n++;
          }
          continue; // executed in place; not part of the create-then-undo trail
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

  // ---- British TTS reply. Returns a Promise that resolves when speech ends, so
  //      callers (e.g. the evening review) can speak lines in sequence. ----
  function speak(text) {
    return new Promise((resolve) => {
      if (!ttsSupported || !text) { setMode("idle"); resolve(); return; }
      try {
        const synth = window.speechSynthesis;
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.02; u.pitch = 1; u.volume = 1;
        const v = pickBritishVoice(synth.getVoices() || []);
        if (v) u.voice = v;
        u.onstart = () => { setMode("speaking"); voice.amplitudeRef.current = 1; };
        u.onboundary = () => { voice.amplitudeRef.current = 1; };
        u.onend = () => { setMode("idle"); voice.amplitudeRef.current = 0; resolve(); };
        u.onerror = () => { setMode("idle"); voice.amplitudeRef.current = 0; resolve(); };
        setMode("speaking");
        synth.speak(u);
      } catch {
        setMode("idle");
        resolve();
      }
    });
  }

  // Undo everything the last command created (within the 24h window).
  async function undoLast() {
    if (!lastActions.length || undoing) return;
    setUndoing(true);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    const n = await reverseMany(lastActions);
    setLastActions([]);
    setNote(n ? `Undone.` : "Nothing to undo.");
    setReply("");
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

  // Prime the speech engine inside a user gesture so iOS Safari lets the reply play later.
  function primeTTS() {
    if (!ttsSupported) return;
    try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(" ")); } catch { /* ignore */ }
  }

  const onOrbAction = () => {
    if (mode === "idle") {
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
    idle: voice.supported ? "Tap the orb and speak" : "Type a command below",
    listening: "Listening…",
    processing: "On it…",
    speaking: "Speaking",
  }[mode];

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(circle at 50% 42%, #12151c 0%, #08090c 72%)" }}
    >
      <Link to="/Dashboard" className="absolute top-4 left-4 z-10 p-2 rounded-full text-gray-400 hover:text-gray-100 hover:bg-white/5 transition-colors" title="Back" aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="absolute top-5 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-[0.35em] text-gray-500 uppercase">Donna</h1>

      {/* Proactive nudge: Donna asks permission to speak; tap to hear it. */}
      {nudgeReady && mode === "idle" && (
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

      {/* The status "matrix" — tiles framing the orb (reads live entities). */}
      <StatusGrid />

      {/* Recent orb actions still inside their 24h undo window. */}
      <RecentActions />

      {/* Morning look-ahead / evening habit review (speaks via the orb). */}
      <DailyBriefing onSpeak={speak} />

      <button
        type="button"
        onClick={onOrbAction}
        aria-label="Talk to Donna"
        className="relative z-[6] outline-none"
        style={{ width: "min(72vw, 46vh)", height: "min(72vw, 46vh)" }}
      >
        <Orb state={mode} amplitudeRef={voice.amplitudeRef} />
      </button>

      {/* Captioned transcript — both sides of the conversation, with live partial. */}
      <div className="absolute bottom-36 left-0 right-0 z-[7] flex flex-col items-center px-4">
        <div
          ref={transcriptRef}
          className="flex w-[min(94vw,600px)] flex-col gap-1.5 overflow-y-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maxHeight: "26vh" }}
        >
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                turn.who === "you"
                  ? "self-end bg-white/[0.07] text-gray-100"
                  : "self-start border border-cyan-400/15 bg-cyan-500/10 text-cyan-50"
              }`}
            >
              <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.15em] opacity-45">
                {turn.who === "you" ? "You" : "Donna"}
              </span>
              {turn.text}
            </div>
          ))}
          {/* Live partial while listening. */}
          {mode === "listening" && (
            <div className="max-w-[85%] self-end rounded-2xl bg-white/[0.04] px-3.5 py-2 text-sm italic text-gray-400">
              {voice.partial || "Listening…"}
            </div>
          )}
        </div>
        {/* Compact status line under the captions. */}
        <p className={`mt-1.5 flex items-center justify-center gap-2 text-xs ${mode === "speaking" ? "text-cyan-300" : "text-gray-500"}`}>
          {mode === "processing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
          {mode === "idle" ? (turns.length ? "" : statusLabel) : statusLabel}
        </p>
        {note && <p className="text-center text-[11px] text-gray-500">{note}</p>}
        {sources.length > 0 && (
          <div className="mt-1 flex max-w-[min(94vw,600px)] flex-wrap justify-center gap-1.5">
            {sources.slice(0, 5).map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-[46%] truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-blue-300 hover:border-blue-400/40"
                title={s.title || s.url}
              >
                {s.title || s.url}
              </a>
            ))}
          </div>
        )}
        {voice.micError && <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-amber-400/80"><AlertTriangle className="h-3 w-3" />{voice.micError}</p>}
      </div>

      {/* Controls: undo (when available) + mic + always-available type fallback.
          Sits above the safe area and, crucially, above the orb in stacking order
          (z-10 > orb's z-6) so the Undo tap target is never eaten by the orb. */}
      <div className="absolute left-0 right-0 z-10 flex flex-col items-center gap-3" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)" }}>
        {lastActions.length > 0 && mode !== "processing" && (
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
        {wakeSupported() && (
          <button
            type="button"
            onClick={toggleHandsFree}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              handsFree ? "border border-cyan-400/40 bg-cyan-500/15 text-cyan-200" : "border border-white/10 bg-white/5 text-gray-400 hover:text-gray-200"
            }`}
            title={handsFree ? "Hands-free on — say “Donna”" : "Enable hands-free (say “Donna”)"}
          >
            <AudioLines className="h-3.5 w-3.5" />
            {handsFree ? "Listening for “Donna”" : "Hands-free"}
          </button>
        )}
        {voice.supported && (
          <button
            onClick={onOrbAction}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
              mode === "listening" ? "bg-cyan-500 text-white shadow-[0_0_28px_-4px_rgba(34,211,238,0.7)]" : "border border-white/10 bg-white/5 text-gray-200"
            }`}
            title={mode === "listening" ? "Stop & send" : "Talk"}
            aria-label={mode === "listening" ? "Stop and send" : "Talk"}
          >
            {mode === "listening" ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
          </button>
        )}
        <form onSubmit={submitTyped} className="flex items-center gap-2 w-[min(88vw,420px)]">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={voice.supported ? "…or type a command" : "Type a command (voice not supported here)"}
            className="flex-1 rounded-xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25"
          />
          <button type="submit" disabled={!typed.trim() || mode === "processing"} className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-500 transition-colors" aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Email draft — review & edit, then send. Never sent automatically. */}
      {emailDraft && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => !emailSending && setEmailDraft(null)}>
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
  );
}
