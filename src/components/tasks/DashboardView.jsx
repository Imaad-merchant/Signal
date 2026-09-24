import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { GraduationCap, Upload, FileText, X, Plus, ArrowRight, ListChecks, NotebookPen, Check, ArrowUpRight, ArrowUp, RotateCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAutosave } from "./useAutosave";
import "./dashboard/degree.css";
import {
  parseDashboard,
  serializeDashboard,
  statsFor,
  answerFor,
  makeSource,
  parseTranscript,
  parseReqs,
  parseDegreeWorks,
  isDegreeWorks,
  degreeWorksMeta,
  fmtCr,
  tooLarge,
  STARTERS,
  SAMPLE_TRANSCRIPT,
  SAMPLE_REQS,
} from "./dashboard/degree";

// ─── Tokens used inline, straight from the artifact ──────────────────────────
const T = {
  bg: "var(--color-bg)",
  surface: "var(--color-surface)",
  text: "var(--color-text)",
  accent: "var(--color-accent)",
  divider: "var(--color-divider)",
  n200: "var(--color-neutral-200)",
  n600: "var(--color-neutral-600)",
  n700: "var(--color-neutral-700)",
  n800: "var(--color-neutral-800)",
  a100: "var(--color-accent-100)",
  a700: "var(--color-accent-700)",
  a800: "var(--color-accent-800)",
  head: "var(--font-heading)",
  body: "var(--font-body)",
};
const eyebrow = { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" };
const heading = (size, lh = 1.15) => ({ fontFamily: T.head, fontWeight: 800, fontSize: size, lineHeight: lh });
const bare = { background: "transparent", border: 0, cursor: "pointer", fontFamily: T.body, color: "inherit" };

const KIND_LABEL = { transcript: "Transcript", requirements: "Requirements", notes: "Notes" };
const KIND_ICON = { transcript: FileText, requirements: ListChecks, notes: NotebookPen };

const nid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Which bucket a pasted or dropped document belongs in — the artifact reads the
// content first and only falls back to the file name.
function guessKind(name, text) {
  // A Degree Works audit IS the degree list, whatever the file is called.
  if (isDegreeWorks(text)) return "requirements";
  if (/transcript|grades/i.test(name || "") || parseTranscript(text).length) return "transcript";
  const r = parseReqs(text);
  if (/require|audit|degree|catalog/i.test(name || "") || r.groups.reduce((a, g) => a + g.items.length, 0) >= 3) return "requirements";
  return "notes";
}

// Pull the text layer out of a PDF in the browser — no upload, no server round
// trip, and no new serverless function. pdf.js is imported on demand (it is a
// large dependency and only a dropped PDF needs it) with its worker resolved
// through Vite, so it never lands in the initial Tasks bundle.
//
// Text is reassembled using each item's `hasEOL` flag rather than joining on
// spaces: Degree Works prints label/value stanzas, and its parser reads lines.
async function extractPdfText(file) {
  const [pdfjs, workerUrl] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((m) => m.default),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let out = "";
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      for (const item of tc.items) {
        out += item.str || "";
        if (item.hasEOL) out += "\n";
      }
      out += "\n";
    }
  } finally {
    try { await doc.destroy(); } catch { /* ignore */ }
  }
  return out;
}

const fmtSize = (bytes) => (bytes > 1e6 ? (bytes / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1e3)) + " KB");

