import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { FONT_SIZES } from "./geometry";

// Shared font-size stepper: [−] [editable number] [+] [▾]
// `value` is the current size; `onPick(size)` commits a new size (selection-aware
// in TextRibbon, object-default in DrawDefaultsBar). `isMobile` bumps hit-areas.
export default function FontSizeStepper({ value, onPick, isMobile = false }) {
  const clamp = (n) => Math.max(1, Math.min(400, Math.round(n)));
  const incoming = clamp(value || 18);
  // Local working value. Stepping accumulates here so repeated +/- always build
  // on the last shown number, even when the selection-aware onPick applies the
  // size via execCommand without changing the object-level `value` prop.
  const [size, setSize] = useState(incoming);
  const [draft, setDraft] = useState(String(incoming));
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Re-sync only when the incoming prop genuinely changes (e.g. selecting a
  // different text box) — not on our own onPick round-trips.
  const prevIncoming = useRef(incoming);
  useEffect(() => {
    if (incoming !== prevIncoming.current) {
      prevIncoming.current = incoming;
      setSize(incoming);
      setDraft(String(incoming));
    }
  }, [incoming]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const apply = (n) => {
    const v = clamp(n);
    setSize(v);
    setDraft(String(v));
    onPick(v);
  };
  const step = (delta) => apply(size + delta);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) apply(n);
    else setDraft(String(size));
  };

  const btnPad = isMobile ? "p-2" : "p-1";
  const numW = isMobile ? "w-10" : "w-8";

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); step(-1); }}
        className={`${btnPad} rounded-md text-gray-300 hover:bg-white/[0.07] hover:text-gray-100`}
        title="Decrease size"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); }
        }}
        className={`${numW} text-center bg-transparent text-[11px] text-gray-200 rounded border border-white/[0.08] focus:border-blue-400/50 focus:outline-none py-0.5`}
      />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); step(1); }}
        className={`${btnPad} rounded-md text-gray-300 hover:bg-white/[0.07] hover:text-gray-100`}
        title="Increase size"
      >
        <Plus className="h-3 w-3" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={`${btnPad} rounded-md text-gray-400 hover:bg-white/[0.07] hover:text-gray-100`}
        title="Size presets"
      >
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[60px] z-50 max-h-[60vh] overflow-y-auto">
          {FONT_SIZES.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); apply(s); setOpen(false); }}
              className={`block w-full text-center px-2 py-1 text-xs hover:bg-white/[0.05] ${size === s ? "text-blue-300" : "text-gray-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
