import { useRef, useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// Voice capture for the Jarvis orb. Tap to talk: call start() on the first tap,
// stop() on the second; the transcript is delivered via onFinalTranscript
// (always called once per start(), with "" when nothing was captured).
//
// Two engines:
//  - "speech": the Web Speech API (SpeechRecognition) — live partials, no server.
//  - "record": MediaRecorder → server Whisper (`transcribe` route). Used where the
//    browser has no working SpeechRecognition (Firefox, iOS home-screen apps,
//    Brave) and as an automatic fallback when recognition errors out.
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

const STT_PREF_KEY = "donna_stt_engine";
const FALLBACK_ERRORS = new Set(["service-not-allowed", "network", "language-not-supported"]);
const MAX_RECORD_MS = 60_000;

function srCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function recorderAvailable() {
  return typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
}

export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
}

// iOS home-screen web apps expose webkitSpeechRecognition but it never works there.
function isIOSStandalone() {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  return ios && standalone;
}

function pickRecorderMime() {
  const MR = window.MediaRecorder;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    try { if (MR.isTypeSupported?.(m)) return m; } catch { /* ignore */ }
  }
  return "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function speechErrorMessage(code) {
  switch (code) {
    case "not-allowed":
      return "Microphone is blocked — allow it for this site in your browser settings, or type instead.";
    case "audio-capture":
      return "Couldn't reach the microphone — another app may be using it.";
    case "no-speech":
      return "";
    default:
      return "Voice input hit a snag — tap to try again, or type instead.";
  }
}

