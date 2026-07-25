import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Volume2, VolumeX, Loader2, RotateCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { unwrap } from "@/components/jarvis/checkinUtils";
import Orb from "@/components/jarvis/Orb";

// The app accent (Signal blue by default), set by the theme picker.
function readAccent() {
  try {
    const v = localStorage.getItem("pulse_theme");
    if (v && /^#[0-9a-f]{6}$/i.test(v)) return v;
  } catch { /* ignore */ }
  return "#4285f4";
}

export default function Jarvis() {
  const [muted, setMuted] = useState(true);
  const [status, setStatus] = useState("idle"); // idle | loading | speaking | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [accent] = useState(readAccent);
  const amplitudeRef = useRef(0);
  const speaking = status === "speaking";

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    setTtsSupported(ok);
    if (!ok) return;
    // Some browsers load voices asynchronously — prime them.
    window.speechSynthesis.getVoices();
    const onVoices = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", onVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    amplitudeRef.current = 0;
  }, []);

  const speak = useCallback(async () => {
    if (!ttsSupported) return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      const [memory, domains, newsTopics] = await Promise.all([
        base44.entities.Memory.list("-created_date", 15).catch(() => []),
        base44.entities.Domain.list("sort_order").catch(() => []),
        base44.entities.NewsTopic.filter({ is_active: true }).catch(() => []),
      ]);
      const res = await base44.functions.invoke("checkin", {
        action: "payback",
        context: {
          answers: [],
          memory: Array.isArray(memory) ? memory : [],
          domains: Array.isArray(domains) ? domains : [],
          news_topics: Array.isArray(newsTopics) ? newsTopics : [],
        },
      });
      const pb = unwrap(res)?.payback;
      const title = pb?.title ? String(pb.title) : "Here's your signal";
      const body = pb?.body ? String(pb.body) : "You showed up today. Keep the momentum going.";
      const text = `${title}. ${body}`;

      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.pitch = 1;
      u.volume = 1;
      const voices = window.speechSynthesis.getVoices() || [];
      const pick =
        voices.find((v) => /^en/i.test(v.lang) && /natural|google|samantha|daniel|aria/i.test(v.name)) ||
        voices.find((v) => /^en/i.test(v.lang));
      if (pick) u.voice = pick;

      u.onstart = () => { setStatus("speaking"); amplitudeRef.current = 1; };
      u.onboundary = () => { amplitudeRef.current = 1; };
      u.onend = () => { setStatus("idle"); amplitudeRef.current = 0; };
      u.onerror = () => { setStatus("idle"); amplitudeRef.current = 0; };

      setStatus("speaking"); // set immediately in case onstart lags
      // Do NOT cancel() here — that would kill the in-gesture priming line
      // (see toggleMute) that iOS needs to have started first. This queues after it.
      window.speechSynthesis.speak(u);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message || "Couldn't reach your signal. Tap to retry.");
      amplitudeRef.current = 0;
    }
  }, [ttsSupported]);

  const toggleMute = () => {
    if (muted) {
      setMuted(false);
      // iOS Safari unlocks TTS only from a direct user gesture and blocks speech
      // that starts after an await. Speak a short priming line *synchronously* here
      // so the engine is unlocked; the fetched payback then queues right after it.
      if (ttsSupported) {
        try {
          window.speechSynthesis.cancel();
          const g = new SpeechSynthesisUtterance("Hey.");
          g.rate = 1;
          g.volume = 1;
          window.speechSynthesis.speak(g);
        } catch { /* ignore */ }
      }
      speak();
    } else {
      setMuted(true);
      stopSpeaking();
      setStatus("idle");
    }
  };

  // Tap the orb to replay when it's unmuted and not busy.
  const onOrbTap = () => {
    if (!muted && (status === "idle" || status === "error")) {
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      speak();
    }
  };

  const statusLabel = !ttsSupported
    ? "Voice isn't available in this browser"
    : status === "loading"
    ? "Thinking…"
    : status === "speaking"
    ? "Speaking"
    : status === "error"
    ? (errorMsg || "Something went wrong")
    : muted
    ? "Muted — tap the speaker to hear me"
    : "Tap the orb to hear me again";

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(circle at 50% 45%, #12151c 0%, #08090c 72%)" }}
    >
      <Link
        to="/Dashboard"
        className="absolute top-4 left-4 z-10 p-2 rounded-full text-gray-400 hover:text-gray-100 hover:bg-white/5 transition-colors"
        title="Back"
        aria-label="Back to calendar"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>

      <h1 className="absolute top-5 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-[0.35em] text-gray-500 uppercase">
        Signal
      </h1>

      <button
        type="button"
        onClick={onOrbTap}
        aria-label="Jarvis orb"
        className="relative outline-none"
        style={{ width: "min(78vw, 58vh)", height: "min(78vw, 58vh)" }}
      >
        <Orb color={accent} speaking={speaking} amplitudeRef={amplitudeRef} />
      </button>

      <div className="absolute bottom-32 left-0 right-0 px-6 text-center">
        <p className="text-sm text-gray-400 flex items-center justify-center gap-2">
          {status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
          {statusLabel}
        </p>
        {status === "error" && (
          <button
            onClick={speak}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10 transition-colors"
          >
            <RotateCw className="h-3 w-3" /> Try again
          </button>
        )}
      </div>

      <button
        onClick={toggleMute}
        disabled={!ttsSupported}
        className={`absolute left-1/2 -translate-x-1/2 flex h-14 w-14 items-center justify-center rounded-full transition-all disabled:opacity-40 ${
          muted ? "border border-white/10 bg-white/5 text-gray-300" : "text-white shadow-xl"
        }`}
        style={{
          bottom: "calc(4rem + env(safe-area-inset-bottom) + 1rem)",
          backgroundColor: muted ? undefined : accent,
        }}
        title={muted ? "Unmute — let Jarvis speak" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
      </button>
    </div>
  );
}
