import { useEffect, useRef } from "react";

// Always-on voice. A continuous SpeechRecognition runs while `enabled` and the
// assistant isn't mid-command (`active`). Two modes:
//   - normal (not speaking): needs the "Donna" / "Hey Donna" wake word; the words
//     after it are the command (or the next utterance if you just say "Donna").
//   - interrupt (Donna is speaking): ANY speech barges in — no wake word — except
//     her own audio echoing back, which is filtered out by comparing to `echoText`.
// Delivered via onCommand(text). One recognizer at a time.
const WAKE = /\b(hey\s+|ok\s+|okay\s+)?donna\b[\s,.!]*/i;

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

export function useWakeWord({ enabled, active, onCommand, interrupt = false, echoText = "" }) {
  const armedRef = useRef(false);
  const stoppedRef = useRef(true);
  const interruptRef = useRef(interrupt);
  const echoRef = useRef(echoText);
  useEffect(() => { interruptRef.current = interrupt; }, [interrupt]);
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
      // Barge-in: while Donna is speaking, any of YOUR speech interrupts (no wake
      // word), but ignore her own voice echoing back through the mic.
      if (interruptRef.current) {
        if (!isEcho(t, echoRef.current)) { armedRef.current = false; onCommand && onCommand(t); }
        return;
      }
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
      if (!stoppedRef.current) { try { rec.start(); } catch { /* ignore */ } }
    };

    try { rec.start(); } catch { /* ignore */ }

    return () => {
      stoppedRef.current = true;
      try { rec.onend = null; rec.stop(); } catch { /* ignore */ }
    };
  }, [enabled, active, onCommand]);
}
