import React, { useRef, useState } from "react";
import { Mic, Square, Upload, Loader2, X, Brain, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Brain-dump inbox: capture vocal thoughts (recorded → Whisper), paste text, or
// import text/markdown documents, then organize + save into the same notes Donna
// writes to (the `cleanup` route → a Page). One "Organize & save" action for all
// three input methods.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export default function ThoughtsPanel({ onClose, onSaved }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState("");     // "transcribing" | "saving"
  const [msg, setMsg] = useState("");
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const startRec = async () => {
    setMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (!blob.size) { setMsg("Nothing recorded."); return; }
        setBusy("transcribing"); setMsg("Transcribing…");
        try {
          const b64 = await blobToBase64(blob);
          const res = await base44.functions.invoke("donna", { route: "transcribe", audio: b64, mime: "audio/webm" });
          const data = (res && res.data) ? res.data : res || {};
          if (data.text) { setText((t) => (t ? `${t}\n\n${data.text}` : data.text)); setMsg("Added your transcript below — edit or Organize & save."); }
          else setMsg(data.error || "Couldn't transcribe that.");
        } catch { setMsg("Transcription failed — try again."); }
        setBusy("");
      };
      rec.start();
      setRecording(true);
    } catch { setMsg("Microphone access is off — allow it, or paste/import instead."); }
  };
  const stopRec = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setRecording(false); };

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setMsg("");
    if (f.size > 2_000_000) { setMsg("That file is large — keep it under ~2 MB of text."); return; }
    try {
      const content = await f.text();
      setText((t) => (t ? `${t}\n\n${content}` : content));
      setMsg(`Imported "${f.name}".`);
    } catch { setMsg("Couldn't read that file — plain text or markdown works best."); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const organizeAndSave = async () => {
    const raw = text.trim();
    if (!raw) { setMsg("Add some thoughts first — record, paste, or import."); return; }
    setBusy("saving"); setMsg("Organizing…");
    try {
      const res = await base44.functions.invoke("donna", { route: "cleanup", text: raw });
      const data = (res && res.data) ? res.data : res || {};
      const title = data.title || "Thoughts";
      const content = data.content || raw;
      await base44.entities.Page.create({ title, type: "document", content, source: "donna" }).catch(() => null);
      setMsg(`Saved "${title}" to your notes.`);
      setText("");
      onSaved && onSaved(title);
    } catch { setMsg("Couldn't save — try again."); }
    setBusy("");
  };

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/60 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0e1015] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200"><Brain className="h-4 w-4 text-cyan-300" /> Capture thoughts</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-200" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <p className="mb-2 text-[11px] text-gray-500">Record out loud, paste, or import a document — I'll organize it and file it with your notes.</p>

        <div className="mb-2 flex items-center gap-2">
          {recording ? (
            <button onClick={stopRec} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">
              <Square className="h-3.5 w-3.5" /> Stop
              <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-white" />
            </button>
          ) : (
            <button onClick={startRec} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50">
              <Mic className="h-3.5 w-3.5" /> Record
            </button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:border-white/25">
            <Upload className="h-3.5 w-3.5" /> Import file
            <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={onFile} className="hidden" />
          </label>
          {busy === "transcribing" && <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300"><Loader2 className="h-3 w-3 animate-spin" /> transcribing</span>}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Type or paste your thoughts here — or hit Record and just talk."
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25"
        />

        {msg && <p className="mt-2 text-[11px] text-cyan-300">{msg}</p>}

        <div className="mt-3 flex justify-end">
          <button onClick={organizeAndSave} disabled={!text.trim() || !!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40">
            {busy === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Organize &amp; save
          </button>
        </div>
      </div>
    </div>
  );
}
