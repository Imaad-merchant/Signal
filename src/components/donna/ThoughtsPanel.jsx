import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Loader2, X, Brain, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Brain-dump inbox: capture vocal thoughts (dictated live via the browser's
// SpeechRecognition — no audio leaves the device), paste text, or import
// text/markdown documents, then organize + save into the same notes Donna writes
// to (the `cleanup` route → a Page). One "Organize & save" action for all three.
const speechSupported = () =>
  typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

export default function ThoughtsPanel({ onClose, onSaved }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState("");     // "saving"
  const [msg, setMsg] = useState("");
  const [partial, setPartial] = useState("");
  const recRef = useRef(null);
  const finalRef = useRef("");
  const fileRef = useRef(null);
  const canDictate = speechSupported();

  // Live dictation: final phrases are appended to the text as they're recognised,
  // the in-progress phrase shows underneath the box.
  const startRec = () => {
    setMsg("");
    if (!canDictate) { setMsg("Dictation isn't supported in this browser — paste or import instead."); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    recRef.current = rec;
    finalRef.current = "";
    rec.onresult = (event) => {
      let interim = "";
      let added = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) added += (added ? " " : "") + t.trim();
        else interim = t;
      }
      if (added) {
        finalRef.current += (finalRef.current ? " " : "") + added;
        setText((prev) => (prev ? `${prev.replace(/\s+$/, "")} ${added}` : added));
      }
      setPartial(interim);
    };
    rec.onerror = (e) => {
      setRecording(false); setPartial("");
      if (e?.error === "not-allowed") setMsg("Microphone access is off — allow it, or paste/import instead.");
    };
    rec.onend = () => {
      setRecording(false); setPartial("");
      if (!finalRef.current) setMsg((m) => m || "Nothing heard — try again, or paste/import.");
    };
    try { rec.start(); setRecording(true); }
    catch { setRecording(false); setMsg("Couldn't start dictation — try again."); }
  };
  const stopRec = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setRecording(false); };
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* ignore */ } }, []);

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

        <p className="mb-2 text-[11px] text-gray-500">Dictate out loud, paste, or import a document — I'll organize it and file it with your notes.</p>

        <div className="mb-2 flex items-center gap-2">
          {recording ? (
            <button onClick={stopRec} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">
              <Square className="h-3.5 w-3.5" /> Stop
              <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-white" />
            </button>
          ) : (
            <button onClick={startRec} disabled={!!busy || !canDictate} title={canDictate ? "Dictate" : "Dictation isn't supported in this browser"} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50">
              <Mic className="h-3.5 w-3.5" /> Dictate
            </button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:border-white/25">
            <Upload className="h-3.5 w-3.5" /> Import file
            <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={onFile} className="hidden" />
          </label>
          {recording && <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300"><Loader2 className="h-3 w-3 animate-spin" /> listening</span>}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Type or paste your thoughts here — or hit Record and just talk."
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-white/25"
        />

        {partial && <p className="mt-1 text-[11px] italic text-gray-500">{partial}…</p>}
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
