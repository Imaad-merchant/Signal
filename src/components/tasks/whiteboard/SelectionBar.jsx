import React, { useState, useRef, useEffect } from "react";
import { Trash2, ChevronDown, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { BOX_TYPES } from "./geometry";

// Small labeled numeric input used for X/Y/W/H/rotation.
function NumField({ label, value, onCommit, title }) {
  const [draft, setDraft] = useState(String(value));
  // Re-sync from props when not focused (e.g. after a drag-resize).
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label className="flex items-center gap-0.5" title={title}>
      <span className="text-[9px] text-gray-500">{label}</span>
      <input
        type="number"
        value={draft}
        onFocus={() => { focusedRef.current = true; }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { focusedRef.current = false; commit(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          else if (e.key === "Escape") { setDraft(String(value)); e.currentTarget.blur(); }
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-10 bg-white/[0.06] border border-white/[0.1] rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none focus:border-blue-400/60"
      />
    </label>
  );
}

// ─── Selection Action Bar ────────────────────────────────────────
export default function SelectionBar({ count, selected, locked, fill, opacity, fillOpacity, strokeOpacity, strokeStyle, cornerRadius, arrowHeads, singleType, singleBounds, singleRotation, onSetFill, onSetOpacity, onSetFillOpacity, onSetStrokeOpacity, onSetStrokeStyle, onSetCornerRadius, onSetArrowHeads, onSetGeometry, onAlign, onDistribute, onBringToFront, onSendToBack, onBringForward, onSendBackward, onGroup, onUngroup, onToggleLock, onDuplicate, onDelete, onExportPNG, onExportSVG }) {
  const [fillOpen, setFillOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const fillRef = useRef(null);
  const moreRef = useRef(null);
  const styleRef = useRef(null);

  const isRectLike = singleType === "rect" || singleType === "roundedRect";
  const isArrow = singleType === "arrow";
  const canRotate = !!singleType && BOX_TYPES.includes(singleType);

  useEffect(() => {
    const handler = (e) => {
      if (fillRef.current && !fillRef.current.contains(e.target)) setFillOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
      if (styleRef.current && !styleRef.current.contains(e.target)) setStyleOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const STROKE_DASH_PREVIEW = { solid: "", dashed: "6 4", dotted: "2 4" };

  const Btn = ({ onClick, title, children, active }) => (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${active ? "bg-blue-500/25 text-blue-200" : "text-gray-300 hover:bg-white/[0.07] hover:text-gray-100"}`}
    >
      {children}
    </button>
  );

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-[#252628]/98 backdrop-blur-md border border-white/[0.1] rounded-xl px-1.5 py-1.5 shadow-2xl max-w-[calc(100vw-1.5rem)] overflow-x-auto"
    >
      <span className="text-[10px] text-gray-500 px-2">{count} selected</span>
      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Fill */}
      <div className="relative" ref={fillRef}>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setFillOpen(o => !o); }}
          className="flex items-center gap-1 p-1.5 rounded-md hover:bg-white/[0.07] text-gray-300"
          title="Fill color"
        >
          <div className="h-4 w-4 rounded border border-white/20 relative overflow-hidden" style={{ backgroundColor: fill === "transparent" ? "transparent" : fill }}>
            {fill === "transparent" && <div className="absolute inset-0 bg-gradient-to-br from-transparent via-rose-500/50 to-transparent" />}
          </div>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {fillOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl p-2 z-50 min-w-[180px]">
            <button
              type="button"
              onClick={() => { onSetFill("transparent"); setFillOpen(false); }}
              className="block w-full px-2 py-1.5 text-xs text-left text-gray-300 hover:bg-white/[0.05] rounded mb-1"
            >
              ⊘ No fill
            </button>
            <div className="grid grid-cols-5 gap-1.5">
              {["#e5e7eb", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSetFill(c); setFillOpen(false); }}
                  className={`h-5 w-5 rounded-full hover:scale-110 transition-transform ${fill === c ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#2d2e30]" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 px-1">
              <span className="text-[10px] text-gray-500">Custom:</span>
              <input
                type="color"
                value={fill === "transparent" ? "#000000" : fill}
                onChange={(e) => onSetFill(e.target.value)}
                className="h-5 w-7 rounded cursor-pointer bg-transparent border border-white/[0.1]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Fill opacity slider */}
      <div className="flex items-center gap-1 px-1.5" title="Fill opacity">
        <span className="text-[9px] text-gray-500">Fill</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((fillOpacity ?? opacity ?? 1) * 100)}
          onChange={(e) => onSetFillOpacity(Number(e.target.value) / 100)}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-12 h-1 accent-blue-500"
        />
      </div>

      {/* Stroke opacity slider */}
      <div className="flex items-center gap-1 px-1.5" title="Stroke opacity">
        <span className="text-[9px] text-gray-500">Line</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((strokeOpacity ?? opacity ?? 1) * 100)}
          onChange={(e) => onSetStrokeOpacity(Number(e.target.value) / 100)}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-12 h-1 accent-blue-500"
        />
      </div>

      {/* Stroke style (solid / dashed / dotted) */}
      <div className="relative" ref={styleRef}>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setStyleOpen(o => !o); }}
          className="flex items-center gap-1 p-1.5 rounded-md hover:bg-white/[0.07] text-gray-300"
          title="Stroke style"
        >
          <svg width="18" height="8" className="overflow-visible">
            <line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={STROKE_DASH_PREVIEW[strokeStyle] || ""} strokeLinecap="round" />
          </svg>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {styleOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[120px] z-50">
            {["solid", "dashed", "dotted"].map(s => (
              <button
                key={s}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetStrokeStyle(s); setStyleOpen(false); }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-white/[0.05] ${strokeStyle === s ? "text-blue-300" : "text-gray-200"}`}
              >
                <svg width="28" height="8" className="overflow-visible">
                  <line x1="1" y1="4" x2="27" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={STROKE_DASH_PREVIEW[s] || ""} strokeLinecap="round" />
                </svg>
                <span className="capitalize">{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Corner radius (rect / roundedRect only) */}
      {isRectLike && (() => {
        const minDim = Math.min(singleBounds?.w ?? 0, singleBounds?.h ?? 0);
        const value = Math.round(cornerRadius ?? (singleType === "roundedRect" ? minDim / 4 : 4));
        // Cap at half the shorter side (matches the render clamp), but never below
        // the current value so a previously-large radius isn't visually clamped.
        const sliderMax = Math.max(Math.round(minDim / 2), value, 1);
        return (
          <div className="flex items-center gap-1 px-1.5" title="Corner radius">
            <span className="text-[9px] text-gray-500">⌜</span>
            <input
              type="range"
              min={0}
              max={sliderMax}
              value={value}
              onChange={(e) => onSetCornerRadius(Number(e.target.value))}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-12 h-1 accent-blue-500"
            />
          </div>
        );
      })()}

      {/* Arrowheads (arrow only) */}
      {isArrow && (
        <select
          value={arrowHeads ?? "end"}
          onChange={(e) => onSetArrowHeads(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className="bg-white/[0.06] border border-white/[0.1] rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none focus:border-blue-400/60"
          title="Arrowheads"
        >
          <option value="end">End →</option>
          <option value="start">← Start</option>
          <option value="both">↔ Both</option>
          <option value="none">— None</option>
        </select>
      )}

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Numeric geometry (single selection) */}
      {singleBounds && onSetGeometry && (
        <>
          <div className="flex items-center gap-1">
            <NumField label="X" value={Math.round(singleBounds.x)} onCommit={(v) => onSetGeometry("x", v)} title="X position" />
            <NumField label="Y" value={Math.round(singleBounds.y)} onCommit={(v) => onSetGeometry("y", v)} title="Y position" />
            <NumField label="W" value={Math.round(singleBounds.w)} onCommit={(v) => onSetGeometry("w", v)} title="Width" />
            <NumField label="H" value={Math.round(singleBounds.h)} onCommit={(v) => onSetGeometry("h", v)} title="Height" />
            {canRotate && (
              <NumField label="∠" value={Math.round(singleRotation || 0)} onCommit={(v) => onSetGeometry("rotation", v)} title="Rotation (deg)" />
            )}
          </div>
          <div className="w-px h-5 bg-white/[0.08] mx-1" />
        </>
      )}

      {/* Alignment */}
      {count >= 2 && (
        <>
          <Btn onClick={() => onAlign("left")} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></Btn>
          <Btn onClick={() => onAlign("center")} title="Align center horizontal"><AlignCenter className="h-3.5 w-3.5" /></Btn>
          <Btn onClick={() => onAlign("right")} title="Align right"><AlignRight className="h-3.5 w-3.5" /></Btn>
        </>
      )}
      {count >= 3 && (
        <>
          <Btn onClick={() => onDistribute("h")} title="Distribute horizontally"><span className="text-[10px] font-bold">⇿</span></Btn>
          <Btn onClick={() => onDistribute("v")} title="Distribute vertically"><span className="text-[10px] font-bold">⇕</span></Btn>
        </>
      )}

      {count >= 2 && <div className="w-px h-5 bg-white/[0.08] mx-1" />}

      {/* Layering */}
      <Btn onClick={onBringToFront} title="Bring to front"><span className="text-[9px] font-bold">F</span></Btn>
      <Btn onClick={onSendToBack} title="Send to back"><span className="text-[9px] font-bold">B</span></Btn>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Lock / Duplicate / Delete */}
      <Btn onClick={onToggleLock} title={locked ? "Unlock" : "Lock"} active={locked}>
        <span className="text-[10px]">{locked ? "🔒" : "🔓"}</span>
      </Btn>
      <Btn onClick={onDuplicate} title="Duplicate (⌘D)"><span className="text-[10px] font-bold">⎘</span></Btn>
      <Btn onClick={onDelete} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Btn>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* More */}
      <div className="relative" ref={moreRef}>
        <Btn onClick={() => setMoreOpen(o => !o)} title="More">
          <span className="text-[10px] font-bold">⋯</span>
        </Btn>
        {moreOpen && (
          <div className="absolute top-full right-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[160px] z-50">
            <button onClick={() => { onBringForward(); setMoreOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]">Bring forward</button>
            <button onClick={() => { onSendBackward(); setMoreOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]">Send backward</button>
            <div className="border-t border-white/[0.06] my-1" />
            <button onClick={() => { onGroup(); setMoreOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]">Group (⌘G)</button>
            <button onClick={() => { onUngroup(); setMoreOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]">Ungroup (⌘⇧G)</button>
            <div className="border-t border-white/[0.06] my-1" />
            <button onClick={() => { onExportPNG(); setMoreOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]">Export as PNG</button>
            <button onClick={() => { onExportSVG(); setMoreOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]">Export as SVG</button>
          </div>
        )}
      </div>
    </div>
  );
}
