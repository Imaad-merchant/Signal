import { useEffect, useRef } from "react";

// Always-on voice. A continuous SpeechRecognition runs while `enabled` and the
// assistant isn't mid-command (`active`). No wake word required: ANY speech you
// make is treated as a command — whether she's idle or mid-sentence (barge-in).
// The only thing filtered out is her own audio echoing back through the mic
// (compared to `echoText`). Saying "Donna" / "Hey Donna" is still fine — it's
// just stripped from the front of the command. Delivered via onCommand(text).
// One recognizer at a time.
const WAKE = /^\s*(hey\s+|ok\s+|okay\s+)?donna\b[\s,.!]*/i;

export function wakeSupported() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

// Is `said` mostly Donna's own words (echo through the speakers)?
function isEcho(said, spoken) {
  if (!spoken) return false;
  const words = said.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const bag = new Set(spoken.toLowerCase().split(/\s+/).filter(Boolean));
  const overlap = words.filter((w) => bag.has(w)).length / words.length;
  return overlap >= 0.5;
}

export function useWakeWord({ enabled, active, onCommand, echoText = "" }) {
  const armedRef = useRef(false);
  const stoppedRef = useRef(true);
  const runningRef = useRef(false);
  const echoRef = useRef(echoText);
  useEffect(() => { echoRef.current = echoText; }, [echoText]);

  useEffect(() => {
    if (!enabled || active || !wakeSupported()) {
      stoppedRef.current = true;
      return undefined;
    }
    stoppedRef.current = false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-GB";

    const handle = (text) => {
      const t = (text || "").trim();
      if (!t) return;
      // Ignore Donna's own voice echoing back through the mic (whether she's
      // speaking now or the tail of what she just said).
      if (isEcho(t, echoRef.current)) return;
      // No wake word needed: any speech is a command. Strip a leading
      // "Donna"/"Hey Donna" if the user happens to say it.
      const cmd = t.replace(WAKE, "").trim();
      if (!cmd) { armedRef.current = true; return; } // said only "Donna" — take the next utterance
      armedRef.current = false;
      onCommand && onCommand(cmd);
    };

    const startRec = () => {
      if (stoppedRef.current || runningRef.current) return;
      try { rec.start(); runningRef.current = true; } catch { /* already running / transient */ }
    };

    rec.onstart = () => { runningRef.current = true; };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) handle(e.results[i][0].transcript);
      }
    };
    rec.onerror = () => { runningRef.current = false; /* onend handles restart */ };
    rec.onend = () => {
      runningRef.current = false;
      // Restart immediately so listening never lapses between utterances.
      if (!stoppedRef.current) { try { rec.start(); runningRef.current = true; } catch { /* watchdog will retry */ } }
    };

    startRec();
    // Watchdog: some browsers stop recognition (silence timeout, tab focus, audio
    // ducking during TTS) without firing onend — poll and revive it so it's truly
    // always-on until muted.
    const watchdog = window.setInterval(() => { if (!stoppedRef.current && !runningRef.current) startRec(); }, 2000);

    return () => {
      stoppedRef.current = true;
      runningRef.current = false;
      window.clearInterval(watchdog);
      try { rec.onend = null; rec.stop(); } catch { /* ignore */ }
    };
  }, [enabled, active, onCommand]);
}
