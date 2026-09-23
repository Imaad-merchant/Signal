import { useRef, useState, useCallback, useEffect } from "react";

// Voice capture for the Jarvis orb:
//  - real microphone amplitude (getUserMedia + AnalyserNode) written to `amplitudeRef`
//    so the orb's Listening waveform reacts to your actual voice, and
//  - speech-to-text via the Web Speech API (SpeechRecognition).
// Push-to-talk: call start() on press, stop() on release; the final transcript is
// delivered via the onFinalTranscript callback.
export function useVoice({ onFinalTranscript } = {}) {
  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [micError, setMicError] = useState(null);
  const amplitudeRef = useRef(0);

  const recRef = useRef(null);
  const finalRef = useRef("");
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
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

  const stop = useCallback(() => {
    // abort() frees the mic immediately; stop() finalizes lazily and can keep the
    // mic (orange dot) held for a moment after we asked it to stop.
    try { recRef.current?.abort?.() ?? recRef.current?.stop(); } catch { /* ignore */ }
    cleanupAudio();
    setListening(false);
  }, [cleanupAudio]);

  const start = useCallback(async () => {
    if (!supported || listening) return;
    setMicError(null);
    setPartial("");
    finalRef.current = "";

    // Microphone level → orb waveform (best-effort; STT can still work without it).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
        const rms = Math.sqrt(sum / data.length);
        amplitudeRef.current = Math.min(1, rms * 3.2);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setMicError("Microphone access is off — you can type instead.");
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    recRef.current = rec;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalRef.current += (finalRef.current ? " " : "") + text;
        else interim = text;
      }
      setPartial(interim);
    };
    rec.onerror = () => { setListening(false); };
    rec.onend = () => {
      setListening(false);
      cleanupAudio();
      setPartial("");
      // Always report the end (even empty) so the caller can reset its state
      // instead of hanging in "listening" when nothing was captured.
      if (onFinalTranscript) onFinalTranscript(finalRef.current.trim());
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [supported, listening, onFinalTranscript, cleanupAudio]);

  useEffect(() => () => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    cleanupAudio();
  }, [cleanupAudio]);

  return { supported, listening, partial, micError, amplitudeRef, start, stop };
}