export function useVoice({ onFinalTranscript } = {}) {
  const hasSR = !!srCtor();
  const hasRecorder = recorderAvailable();
  const supported = hasSR || hasRecorder;

  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [micError, setMicError] = useState(null);
  const amplitudeRef = useRef(0);

  const onFinalRef = useRef(onFinalTranscript);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);

  const engineRef = useRef(null); // "speech" | "record" for the session in progress
  const activeRef = useRef(false); // a start() is in progress and hasn't reported yet
  const recRef = useRef(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const gotResultRef = useRef(false);
  const abortTimerRef = useRef(0);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);
  const decayRef = useRef(0);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const maxTimerRef = useRef(0);
  const discardRef = useRef(false);
  const micPendingRef = useRef(false); // waiting on the getUserMedia prompt

  const preferRecorder = () => {
    if (!hasSR) return true;
    if (!hasRecorder) return false;
    if (isIOSStandalone()) return true;
    try { return localStorage.getItem(STT_PREF_KEY) === "record"; } catch { return false; }
  };

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
    engineRef.current = null;
    window.clearTimeout(abortTimerRef.current);
    window.clearTimeout(maxTimerRef.current);
    cleanupAudio();
    setListening(false);
    setPartial("");
    if (onFinalRef.current) onFinalRef.current((text || "").trim(), error ? { error } : undefined);
  }, [cleanupAudio]);

  // Mic level → orb waveform, from an open stream. `onLevel` sees each RMS sample.
  const meter = useCallback((stream, onLevel) => {
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
        const level = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
        amplitudeRef.current = level;
        if (onLevel) onLevel(level);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* waveform is cosmetic */ }
  }, []);

  // ---------------- Recorder engine (MediaRecorder → Whisper) ----------------
  const startRecorder = useCallback(async () => {
    engineRef.current = "record";
    let stream;
    micPendingRef.current = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micPendingRef.current = false;
    } catch (err) {
      micPendingRef.current = false;
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      const msg = denied
        ? "Microphone is blocked — allow it for this site in your browser settings, or type instead."
        : "Couldn't open the microphone — type instead.";
      setMicError(msg);
      finish("", msg);
      return;
    }
    if (!activeRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    streamRef.current = stream;

    const mime = pickRecorderMime();
    let mr;
    try {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
    } catch {
      try { mr = new MediaRecorder(stream); } catch {
        setMicError("Voice recording isn't supported in this browser — type instead.");
        finish("", "unsupported");
        return;
      }
    }
    mediaRecRef.current = mr;
    chunksRef.current = [];
    discardRef.current = false;

    // Hands-free end of turn: once you've spoken, ~1.6s of quiet sends it; if
    // nothing is said for 8s, give up.
    const startedAt = Date.now();
    let heardAt = 0;
    let quietSince = 0;
    meter(stream, (level) => {
      if (mr.state !== "recording") return;
      const now = Date.now();
      if (level > 0.12) { heardAt = now; quietSince = 0; }
      else if (level < 0.06) { if (!quietSince) quietSince = now; }
      if (heardAt && quietSince && now - quietSince > 1600) { try { mr.stop(); } catch { /* ignore */ } }
      else if (!heardAt && now - startedAt > 8000) { try { mr.stop(); } catch { /* ignore */ } }
    });

    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const type = (mr.mimeType || mime || "audio/webm").split(";")[0];
      cleanupAudio();
      mediaRecRef.current = null;
      if (discardRef.current) { finish(""); return; }
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size < 1200) { finish(""); return; }
      setPartial("Transcribing…");
      try {
        const audio = await blobToBase64(blob);
        const res = await base44.functions.invoke("donna", { route: "transcribe", audio, mime: type });
        const data = (res && res.data) ? res.data : res || {};
        finish(data.text || "");
      } catch (err) {
        // 503 = the server has no transcription key; don't stay pinned to this engine.
        const unconfigured = /\b503\b/.test(String(err?.message || ""));
        if (unconfigured) { try { localStorage.removeItem(STT_PREF_KEY); } catch { /* ignore */ } }
        const msg = unconfigured
          ? "Voice transcription isn't set up on the server — type instead."
          : "Couldn't transcribe that — check your connection and try again.";
        setMicError(msg);
        finish("", msg);
      }
    };

    try {
      mr.start(250);
      setListening(true);
      maxTimerRef.current = window.setTimeout(() => { try { mr.stop(); } catch { /* ignore */ } }, MAX_RECORD_MS);
    } catch {
      setMicError("Couldn't start recording — type instead.");
      finish("", "record-start");
    }
  }, [finish, meter, cleanupAudio]);

  // ---------------- Speech engine (Web Speech API) ----------------
  const startSpeech = useCallback(() => {
    engineRef.current = "speech";
    const SR = srCtor();
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    recRef.current = rec;
    finalRef.current = "";
    interimRef.current = "";
    gotResultRef.current = false;
    let failure = null;
    const touch = isTouchDevice();

    rec.onresult = (event) => {
      gotResultRef.current = true;
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
      // Recognition isn't usable in this browser — switch to recording for good.
      if (failure && FALLBACK_ERRORS.has(failure) && !gotResultRef.current && hasRecorder && activeRef.current) {
        try { localStorage.setItem(STT_PREF_KEY, "record"); } catch { /* ignore */ }
        cleanupAudio();
        setPartial("");
        startRecorder();
        return;
      }
      // Keep whatever was still interim when you tapped stop — on phones most of
      // the utterance is often never marked final.
      const text = [finalRef.current, interimRef.current].filter(Boolean).join(" ");
      const msg = failure && !text ? speechErrorMessage(failure) : "";
      if (msg) setMicError(msg);
      finish(text, msg ? failure : undefined);
    };

    try {
      rec.start();
    } catch {
      recRef.current = null;
      if (hasRecorder) { startRecorder(); return; }
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
          if (!activeRef.current || engineRef.current !== "speech") { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          meter(stream);
        })
        .catch(() => { /* recognition still works without the waveform */ });
    }
  }, [hasRecorder, finish, meter, cleanupAudio, startRecorder]);

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    setMicError(null);
    setPartial("");
    // Synchronous on the speech path — keep this inside the user's tap.
    if (preferRecorder()) startRecorder();
    else startSpeech();
  }, [supported, startRecorder, startSpeech]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    if (engineRef.current === "record") {
      const mr = mediaRecRef.current;
      if (mr && mr.state === "recording") { try { mr.stop(); } catch { finish(""); } }
      else if (micPendingRef.current) { discardRef.current = true; finish(""); } // still on the mic prompt
      return; // otherwise already transcribing — let it deliver
    }
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
    const mr = mediaRecRef.current;
    if (mr && mr.state === "recording") { discardRef.current = true; try { mr.stop(); } catch { /* ignore */ } }
    window.clearTimeout(abortTimerRef.current);
    window.clearTimeout(maxTimerRef.current);
    cleanupAudio();
    activeRef.current = false;
    engineRef.current = null;
    setListening(false);
    setPartial("");
  }, [cleanupAudio]);

  useEffect(() => () => {
    const rec = recRef.current;
    if (rec) { try { rec.onend = null; rec.abort(); } catch { /* ignore */ } }
    const mr = mediaRecRef.current;
    if (mr && mr.state === "recording") { discardRef.current = true; try { mr.stop(); } catch { /* ignore */ } }
    window.clearTimeout(abortTimerRef.current);
    window.clearTimeout(maxTimerRef.current);
    cleanupAudio();
    activeRef.current = false;
  }, [cleanupAudio]);

  return { supported, listening, partial, micError, amplitudeRef, start, stop, cancel };
}