export default function DashboardView({ page, onSave }) {
  // Persisted: everything below is written back to the page doc.
  const [doc, setDoc] = useState(() => parseDashboard(page.dashboard));
  // Transient: draft text, staging and drag state never trigger a save.
  const [draft, setDraft] = useState("");
  const [paste, setPaste] = useState("");
  const [title, setTitle] = useState("");
  const [staged, setStaged] = useState([]);
  const [textH, setTextH] = useState(120);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [extracting, setExtracting] = useState(false);

  const fileRef = useRef(null);
  const rereadRef = useRef(null);
  const rereadId = useRef(null);
  const chatRef = useRef(null);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Bound to THIS page's id (the component is keyed per page.id), so a debounced
  // write that lands after a page switch still targets the right dashboard.
  const save = useCallback((patch) => onSave(page.id, patch), [onSave, page.id]);
  const { schedule } = useAutosave(500);

  useEffect(() => {
    setDoc(parseDashboard(page.dashboard));
    loadedRef.current = true;
  }, [page.id]);

  // Single funnel for persisted changes — nothing mutates `doc` without saving.
  const commit = useCallback((updater) => {
    setDoc((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (loadedRef.current) schedule({ dashboard: serializeDashboard(next) }, save);
      return next;
    });
  }, [schedule, save]);

  const { sources, degreeId, messages } = doc;

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);

  const st = useMemo(() => statsFor(sources, degreeId), [sources, degreeId]);
  const hasT = sources.some((x) => x.kind === "transcript");
  const hasR = sources.some((x) => x.kind === "requirements");
  const onCount = sources.filter((s) => s.on).length;
  const effDegree = st.reqSrc ? st.reqSrc.id : null;
  const reqCount = sources.filter((x) => x.kind === "requirements").length;

  const addSources = useCallback((list) => {
    if (!list.length) return;
    commit((s) => {
      let nextDegree = s.degreeId;
      list.forEach((src) => { if (src.kind === "requirements" && !nextDegree) nextDegree = src.id; });
      return { ...s, sources: [...s.sources, ...list], degreeId: nextDegree };
    });
  }, [commit]);

  const addStaged = () => {
    const text = paste.trim();
    const out = staged.map((f) => makeSource(guessKind(f.name, f.text), f.name, f.text, "file", f.size));
    if (text) {
      const kind = guessKind(title, text);
      out.push(makeSource(kind, title.trim() || { transcript: "Transcript", requirements: "Degree requirements", notes: "Note" }[kind], text, "paste"));
    }
    if (!out.length) return;
    const oversized = out.filter((s) => tooLarge(s.text));
    if (oversized.length) {
      setNotice(`${oversized[0].name} is too long to store on this page. Paste the part with your courses.`);
      return;
    }
    addSources(out);
    setPaste(""); setTitle(""); setStaged([]); setNotice("");
  };

  // Text comes out of the file in the browser — no upload, no server round trip.
  // PDFs go through pdf.js (lazily imported, so it stays out of the initial bundle);
  // a scanned PDF has no text layer and still lands as a named source with none.
  const handleFiles = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    setExtracting(true);
    const out = [];
    const failures = [];
    try {
      for (const f of arr) {
        let text = "";
        if (/^text\//.test(f.type) || /\.(txt|md|csv|json)$/i.test(f.name)) {
          try { text = await f.text(); } catch { /* keep the file, drop the text */ }
        } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          try {
            text = await extractPdfText(f);
          } catch (err) {
            // A worker that failed to load and a PDF with no text layer are
            // different problems — say which one actually happened.
            console.error("PDF text extraction failed", err);
            failures.push(`${f.name}: ${err && err.message ? err.message : "could not be read"}`);
          }
        }
        out.push({ id: nid(), name: f.name, text, size: fmtSize(f.size) });
      }
    } finally {
      if (mountedRef.current) setExtracting(false);
    }
    if (!mountedRef.current) return;
    const blank = out.filter((f) => !f.text.trim() && !failures.some((m) => m.startsWith(f.name)));
    setNotice(
      failures.length ? `Couldn't read ${failures[0]}`
      : blank.length ? `${blank[0].name} has no text layer — it looks scanned. Paste the text instead, or export it again from the browser.`
      : ""
    );
    setStaged((s) => [...s, ...out]);
  };

  // Re-read a source whose file produced no text — a stale cached build, a failed
  // worker or a wrong file all leave the same empty source, and removing and
  // re-adding it would lose its name and its degree-list pick.
  const rereadSource = (id) => { rereadId.current = id; if (rereadRef.current) rereadRef.current.click(); };

  const onRereadFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    const id = rereadId.current;
    e.target.value = "";
    if (!f || !id) return;
    setExtracting(true);
    let text = "";
    let error = "";
    try {
      if (/^text\//.test(f.type) || /\.(txt|md|csv|json)$/i.test(f.name)) text = await f.text();
      else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) text = await extractPdfText(f);
    } catch (err) {
      error = err && err.message ? err.message : "could not be read";
    } finally {
      if (mountedRef.current) setExtracting(false);
    }
    if (!mountedRef.current) return;
    if (!text.trim()) {
      setNotice(error ? `Couldn't read ${f.name}: ${error}` : `${f.name} still has no text to read.`);
      return;
    }
    if (tooLarge(text)) { setNotice(`${f.name} is too long to store on this page. Paste the part with your courses.`); return; }
    setNotice("");
    commit((p) => ({
      ...p,
      sources: p.sources.map((x) => (x.id === id ? { ...x, text, kind: guessKind(x.name, text), size: fmtSize(f.size) } : x)),
    }));
  };

  const onGripDown = (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = textH;
    const move = (ev) => setTextH(Math.max(72, Math.min(520, h0 + ev.clientY - y0)));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const send = async (qIn) => {
    const q = (qIn ?? draft).trim();
    if (!q || pending) return;
    commit((s) => ({ ...s, messages: [...s.messages, { role: "user", text: q, cites: [] }] }));
    setDraft("");
    setPending(true);

    let text = null;
    if (st.on.length) {
      const ctx = st.on.map((s) => `=== ${s.name} (${s.kind}) ===\n${s.text || "(PDF, no extracted text)"}`).join("\n\n");
      const facts = `Computed: earned ${st.earned} of ${st.target} credits (${st.pct}%), in progress ${st.ip}, GPA ${st.gpa == null ? "n/a" : st.gpa.toFixed(2)}, required classes missing: ${st.missing.map((i) => i.code).join(", ") || "none"}.`;
      try {
        const r = await base44.integrations.Core.InvokeLLM({
          prompt: `You are Signal, a degree-progress assistant inside a student's dashboard. Answer ONLY from the context documents below. Be direct and specific with numbers, under 90 words, plain text, no markdown.\n\n${facts}\n\n${ctx}\n\nQuestion: ${q}`,
        });
        // The endpoint returns parsed JSON when the model emits JSON, else { result }.
        const candidate = typeof r === "string" ? r : r && typeof r.result === "string" ? r.result : null;
        if (candidate && candidate.trim()) text = candidate;
      } catch { text = null; }
    }
    // Offline/refused → the artifact's own computed answer, which never lies about
    // the numbers because it reads the same stats the right-hand pane shows.
    if (!text) text = answerFor(q, st);
    if (!mountedRef.current) return;
    const cites = st.on.filter((s) => s.kind !== "notes" || /advisor|plan|minor/i.test(q)).map((s) => s.name);
    commit((s) => ({ ...s, messages: [...s.messages, { role: "ai", text: String(text).trim(), cites }] }));
    setPending(false);
  };

  const loadSamples = () => {
    const add = [];
    if (!hasT) add.push(makeSource("transcript", "Transcript_Unofficial_2026.pdf", SAMPLE_TRANSCRIPT, "file", "212 KB"));
    if (!hasR) add.push(makeSource("requirements", "BS_CS_Requirements_2023.pdf", SAMPLE_REQS, "file", "96 KB"));
    addSources(add);
  };

  const sourceRows = sources.map((s) => {
    let meta = "";
    // An empty file source is the failure case that used to be invisible: it read
    // as "PDF · 166 KB", exactly like a file that had been parsed fine.
    if (!s.text.trim()) {
      return { s, meta: s.origin === "file" ? "No text read from this file" : "Empty", warn: true, canReread: s.origin === "file", isDegree: false, canBeDegree: false };
    }
    if (s.kind === "transcript") {
      const cs = parseTranscript(s.text);
      const terms = new Set(cs.map((c) => c.term)).size;
      meta = cs.length ? `${cs.length} courses · ${terms} terms` : (s.size ? `PDF · ${s.size}` : "No course lines found");
    } else if (isDegreeWorks(s.text)) {
      meta = degreeWorksMeta(parseDegreeWorks(s.text));
    } else if (s.kind === "requirements") {
      const r = parseReqs(s.text);
      const n = r.groups.reduce((a, g) => a + g.items.length, 0);
      meta = n ? `${n} classes${r.total ? ` · ${r.total} cr` : ""}` : (s.size ? `PDF · ${s.size}` : "No classes found");
    } else {
      meta = `${(s.text.match(/\S+/g) || []).length} words`;
    }
    return { s, meta, warn: false, canReread: false, isDegree: s.kind === "requirements" && s.id === effDegree, canBeDegree: s.kind === "requirements" && s.id !== effDegree && reqCount > 1 && s.on };
  });

  const usingText = onCount
    ? "Using " + sources.filter((s) => s.on).map((s) => ({ transcript: "transcript", requirements: s.id === effDegree ? "degree list" : "requirements", notes: "notes" }[s.kind])).filter((v, i, a) => a.indexOf(v) === i).join(", ")
    : "Nothing in context yet";
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.text));
  const followups = STARTERS.filter((t) => !asked.has(t)).slice(0, 3);
  const nothingStaged = !paste.trim() && staged.length === 0;
  const addCount = staged.length + (paste.trim() ? 1 : 0);

  const C = 2 * Math.PI * 58;
  const eLen = (Math.min(st.earned, st.target) / st.target) * C;
  const iLen = (Math.min(st.ip, Math.max(0, st.target - st.earned)) / st.target) * C;

  return (
    <div className="degree-dash" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, padding: "18px 24px 14px", borderBottom: `2px solid ${T.divider}`, flex: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, ...eyebrow, letterSpacing: "0.1em", color: T.a700 }}>
            <GraduationCap style={{ width: 14, height: 14, flex: "none" }} />
            Dashboard
          </div>
          <input
            value={page.title || ""}
            onChange={(e) => onSave(page.id, { title: e.target.value })}
            placeholder="Degree dashboard"
            aria-label="Page title"
            style={{ ...heading(26), letterSpacing: "-0.015em", color: T.text, background: "transparent", border: 0, padding: 0, width: "100%", outline: "none" }}
          />
        </div>
        <div style={{ fontSize: 12, color: T.n700, paddingBottom: 4 }}>
          {sources.length ? `${onCount} of ${sources.length} sources in chat · Saved` : "New · Saved"}
        </div>
      </div>

      <div className="degree-dash-grid" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "330px minmax(0, 1fr) 340px" }}>

        {/* ── Context ───────────────────────────────────────────────────── */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          style={{ borderRight: `2px solid ${T.divider}`, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 20, position: "relative" }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={eyebrow}>Context</span>
            <span style={{ fontSize: 12, color: T.n700 }}>
              {sources.length ? `${sources.length} source${sources.length === 1 ? "" : "s"}` : "empty"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!dragOver ? (
              <button
                className="dd-drop"
                onClick={() => fileRef.current && fileRef.current.click()}
                style={{ ...bare, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, width: "100%", minHeight: 112, padding: 16, border: `1px solid ${T.divider}`, textAlign: "left", color: T.text }}
              >
                <Upload style={{ width: 20, height: 20, flex: "none" }} />
                <span style={heading(16, 1.2)}>{extracting ? "Reading your file…" : "Drop any file here"}</span>
                <span style={{ fontSize: 12, color: T.n700 }}>or click to browse. PDFs, docs, images, spreadsheets.</span>
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, width: "100%", minHeight: 112, padding: 16, background: T.a100, border: `2px solid ${T.accent}`, color: T.a800 }}>
                <Upload style={{ width: 20, height: 20, flex: "none" }} />
                <span style={heading(16, 1.2)}>Release to add</span>
              </div>
            )}
            <input ref={fileRef} type="file" multiple onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            <input ref={rereadRef} type="file" onChange={onRereadFile} style={{ display: "none" }} />

            {staged.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${T.divider}` }}>
                {staged.map((f) => (
                  <div key={f.id} style={{ display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) auto auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.divider}`, fontSize: 13 }}>
                    <FileText style={{ width: 14, height: 14, flex: "none" }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ fontSize: 12, color: T.n700 }}>{f.size}</span>
                    <button
                      className="dd-ghost"
                      onClick={() => setStaged((s) => s.filter((x) => x.id !== f.id))}
                      title="Remove"
                      style={{ ...bare, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: T.n700 }}
                    >
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column" }}>
              <input
                className="dd-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                style={{ width: "100%", padding: "8px 10px", fontFamily: T.head, fontWeight: 800, fontSize: 14, color: T.text, background: T.surface, border: `1px solid ${T.divider}`, borderBottom: 0, caretColor: T.accent, outline: "none" }}
              />
              <textarea
                className="dd-field"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Type or paste anything: a transcript, degree audit, advisor notes…"
                style={{ width: "100%", height: textH, resize: "none", display: "block", padding: "8px 10px", fontFamily: T.body, fontSize: 14, lineHeight: 1.45, color: T.text, background: T.surface, border: `1px solid ${T.divider}`, borderBottom: 0, caretColor: T.accent, outline: "none" }}
              />
              <div
                className="dd-grip"
                onMouseDown={onGripDown}
                title="Drag to resize"
                style={{ height: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 3, background: T.n200, border: `1px solid ${T.divider}`, cursor: "ns-resize", userSelect: "none" }}
              >
                <span style={{ width: 24, height: 2, background: T.n600 }} />
              </div>
            </div>

            {notice && <div style={{ fontSize: 12, color: T.a700 }}>{notice}</div>}

            <button
              className="dd-accent-btn"
              onClick={addStaged}
              disabled={nothingStaged}
              style={{ ...bare, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6, width: "100%", padding: "10px 14px", background: T.accent, color: T.bg, fontFamily: T.head, fontWeight: 800, fontSize: 14 }}
            >
              <Plus style={{ width: 16, height: 16, flex: "none" }} />
              {addCount > 1 ? `Add ${addCount} items to context` : "Add to context"}
            </button>

            {!(hasT && hasR) && (
              <button className="dd-accent-link" onClick={loadSamples} style={{ ...bare, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: 4, marginLeft: -4, fontFamily: T.head, fontWeight: 800, fontSize: 13, color: T.a700 }}>
                Load a sample transcript and degree list
                <ArrowRight style={{ width: 14, height: 14, flex: "none" }} />
              </button>
            )}
          </div>

          {sources.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", borderTop: `2px solid ${T.divider}` }}>
              {sourceRows.map(({ s, meta, warn, canReread, isDegree, canBeDegree }) => {
                const Icon = KIND_ICON[s.kind];
                return (
                  <div key={s.id} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", gap: 10, alignItems: "start", padding: "12px 0", borderBottom: `1px solid ${T.divider}` }}>
                    <Icon style={{ width: 18, height: 18, marginTop: 1 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <input
                        className="dd-rename"
                        value={s.name}
                        title="Rename"
                        onChange={(e) => { const v = e.target.value; commit((p) => ({ ...p, sources: p.sources.map((x) => (x.id === s.id ? { ...x, name: v } : x)) })); }}
                        style={{ width: "100%", minWidth: 0, padding: "2px 4px", margin: "-2px 0 0 -4px", fontFamily: T.body, fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: T.text, background: "transparent", border: "1px solid transparent", outline: "none", textOverflow: "ellipsis" }}
                      />
                      <span style={{ fontSize: 12, color: warn ? T.a700 : T.n700 }}>{KIND_LABEL[s.kind]} · {meta}</span>
                      {canReread && (
                        <button className="dd-accent-link" onClick={() => rereadSource(s.id)} style={{ ...bare, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, padding: "2px 4px", marginLeft: -4, fontFamily: T.head, fontWeight: 800, fontSize: 12, color: T.a700 }}>
                          <RotateCw style={{ width: 12, height: 12 }} />
                          Read this file again
                        </button>
                      )}
                      {isDegree && <span style={{ alignSelf: "flex-start", fontSize: 11, letterSpacing: "0.02em", padding: "3px 10px", background: T.a100, color: T.a800 }}>Degree list</span>}
                      {canBeDegree && (
                        <button className="dd-accent-link" onClick={() => commit((p) => ({ ...p, degreeId: s.id }))} style={{ ...bare, alignSelf: "flex-start", padding: "2px 4px", marginLeft: -4, fontFamily: T.head, fontWeight: 800, fontSize: 12, color: T.a700 }}>
                          Use as degree list
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        className="dd-ghost"
                        title="Include in chat"
                        onClick={() => commit((p) => ({ ...p, sources: p.sources.map((x) => (x.id === s.id ? { ...x, on: !x.on } : x)) }))}
                        style={{ ...bare, display: "flex", alignItems: "center", gap: 6, padding: 4, fontSize: 12, color: T.n800 }}
                      >
                        {s.on ? (
                          <span style={{ width: 16, height: 16, background: T.accent, color: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Check style={{ width: 12, height: 12 }} />
                          </span>
                        ) : (
                          <span style={{ width: 16, height: 16, border: `1.5px solid ${T.n600}` }} />
                        )}
                        Chat
                      </button>
                      <button
                        className="dd-ghost"
                        title="Remove"
                        onClick={() => commit((p) => ({ ...p, sources: p.sources.filter((x) => x.id !== s.id), degreeId: p.degreeId === s.id ? null : p.degreeId }))}
                        style={{ ...bare, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: T.n700 }}
                      >
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Ask ───────────────────────────────────────────────────────── */}
        <div className="degree-dash-chat" style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "20px 32px 0" }}>
            <span style={eyebrow}>Ask</span>
            <span style={{ fontSize: 12, color: T.n700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{usingText}</span>
          </div>

          <div ref={chatRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 32px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
            {messages.length === 0 && !pending && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600, paddingTop: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ ...heading(34, 1.1), letterSpacing: "-0.015em", textWrap: "pretty" }}>Ask about your transcript, credits and what’s left.</div>
                  <div style={{ fontSize: 15, lineHeight: 1.5, color: T.n800, textWrap: "pretty" }}>Answers come only from what’s in Context, and each one names the documents it used.</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", borderTop: `2px solid ${T.divider}` }}>
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      className="dd-row"
                      onClick={() => send(q)}
                      disabled={onCount === 0}
                      style={{ ...bare, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "12px 4px", borderBottom: `1px solid ${T.divider}`, textAlign: "left", fontSize: 15, color: T.text }}
                    >
                      {q}
                      <ArrowUpRight style={{ width: 16, height: 16, flex: "none" }} />
                    </button>
                  ))}
                </div>
                {onCount === 0 && <div style={{ fontSize: 13, color: T.a700 }}>Add a transcript to Context to start asking.</div>}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 640 }}>
                {m.role === "user" ? (
                  <>
                    <span style={{ ...eyebrow, color: T.n700 }}>You</span>
                    <div style={heading(18, 1.3)}>{m.text}</div>
                  </>
                ) : (
                  <>
                    <span style={{ ...eyebrow, color: T.a700 }}>Signal</span>
                    <div style={{ fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap", textWrap: "pretty" }}>{m.text}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                      {(m.cites || []).map((c, j) => (
                        <span key={j} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, letterSpacing: "0.02em", padding: "3px 8px", background: T.n200, color: T.n800 }}>
                          <FileText style={{ width: 12, height: 12 }} />
                          {c}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}

            {pending && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...eyebrow, color: T.a700 }}>Signal</span>
                <div style={{ fontSize: 15, color: T.n700 }}>Reading your context…</div>
              </div>
            )}
          </div>

          <div style={{ borderTop: `2px solid ${T.divider}`, padding: "14px 32px 18px", display: "flex", flexDirection: "column", gap: 10, flex: "none" }}>
            {messages.length > 0 && !pending && followups.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {followups.map((f) => (
                  <button key={f} className="dd-chip" onClick={() => send(f)} style={{ ...bare, fontSize: 12, padding: "4px 10px", border: `1px solid ${T.accent}`, color: T.a700 }}>
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <textarea
                className="dd-field"
                value={draft}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={onCount ? "Ask about your degree…" : "Add a transcript first, then ask…"}
                style={{ flex: 1, resize: "none", padding: "8px 10px", fontFamily: T.body, fontSize: 15, lineHeight: 1.4, color: T.text, background: T.surface, border: `1px solid ${T.divider}`, caretColor: T.accent, outline: "none" }}
              />
              <button className="dd-accent-btn" onClick={() => send()} style={{ ...bare, display: "flex", alignItems: "flex-end", justifyContent: "flex-start", gap: 6, padding: "8px 16px", minWidth: 96, background: T.accent, color: T.bg, fontFamily: T.head, fontWeight: 800, fontSize: 14 }}>
                Ask
                <ArrowUp style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Progress ──────────────────────────────────────────────────── */}
        <div style={{ borderLeft: `2px solid ${T.divider}`, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={eyebrow}>Progress</span>

          <div style={{ display: "grid", gridTemplateColumns: "136px minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
            <div style={{ position: "relative", width: 136, height: 136 }}>
              <svg width="136" height="136" viewBox="0 0 136 136" style={{ transform: "rotate(-90deg)", display: "block" }}>
                <circle cx="68" cy="68" r="58" fill="none" stroke="#d7d3d3" strokeWidth="14" />
                <circle cx="68" cy="68" r="58" fill="none" stroke="#ffc4b8" strokeWidth="14" style={{ strokeDasharray: `${iLen} ${C}`, strokeDashoffset: -eLen }} />
                <circle cx="68" cy="68" r="58" fill="none" stroke="#ec3013" strokeWidth="14" style={{ strokeDasharray: `${eLen} ${C}` }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ ...heading(32, 1), letterSpacing: "-0.02em" }}>{st.hasCourses ? `${st.pct}%` : "0%"}</span>
                <span style={{ fontSize: 11, color: T.n700, marginTop: 4 }}>of degree</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              {[
                ["#ec3013", "Earned", `${fmtCr(st.earned)} cr`],
                ["#ffc4b8", "In progress", `${fmtCr(st.ip)} cr`],
                ["#d7d3d3", "Remaining", `${fmtCr(Math.max(0, st.target - st.earned - st.ip))} cr`],
              ].map(([color, label, value]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "10px minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 10, height: 10, background: color }} />
                  <span>{label}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                </div>
              ))}
              <span style={{ fontSize: 12, color: T.n700, paddingTop: 4, borderTop: `1px solid ${T.divider}` }}>
                {st.req && st.req.total ? `${st.target} credits · from degree list` : `${st.target} credits · default`}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `2px solid ${T.divider}`, borderBottom: `1px solid ${T.divider}` }}>
            <div style={{ padding: "12px 12px 12px 0", borderRight: `1px solid ${T.divider}`, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.n700 }}>GPA</span>
              <span style={{ ...heading(26, 1.1), fontVariantNumeric: "tabular-nums" }}>{st.gpa == null ? "—" : st.gpa.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: T.n700 }}>{st.gpa == null ? "No graded classes yet" : `${fmtCr(st.gcr)} graded cr`}</span>
            </div>
            <div style={{ padding: "12px 0 12px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.n700 }}>Required left</span>
              <span style={{ ...heading(26, 1.1), fontVariantNumeric: "tabular-nums" }}>{st.req ? String(st.reqLeft) : "—"}</span>
              <span style={{ fontSize: 12, color: T.n700 }}>{st.req ? (st.reqIp ? `+${st.reqIp} in progress` : "classes") : "No degree list"}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={eyebrow}>Required classes</span>
              <span style={{ fontSize: 12, color: T.n700 }}>{st.req ? `${st.reqDone} of ${st.reqNeed} done` : ""}</span>
            </div>
            {!st.req && (
              <div style={{ fontSize: 13, lineHeight: 1.5, color: T.n700, borderTop: `1px solid ${T.divider}`, paddingTop: 10 }}>
                Add your degree requirements to Context and pick it as the degree list. Each class gets checked against your transcript.
              </div>
            )}
            {st.groups.map((g) => (
              <div key={g.name} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingBottom: 6, borderBottom: `2px solid ${T.divider}` }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                  <span style={{ fontSize: 12, color: T.n700 }}>{g.meta}</span>
                </div>
                {g.items.map((it) => (
                  <div key={it.code} style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) auto", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.divider}`, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{it.code}</span>
                    <span style={{ color: T.n800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                    {it.st === "done" && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", background: T.n200, color: T.n800 }}>
                        <Check style={{ width: 11, height: 11 }} />{it.grade}
                      </span>
                    )}
                    {it.st === "ip" && <span style={{ fontSize: 11, padding: "2px 8px", background: T.a100, color: T.a800 }}>In progress</span>}
                    {it.st === "missing" && <span style={{ fontSize: 11, padding: "1px 7px", border: `1px solid ${T.accent}`, color: T.a700 }}>Missing</span>}
                    {it.st === "skip" && <span style={{ fontSize: 11, padding: "2px 0", color: T.n600 }}>Not needed</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
