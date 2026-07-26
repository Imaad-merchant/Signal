import { useEffect, useRef } from "react";

// Hands-free wake word. While `enabled` and the assistant isn't already busy
// (`active` = orb listening/processing/speaking), a continuous SpeechRecognition
// listens for "Donna" / "Hey Donna". The words AFTER the wake word become the
// command; if nothing follows ("Donna" then a pause), the NEXT utterance is taken.
// Delivered via onCommand(text). Only one recognizer runs at a time — it pauses
// while the orb is handling a command, so it never fights the push-to-talk mic.
const WAKE = /\b(hey\s+|ok\s+|okay\s+)?donna\b[\s,.!]*/i;

export function wakeSupported() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

export function useWakeWord({ enabled, active, onCommand }) {
  const armedRef = useRef(false); // heard "Donna" alone → next utterance is the command
  const stoppedRef = useRef(true);

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
      if (armedRef.current) { armedRef.current = false; onCommand && onCommand(t); return; }
      const m = WAKE.exec(t);
      if (!m) return;
      const after = t.slice(m.index + m[0].length).trim();
      if (after) onCommand && onCommand(after);
      else armedRef.current = true; // wake only — capture the next utterance
    };

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) handle(e.results[i][0].transcript);
      }
    };
    rec.onerror = () => { /* onend handles restart */ };
    rec.onend = () => {
      // Auto-restart while still enabled + idle (recognizers stop on silence).
      if (!stoppedRef.current) { try { rec.start(); } catch { /* ignore */ } }
    };

    try { rec.start(); } catch { /* ignore */ }

    return () => {
      stoppedRef.current = true;
      try { rec.onend = null; rec.stop(); } catch { /* ignore */ }
    };
  }, [enabled, active, onCommand]);
}
