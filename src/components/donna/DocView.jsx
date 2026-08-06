// A document, open on Donna's screen. Type straight into it.
//
// Read-only sources (memories) render the same way minus the editing — you can
// still read them and still ask the corner assistant about them.
import { useEffect, useRef, useState } from "react";
import { X, Check, Loader2, Lock } from "lucide-react";

export default function DocView({ doc, onClose, onSaved, registerApply }) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const dirty = title !== doc.title || content !== doc.content;
  const areaRef = useRef(null);

  // Switching documents in the sidebar reuses this component — reset to the new one.
  useEffect(() => {
    setTitle(doc.title);
    setContent(doc.content);
    setStatus("");
  }, [doc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!doc.editable || !dirty || saving) return;
    setSaving(true);
    setStatus("Saving…");
    try {
      await onSaved({ title, content });
      setStatus("Saved");
      setTimeout(() => setStatus(""), 1800);
    } catch {
      setStatus("Couldn't save — try again.");
    }
    setSaving(false);
  };

  // Let the corner assistant rewrite the open document. It edits the live buffer
  // rather than the stored doc, so you always get to look before it sticks.
  useEffect(() => {
    if (!registerApply) return undefined;
    registerApply({
      getContent: () => content,
      getTitle: () => title,
      apply: (next) => {
        if (typeof next === "string") {
          setContent(next);
          setStatus("Assistant edited this — review, then Save.");
        }
      },
    });
    return () => registerApply(null);
  }, [content, title, registerApply]);

  // Cmd/Ctrl+S saves, matching every other editor.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bound each render so `save` closes over current state

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        {doc.editable ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-gray-100 outline-none placeholder:text-gray-600"
            placeholder="Untitled"
          />
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-semibold text-gray-100">
            <Lock className="h-3.5 w-3.5 shrink-0 text-gray-500" /> {title}
          </span>
        )}

        <span className="shrink-0 text-[11px] text-gray-500">{status}</span>

        {doc.editable && (
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
          title="Close document"
          aria-label="Close document"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {doc.editable ? (
        <textarea
          ref={areaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          placeholder="Empty — start writing."
          className="min-h-0 flex-1 resize-none bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed text-gray-200 outline-none placeholder:text-gray-600"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-6 py-5 font-mono text-[13px] leading-relaxed text-gray-300">
          {content || <span className="italic text-gray-600">Empty.</span>}
        </div>
      )}
    </div>
  );
}
