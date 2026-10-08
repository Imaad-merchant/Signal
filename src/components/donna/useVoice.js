import { useRef, useState, useCallback, useEffect } from "react";

// Voice capture for the Jarvis orb. Tap to talk: call start() on the first tap,
// stop() on the second; the transcript is delivered via onFinalTranscript
// (always called once per start(), with "" when nothing was captured).
//
// Speech-to-text runs in the browser (Web Speech API); there is no server
// transcription.
//
// Mobile notes:
//  - rec.start() runs synchronously inside the tap. iOS only lets recognition
//    start from a user gesture, and an `await` before it loses the gesture.
//  - Phones only allow one mic capture at a time, so the level meter
//    (getUserMedia) is NOT opened alongside recognition on touch devices — it
//    starves the recognizer ("audio-capture"). The orb waveform is driven from
//    recognition activity there instead.
//  - stop() finalizes gracefully (rec.stop()) so the words you just said aren't
//    thrown away; abort() is only a fallback if the engine never ends.

function srCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
}

function speechErrorMessage(code) {
  switch (code) {
    case "not-allowed":
      return "Microphone is blocked — allow it for this site in your browser settings, or type instead.";
    case "audio-capture":
      return "Couldn't reach the microphone — another app may be using it.";
    case "no-speech":
      return "";
    case "service-not-allowed":
      return "Voice input isn't available here — on iPhone, open Donna in Safari instead of the home-screen app, or type.";
    default:
      return "Voice input hit a snag — tap to try again, or type instead.";
  }
}

export function useVoice({ onFinalTranscript } = {}) {
  const supported = !!srCtor();

  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [micError, setMicError] = useState(null);
  const amplitudeRef = useRef(0);

  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);

  const activeRef = useRef(false); // a start() is in progress and hasn't reported yet
  const recRef = useRef(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const abortTimerRef = useRef(0);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);
  const decayRef = useRef(0);

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(decayRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
    amplitudeRef.current = 0;
  }, []);

  // Report exactly once per start().
  const finish = useCallback((text, error) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    window.clearTimeout(abortTimerRef.current);
    cleanupAudio();
    setListening(false);
    setPartial("");
    if (onFinalRef.current) onFinalRef.current((text || "").trim(), error ? { error } : undefined);
  }, [cleanupAudio]);

  // Desktop only: mic level → orb waveform.
  const meter = useCallback((stream) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new Ctx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        amplitudeRef.current = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* waveform is cosmetic */ }
  }, []);

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    setMicError(null);
    setPartial("");

    const SR = srCtor();
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    recRef.current = rec;
    finalRef.current = "";
    interimRef.current = "";
    let failure = null;
    const touch = isTouchDevice();

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalRef.current += (finalRef.current ? " " : "") + text.trim();
        else interim += text;
      }
      interimRef.current = interim.trim();
      setPartial(interim);
      if (touch) amplitudeRef.current = 0.85; // no level meter on phones — pulse on speech
    };
    rec.onerror = (e) => { failure = (e && e.error) || "error"; };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      // Keep whatever was still interim when you tapped stop — on phones most of
      // the utterance is often never marked final.
      const text = [finalRef.current, interimRef.current].filter(Boolean).join(" ");
      const msg = failure && !text ? speechErrorMessage(failure) : "";
      if (msg) setMicError(msg);
      finish(text, msg ? failure : undefined);
    };

    // Synchronous — must stay inside the user's tap.
    try {
      rec.start();
    } catch {
      recRef.current = null;
      const msg = "Couldn't start the microphone — tap to try again, or type instead.";
      setMicError(msg);
      finish("", msg);
      return;
    }
    setListening(true);

    if (touch) {
      // Let the pulse decay between results.
      decayRef.current = window.setInterval(() => {
        amplitudeRef.current = Math.max(0.15, amplitudeRef.current * 0.8);
      }, 90);
    } else {
      // Desktop can share the mic: open a level meter for a real waveform.
      navigator.mediaDevices?.getUserMedia?.({ audio: true })
        .then((stream) => {
          if (!activeRef.current || recRef.current !== rec) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          meter(stream);
        })
        .catch(() => { /* recognition still works without the waveform */ });
    }
  }, [supported, finish, meter]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    const rec = recRef.current;
    if (!rec) { finish(""); return; }
    try { rec.stop(); } catch { /* ignore */ }
    // Some engines never fire onend after stop() — force it.
    window.clearTimeout(abortTimerRef.current);
    abortTimerRef.current = window.setTimeout(() => {
      try { rec.abort(); } catch { /* ignore */ }
      if (recRef.current === rec) {
        recRef.current = null;
        finish([finalRef.current, interimRef.current].filter(Boolean).join(" "));
      }
    }, 1500);
  }, [finish]);

  // Drop the session without delivering anything (mute / unmount): free the mic now.
  const cancel = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) { try { rec.onend = null; rec.abort(); } catch { /* ignore */ } }
    window.clearTimeout(abortTimerRef.current);
    cleanupAudio();
    activeRef.current = false;
    setListening(false);
    setPartial("");
  }, [cleanupAudio]);

  useEffect(() => () => {
    const rec = recRef.current;
    if (rec) { try { rec.onend = null; rec.abort(); } catch { /* ignore */ } }
    window.clearTimeout(abortTimerRef.current);
    cleanupAudio();
    activeRef.current = false;
  }, [cleanupAudio]);

  return { supported, listening, partial, micError, amplitudeRef, start, stop, cancel };
}
