import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mic, Square, Send, AlertTriangle, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Orb from "@/components/jarvis/Orb";
import StatusGrid from "@/components/jarvis/StatusGrid";
import RecentActions from "@/components/jarvis/RecentActions";
import { useVoice } from "@/components/jarvis/useVoice";
import { reverseMany } from "@/components/jarvis/undo";

const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function pickBritishVoice(voices) {
  const gb = voices.filter((v) => /en[-_]GB/i.test(v.lang));
  const female =
    gb.find((v) => /female|serena|kate|sonia|martha|libby|hazel|stephanie|amelie/i.test(v.name)) ||
    gb.find((v) => /google uk english female/i.test(v.name));
  return female || gb[0] || voices.find((v) => /^en/i.test(v.lang)) || null;
}

export default function Jarvis() {
  const [mode, setMode] = useState("idle"); // idle | listening | processing | speaking
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState(""); // action summary or error
  const [typed, setTyped] = useState("");
  const [ttsSupported, setTtsSupported] = useState(true);
  const [lastActions, setLastActions] = useState([]); // undoable records from the last command
  const [undoing, setUndoing] = useState(false);
  const queryClient = useQueryClient();

  // Handle a finished transcript (from voice or the type box).
  const handleTranscript = useCallback(async (text) => {
    const t = (text || "").trim();
    if (!t) { setMode("idle"); return; }
    setHeard(t);
    setReply("");
    setNote("");
    setMode("processing");
    try {
      const [commitments, tasksRaw, domains] = await Promise.all([
        base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
        base44.entities.Task.list("-created_date").catch(() => []),
        base44.entities.Domain.list("sort_order").catch(() => []),
      ]);
      const today = todayKey();
      const todayTasks = (Array.isArray(tasksRaw) ? tasksRaw : [])
        .filter((x) => x && x.due_date === today)
        .slice(0, 25)
        .map((x) => ({ title: x.title || "", status: x.status || "" }));

      const res = await base44.functions.invoke("jarvis", {
        route: "intent",
        transcript: t,
        context: {
          today,
          commitments: (Array.isArray(commitments) ? commitments : []).map((c) => ({ text: c.text, due_on: c.due_on })),
          tasks: todayTasks,
          domains: Array.isArray(domains) ? domains : [],
        },
      });
      const data = res && res.data ? res.data : res || {};
      const actions = Array.isArray(data.actions) ? data.actions : [];
      const spoken = data.reply ? String(data.reply) : "Noted.";

      const { count, records } = await applyActions(actions, today);
      setLastActions(records);
      setReply(spoken);
      if (count) {
        setNote(`${count} action${count > 1 ? "s" : ""} done`);
        // Refresh the grid tiles + recent list so the new thing shows immediately.
        queryClient.invalidateQueries({ queryKey: ["grid"] });
        queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
      }
      speak(spoken);
    } catch (err) {
      setMode("idle");
      setNote(err?.message || "I couldn't reach the server — try again.");
    }
  }, [queryClient]);

  const voice = useVoice({ onFinalTranscript: handleTranscript });

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

  // ---- create the entities the intent asked for, logging each to AgentAction ----
  // Returns { count, records } where records are the AgentAction docs (with id +
  // target) so the caller can offer an immediate Undo.
  async function applyActions(actions, today) {
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

  // ---- British TTS reply ----
  function speak(text) {
    if (!ttsSupported || !text) { setMode("idle"); return; }
    try {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 1; u.volume = 1;
      const v = pickBritishVoice(synth.getVoices() || []);
      if (v) u.voice = v;
      u.onstart = () => { setMode("speaking"); voice.amplitudeRef.current = 1; };
      u.onboundary = () => { voice.amplitudeRef.current = 1; };
      u.onend = () => { setMode("idle"); voice.amplitudeRef.current = 0; };
      u.onerror = () => { setMode("idle"); voice.amplitudeRef.current = 0; };
      setMode("speaking");
      synth.speak(u);
    } catch {
      setMode("idle");
    }
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
      <h1 className="absolute top-5 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-[0.35em] text-gray-500 uppercase">Signal</h1>

      {/* The status "matrix" — tiles framing the orb (reads live entities). */}
      <StatusGrid />

      {/* Recent orb actions still inside their 24h undo window. */}
      <RecentActions />

      <button
        type="button"
        onClick={onOrbAction}
        aria-label="Talk to Signal"
        className="relative z-[6] outline-none"
        style={{ width: "min(72vw, 46vh)", height: "min(72vw, 46vh)" }}
      >
        <Orb state={mode} amplitudeRef={voice.amplitudeRef} />
      </button>

      {/* Transcript / reply / status */}
      <div className="absolute bottom-40 left-0 right-0 px-6 text-center">
        {heard && mode !== "idle" && <p className="text-xs text-gray-500 mb-1 truncate">“{voice.partial || heard}”</p>}
        <p className={`text-sm flex items-center justify-center gap-2 ${mode === "speaking" ? "text-gray-200" : "text-gray-400"}`}>
          {mode === "processing" && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
          {mode === "idle" && reply ? `“${reply}”` : statusLabel}
        </p>
        {note && <p className="mt-1 text-[11px] text-gray-500">{note}</p>}
        {voice.micError && <p className="mt-1 text-[11px] text-amber-400/80 flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" />{voice.micError}</p>}
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
    </div>
  );
}
