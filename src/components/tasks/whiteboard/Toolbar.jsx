import React, { useState, useRef, useEffect } from "react";
import { MousePointer2, Hand, Pencil, Type, Square, Circle, ArrowRight, Eraser, Trash2, Undo2, Redo2, Minus, Grid3x3, ChevronDown, Sparkles } from "lucide-react";
import { COLORS, STROKE_WIDTHS } from "./geometry";

// More shapes dropdown
function MoreShapesDropdown({ moreShapes, tool, setTool }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const active = moreShapes.some(s => s.key === tool);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={`p-1.5 rounded-md transition-all ${active ? "bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40" : "text-gray-400 hover:bg-white/[0.07] hover:text-gray-100"}`}
        title="More shapes"
      >
        <span className="text-[10px] font-bold">◇</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[140px] z-50">
          {moreShapes.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); setTool(s.key); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] ${tool === s.key ? "text-blue-300" : "text-gray-300"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toolbar (Google Docs–inspired) ────────────────────────────────
export default function Toolbar({ tool, setTool, color, setColor, strokeWidth, setStrokeWidth, onClear, onUndo, onRedo, canUndo, canRedo, fontSize, setFontSize, showGrid, setShowGrid, onAIOpen }) {
  const tools = [
    { key: "select", icon: MousePointer2, label: "Select (V)" },
    { key: "hand", icon: Hand, label: "Pan (H)" },
  ];
  const drawTools = [
    { key: "pen", icon: Pencil, label: "Pen (P)" },
    { key: "text", icon: Type, label: "Text (T)" },
    { key: "rect", icon: Square, label: "Rectangle (R)" },
    { key: "ellipse", icon: Circle, label: "Ellipse (O)" },
    { key: "arrow", icon: ArrowRight, label: "Arrow (A)" },
    { key: "line", icon: Minus, label: "Line (L)" },
    { key: "eraser", icon: Eraser, label: "Eraser (E)" },
  ];
  const moreShapes = [
    { key: "triangle", label: "Triangle" },
    { key: "diamond", label: "Diamond" },
    { key: "roundedRect", label: "Rounded rect" },
    { key: "star", label: "Star" },
  ];

  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef(null);
  useEffect(() => {
    if (!colorOpen) return;
    const h = (e) => { if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [colorOpen]);

  const ToolBtn = ({ t }) => {
    const Icon = t.icon;
    const selected = tool === t.key;
    return (
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setTool(t.key); }}
        className={`p-1.5 rounded-md transition-all ${selected ? "bg-blue-500/25 text-blue-200 shadow-sm ring-1 ring-blue-400/40" : "text-gray-400 hover:bg-white/[0.07] hover:text-gray-100"}`}
        title={t.label}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-[#252628]/98 backdrop-blur-md border border-white/[0.1] rounded-xl px-1.5 py-1.5 shadow-2xl max-w-[calc(100vw-1.5rem)] overflow-x-auto"
    >
      {/* Undo / Redo */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onUndo(); }}
        disabled={!canUndo}
        className="p-1.5 rounded-md text-gray-400 hover:bg-white/[0.07] hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Undo (⌘Z)"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRedo(); }}
        disabled={!canRedo}
        className="p-1.5 rounded-md text-gray-400 hover:bg-white/[0.07] hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Redo (⌘⇧Z)"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

      {/* Select + Hand */}
      {tools.map(t => <ToolBtn key={t.key} t={t} />)}

      <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

      {/* Drawing tools */}
      {drawTools.map(t => <ToolBtn key={t.key} t={t} />)}

      {/* More shapes dropdown */}
      <MoreShapesDropdown moreShapes={moreShapes} tool={tool} setTool={setTool} />

      <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

      {/* Color picker */}
      <div className="relative" ref={colorRef}>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setColorOpen(o => !o); }}
          className="flex items-center gap-1 p-1.5 rounded-md hover:bg-white/[0.07] text-gray-400 transition-colors"
          title="Color"
        >
          <div className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: color }} />
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {colorOpen && (
          <div className="absolute top-full left-0 mt-2 bg-[#2d2e30] border border-white/[0.12] rounded-xl shadow-2xl p-2 z-50">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setColor(c); setColorOpen(false); }}
                  className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#2d2e30]" : ""}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 px-1">
              <span className="text-[10px] text-gray-500">Custom:</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-5 w-7 rounded cursor-pointer bg-transparent border border-white/[0.1]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Stroke width or font size */}
      {tool === "text" ? (
        <div className="flex items-center gap-0.5 px-1.5">
          {[14, 18, 24, 36, 48].map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setFontSize(s); }}
              className={`min-w-[22px] px-1.5 py-0.5 rounded text-[10.5px] font-medium transition-colors ${fontSize === s ? "bg-blue-500/25 text-blue-200" : "text-gray-500 hover:bg-white/[0.07] hover:text-gray-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-0.5 px-1.5">
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setStrokeWidth(w); }}
              className={`p-1 rounded transition-colors ${strokeWidth === w ? "bg-blue-500/25 ring-1 ring-blue-400/40" : "hover:bg-white/[0.07]"}`}
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

      <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

      {/* Grid toggle */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setShowGrid(g => !g); }}
        className={`p-1.5 rounded-md transition-colors ${showGrid ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:bg-white/[0.07] hover:text-gray-300"}`}
        title={showGrid ? "Hide grid" : "Show grid"}
      >
        <Grid3x3 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        className="p-1.5 rounded-md text-gray-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
        title="Clear board"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

      {/* AI button */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onAIOpen(); }}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-gradient-to-r from-purple-500/15 to-pink-500/15 border border-purple-500/25 text-purple-300 text-[11px] font-medium hover:from-purple-500/25 hover:to-pink-500/25 transition-all"
        title="Ask AI to draw or reorganize"
      >
        <Sparkles className="h-3 w-3" />
        AI
      </button>
    </div>
  );
}
