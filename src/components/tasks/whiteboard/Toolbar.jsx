import React, { useState, useRef, useEffect } from "react";
import { MousePointer2, Hand, Pencil, Type, Square, Circle, ArrowRight, Eraser, Trash2, Undo2, Redo2, Minus, Grid3x3, ChevronDown, Sparkles, SlidersHorizontal } from "lucide-react";

// More shapes dropdown
function MoreShapesDropdown({ moreShapes, tool, setTool, isMobile }) {
  const [open, setOpen] = useState(null); // null | { left, top } of the fixed menu
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);
  const active = moreShapes.some(s => s.key === tool);
  // The menu is position:fixed at the button so the (horizontally scrolling)
  // toolbar row can't clip it.
  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setOpen(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setOpen({ left: Math.min(r.left, window.innerWidth - 150), top: r.bottom + 4 });
  };
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
        className={`shrink-0 rounded-md transition-all ${isMobile ? "p-2" : "p-1.5"} ${active ? "bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40" : "text-gray-400 hover:bg-white/[0.07] hover:text-gray-100"}`}
        title="More shapes"
      >
        <span className="text-[10px] font-bold">◇</span>
      </button>
      {open && (
        <div className="fixed bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[140px] max-w-[90vw] z-50" style={{ left: open.left, top: open.top }}>
          {moreShapes.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); setTool(s.key); setOpen(null); }}
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

// Zoom level dropdown (shows current %, lets you jump to presets or Fit)
function ZoomDropdown({ zoomPercent, onSetZoom, onZoomFit, isMobile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const presets = [50, 75, 100, 125, 150, 200];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={`flex items-center gap-1 rounded-md text-[11px] text-gray-300 hover:bg-white/[0.07] ${isMobile ? "px-2.5 py-2" : "px-2 py-1"} min-w-[52px]`}
        title="Zoom"
      >
        <span className="flex-1 text-center tabular-nums">{zoomPercent}%</span>
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[80px] max-w-[90vw] z-50 max-h-[60vh] overflow-y-auto">
          {presets.map(p => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSetZoom(p / 100); setOpen(false); }}
              className={`block w-full text-center px-2 py-1 text-xs hover:bg-white/[0.05] ${zoomPercent === p ? "text-blue-300" : "text-gray-300"}`}
            >
              {p}%
            </button>
          ))}
          <div className="h-px w-full bg-white/[0.08] my-1" />
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onZoomFit(); setOpen(false); }}
            className="block w-full text-center px-2 py-1 text-xs text-gray-300 hover:bg-white/[0.05]"
          >
            Fit
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Toolbar (Google Docs–inspired, horizontal Row 1) ──────────────
const TOOL_ICONS = {
  select: MousePointer2, hand: Hand, pen: Pencil, text: Type, rect: Square, ellipse: Circle,
  arrow: ArrowRight, line: Minus, eraser: Eraser,
};
// The active tool's icon, for the collapsed dock pill (extra shapes fall back to ◇).
export function ActiveToolIcon({ tool }) {
  const Icon = TOOL_ICONS[tool];
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40" title={`Tool: ${tool}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">◇</span>}
    </span>
  );
}

// Rendered inside FloatingDock, which supplies the panel chrome. On phones it's
// one horizontally scrolling row; the zoom dropdown is dropped there (the
// floating zoom control covers it) and contextual formatting sits behind the
// Format toggle instead of always taking up the screen.
export default function Toolbar({ tool, setTool, onClear, onUndo, onRedo, canUndo, canRedo, showGrid, setShowGrid, onAIOpen, zoomPercent, onSetZoom, onZoomFit, isMobile = false, formatAvailable = false, formatOpen = false, onToggleFormat = null }) {
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

  const btnPad = isMobile ? "p-2" : "p-1.5";

  const ToolBtn = ({ t }) => {
    const Icon = t.icon;
    const selected = tool === t.key;
    return (
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setTool(t.key); }}
        className={`${btnPad} shrink-0 rounded-md transition-all ${selected ? "bg-blue-500/25 text-blue-200 shadow-sm ring-1 ring-blue-400/40" : "text-gray-400 hover:bg-white/[0.07] hover:text-gray-100"}`}
        title={t.label}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  };

  const Divider = () => <div className="w-px h-5 shrink-0 bg-white/[0.08] mx-1" />;

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={isMobile
        ? "flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto overscroll-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        : "flex flex-wrap items-center justify-center gap-0.5 px-1 py-1"}
    >
      {/* Undo / Redo */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onUndo(); }}
        disabled={!canUndo}
        className={`${btnPad} shrink-0 rounded-md text-gray-400 hover:bg-white/[0.07] hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
        title="Undo (⌘Z)"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRedo(); }}
        disabled={!canRedo}
        className={`${btnPad} shrink-0 rounded-md text-gray-400 hover:bg-white/[0.07] hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
        title="Redo (⌘⇧Z)"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>

      <Divider />

      {!isMobile && (
        <>
          {/* Zoom */}
          <ZoomDropdown zoomPercent={zoomPercent} onSetZoom={onSetZoom} onZoomFit={onZoomFit} isMobile={isMobile} />
          <Divider />
        </>
      )}

      {/* Select + Hand */}
      {tools.map(t => <ToolBtn key={t.key} t={t} />)}

      <Divider />

      {/* Drawing tools */}
      {drawTools.map(t => <ToolBtn key={t.key} t={t} />)}
      <MoreShapesDropdown moreShapes={moreShapes} tool={tool} setTool={setTool} isMobile={isMobile} />

      {formatAvailable && onToggleFormat && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleFormat(); }}
          className={`${btnPad} shrink-0 rounded-md transition-colors ${formatOpen ? "bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40" : "text-gray-300 hover:bg-white/[0.07]"}`}
          title={formatOpen ? "Hide formatting" : "Formatting"}
          aria-label={formatOpen ? "Hide formatting" : "Show formatting"}
          aria-pressed={formatOpen}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      )}

      <Divider />

      {/* Grid toggle */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setShowGrid(g => !g); }}
        className={`${btnPad} shrink-0 rounded-md transition-colors ${showGrid ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:bg-white/[0.07] hover:text-gray-300"}`}
        title={showGrid ? "Hide grid" : "Show grid"}
      >
        <Grid3x3 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        className={`${btnPad} shrink-0 rounded-md text-gray-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors`}
        title="Clear board"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <Divider />

      {/* AI button */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onAIOpen(); }}
        className="flex shrink-0 items-center gap-1 px-2 py-1 rounded-md bg-gradient-to-r from-purple-500/15 to-pink-500/15 border border-purple-500/25 text-purple-300 text-[11px] font-medium hover:from-purple-500/25 hover:to-pink-500/25 transition-all"
        title="Ask AI to draw or reorganize"
      >
        <Sparkles className="h-3 w-3" />
        AI
      </button>
    </div>
  );
}
