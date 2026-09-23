import { useEffect, useRef } from "react";

// Always-on voice. A continuous SpeechRecognition runs while `enabled` and the
// assistant isn't mid-command (`active`). No wake word required: ANY speech you
// make is treated as a command — whether she's idle or mid-sentence (barge-in).
//
// ENDPOINTING: the browser marks a clause "final" the instant you pause, which
// would cut you off mid-thought. Instead we BUFFER every final/interim fragment
// and only commit the whole thing once you've been SILENT for `pauseMs` (~1.5s).
// Natural pauses within a sentence no longer end your turn.
//
// Her own audio echoing back through the mic (compared to `echoText`) is filtered
// out at commit time. Saying "Donna"/"Hey Donna" is fine — it's stripped from the
// front. Delivered via onCommand(text). One recognizer at a time.
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

export function useWakeWord({ enabled, active, onCommand, echoText = "", pauseMs = 1500 }) {
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
    rec.interimResults = true; // needed so pauses reset the silence timer, not end the turn
    rec.lang = "en-GB";

    // Endpointing buffer: accumulate finalized clauses; `interim` is the live tail.
    let buffer = "";
    let interim = "";
    let silenceTimer = null;
    const clearSilence = () => { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; } };

    const commit = () => {
      clearSilence();
      const full = `${buffer} ${interim}`.trim();
      buffer = ""; interim = "";
      if (!full) return;
      // Ignore Donna's own voice echoing back through the mic.
      if (isEcho(full, echoRef.current)) return;
      // No wake word needed: strip a leading "Donna"/"Hey Donna" if said.
      const cmd = full.replace(WAKE, "").trim();
      if (!cmd) { armedRef.current = true; return; } // only "Donna" — wait for the next utterance
      armedRef.current = false;
      onCommand && onCommand(cmd);
    };
    // Only fire once you've gone quiet for pauseMs — pauses shorter than that keep the turn open.
    const scheduleCommit = () => { clearSilence(); silenceTimer = setTimeout(commit, pauseMs); };

    const startRec = () => {
      if (stoppedRef.current || runningRef.current) return;
      try { rec.start(); runningRef.current = true; } catch { /* already running / transient */ }
    };

    rec.onstart = () => { runningRef.current = true; };
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = (r[0] && r[0].transcript) || "";
        if (r.isFinal) buffer += (buffer ? " " : "") + txt.trim();
        else live += txt;
      }
      interim = live;
      scheduleCommit(); // any speech (final or interim) keeps the turn open another pauseMs
    };
    rec.onerror = () => { runningRef.current = false; /* onend handles restart */ };
    rec.onend = () => {
      runningRef.current = false;
      commit(); // flush anything buffered before the engine stopped
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
      clearSilence();
      window.clearInterval(watchdog);
      // Release the mic IMMEDIATELY on teardown (mute/unmount). abort() drops the
      // session and frees the mic at once; stop() finalizes lazily and, if the
      // session was still initializing from a just-issued start(), can be ignored —
      // leaving an orphaned recognizer holding the mic (the lingering orange dot).
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null; // must not restart
        rec.abort();
      } catch { /* ignore */ }
      // Guard the start/stop race: if start() was in flight, the abort above may be
      // dropped. Abort again the moment it actually starts, and once more shortly
      // after, so no initializing session survives to keep the mic open.
      rec.onstart = () => { try { rec.abort(); } catch { /* ignore */ } };
      setTimeout(() => { try { rec.abort(); } catch { /* ignore */ } }, 80);
    };
  }, [enabled, active, onCommand, pauseMs]);
}
