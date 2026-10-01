import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { STROKE_WIDTHS } from "./geometry";
import ColorPicker from "../color/ColorPicker";
import FontSizeStepper from "./FontSizeStepper";

// Row-2 contextual bar shown when a draw tool is active with no selection.
// Lets the user set the default color / stroke (and text size for the text tool)
// that newly-drawn objects will inherit. Mirrors Google Docs' contextual row.
export default function DrawDefaultsBar({ tool, color, setColor, strokeWidth, setStrokeWidth, fontSize, setFontSize, isMobile = false }) {
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef(null);
  useEffect(() => {
    if (!colorOpen) return;
    const h = (e) => { if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [colorOpen]);

  const isText = tool === "text";

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center justify-center gap-1 bg-[#252628] border border-white/[0.1] rounded-xl px-2 py-1 shadow-2xl max-w-[calc(100vw-1.5rem)]"
    >
      {/* Color picker */}
      <div className="relative" ref={colorRef}>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setColorOpen(o => !o); }}
          className={`flex items-center gap-1 rounded-md hover:bg-white/[0.07] text-gray-400 ${isMobile ? "p-2" : "p-1.5"}`}
          title="Color"
        >
          <div className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: color }} />
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {colorOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-xl shadow-2xl p-2 z-50 max-w-[90vw]">
            <ColorPicker kind="draw" value={color} onPick={(c) => setColor(c)} onClose={() => setColorOpen(false)} />
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {isText ? (
        /* Default text size for new text boxes */
        <FontSizeStepper value={fontSize} onPick={setFontSize} isMobile={isMobile} />
      ) : (
        /* Stroke width */
        <div className="flex items-center gap-0.5">
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setStrokeWidth(w); }}
              className={`rounded transition-colors ${isMobile ? "p-2" : "p-1.5"} ${strokeWidth === w ? "bg-blue-500/25 ring-1 ring-blue-400/40" : "hover:bg-white/[0.07]"}`}
              title={`Stroke ${w}px`}
            >
              <div
                className="rounded-full"
                style={{ height: `${Math.min(w + 1, 10)}px`, width: `${Math.min(w + 1, 10) * 2}px`, backgroundColor: color, opacity: strokeWidth === w ? 1 : 0.5 }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
