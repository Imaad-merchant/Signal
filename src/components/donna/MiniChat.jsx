// The corner assistant. While a document is open the big chat bar would fight
// the editor for the screen, so it collapses to this: a small circle bottom-right
// that opens a compact chat sized to stay out of the way.
//
// It knows what document you're looking at, so "tighten this up" or "add a
// section for Friday" operate on the open file. Edits land in the editor buffer
// for you to review — never written straight to storage.
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function MiniChat({ docTitle, getDoc, onApply }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]);
  const endRef = useRef(null);

  useEffect(() => {
    if (open && endRef.current) endRef.current.scrollIntoView({ block: "end" });
  }, [turns, open]);

  const send = async (e) => {
    e && e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setTurns((t) => [...t, { who: "you", text }]);
    setBusy(true);
    try {
      const { title, content } = getDoc();
      const res = await base44.functions.invoke("donna", {
        route: "docedit",
        instruction: text,
        title,
        content,
      });
      const data = (res && res.data) ? res.data : res || {};
      if (typeof data.content === "string" && data.content !== content) {
        onApply(data.content);
      }
      setTurns((t) => [...t, { who: "ai", text: data.reply || "Done — review the document." }]);
    } catch {
      setTurns((t) => [...t, { who: "ai", text: "That didn't go through — try again." }]);
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-[#0e1015]/90 text-cyan-300 shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)] backdrop-blur-sm transition-transform hover:scale-105"
        title="Ask for help with this document"
        aria-label="Open assistant"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="absolute bottom-5 right-5 z-50 flex h-[22rem] w-[20rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e1015]/95 shadow-2xl backdrop-blur-md">
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-400">
          {docTitle ? `Editing “${docTitle}”` : "Assistant"}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-md p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
          aria-label="Close assistant"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {turns.length === 0 && (
          <p className="text-[11px] leading-relaxed text-gray-500">
            Ask me to rewrite, summarise, restructure or add to this document — or
            just ask what's in it.
          </p>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={`max-w-[88%] rounded-xl px-2.5 py-1.5 text-[12px] leading-snug ${
              t.who === "you"
                ? "ml-auto bg-cyan-500/15 text-cyan-100"
                : "bg-white/[0.05] text-gray-200"
            }`}
          >
            {t.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Working…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-1.5 border-t border-white/[0.06] p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask, or tell me to edit…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-gray-200 outline-none placeholder:text-gray-600 focus:border-cyan-400/40"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-lg bg-cyan-500/20 p-1.5 text-cyan-200 transition-colors hover:bg-cyan-500/30 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
