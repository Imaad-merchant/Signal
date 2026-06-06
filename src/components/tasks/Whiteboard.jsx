import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MousePointer2, Hand, Pencil, Type, Square, Circle, ArrowRight, Eraser, Trash2, ZoomIn, ZoomOut, Maximize2, Undo2, Redo2, Minus, Grid3x3, Eye, EyeOff, Palette as PaletteIcon, ChevronDown, Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, ListOrdered } from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────
const COLORS = ["#e5e7eb", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
const STROKE_WIDTHS = [1.5, 3, 5, 8];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

// Generate a stable id
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
function Toolbar({ tool, setTool, color, setColor, strokeWidth, setStrokeWidth, onClear, onUndo, onRedo, canUndo, canRedo, fontSize, setFontSize, showGrid, setShowGrid }) {
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
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-[#252628]/98 backdrop-blur-md border border-white/[0.1] rounded-xl px-1.5 py-1.5 shadow-2xl"
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
    </div>
  );
}

// ─── Selection Action Bar ────────────────────────────────────────
function SelectionBar({ count, selected, locked, fill, opacity, onSetFill, onSetOpacity, onAlign, onDistribute, onBringToFront, onSendToBack, onBringForward, onSendBackward, onGroup, onUngroup, onToggleLock, onDuplicate, onDelete, onExportPNG, onExportSVG }) {
  const [fillOpen, setFillOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const fillRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (fillRef.current && !fillRef.current.contains(e.target)) setFillOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      className="absolute top-[60px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-[#252628]/98 backdrop-blur-md border border-white/[0.1] rounded-xl px-1.5 py-1.5 shadow-2xl"
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

      {/* Opacity slider */}
      <div className="flex items-center gap-1 px-2">
        <span className="text-[10px] text-gray-500">α</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((opacity ?? 1) * 100)}
          onChange={(e) => onSetOpacity(Number(e.target.value) / 100)}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-16 h-1 accent-blue-500"
        />
        <span className="text-[10px] text-gray-500 w-7 text-right">{Math.round((opacity ?? 1) * 100)}%</span>
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

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

// ─── Whiteboard Context Menu ──────────────────────────────────────
function WhiteboardContextMenu({ menu, onClose, onAction }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const [subOpen, setSubOpen] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let x = menu.x, y = menu.y;
    if (x + rect.width + 8 > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height + 8 > window.innerHeight) y = window.innerHeight - rect.height - 8;
    setPos({ x, y });
  }, [menu]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const target = menu.target;

  const MenuItem = ({ icon: Icon, label, shortcut, onClick, danger }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); onClose(); }}
      className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs transition-colors ${danger ? "text-rose-400 hover:bg-rose-500/15" : "text-gray-200 hover:bg-white/[0.06]"}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-gray-600">{shortcut}</span>}
    </button>
  );

  const SubMenuTrigger = ({ icon: Icon, label, subKey, children }) => (
    <div className="relative" onMouseEnter={() => setSubOpen(subKey)} onMouseLeave={() => setSubOpen(null)}>
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs text-gray-200 hover:bg-white/[0.06]"
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span className="flex-1 text-left">{label}</span>
        <span className="text-gray-600">›</span>
      </button>
      {subOpen === subKey && (
        <div className="absolute left-full top-0 ml-1 bg-[#2d2e30] border border-white/[0.1] rounded-lg shadow-2xl py-1 min-w-[160px]">
          {children}
        </div>
      )}
    </div>
  );

  const Sep = () => <div className="border-t border-white/[0.06] my-1" />;

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 10000 }}
      className="w-52 bg-[#2a2b2d] border border-white/[0.1] rounded-xl shadow-2xl py-1"
    >
      {target ? (
        <>
          {target.type === "text" && <MenuItem label="Edit text" onClick={() => onAction("editText", target)} />}
          <MenuItem label="Cut" shortcut="⌘X" onClick={() => onAction("cut")} />
          <MenuItem label="Copy" shortcut="⌘C" onClick={() => onAction("copy")} />
          <MenuItem label="Paste" shortcut="⌘V" onClick={() => onAction("paste")} />
          <MenuItem label="Duplicate" shortcut="⌘D" onClick={() => onAction("duplicate")} />
          <MenuItem label="Delete" shortcut="Del" onClick={() => onAction("delete")} danger />
          <Sep />
          <MenuItem label="Bring to front" onClick={() => onAction("bringToFront")} />
          <MenuItem label="Bring forward" onClick={() => onAction("bringForward")} />
          <MenuItem label="Send backward" onClick={() => onAction("sendBackward")} />
          <MenuItem label="Send to back" onClick={() => onAction("sendToBack")} />
          <Sep />
          <MenuItem label={target.locked ? "Unlock" : "Lock"} onClick={() => onAction("toggleLock")} />
          <MenuItem label="Group" shortcut="⌘G" onClick={() => onAction("group")} />
          <MenuItem label="Ungroup" shortcut="⌘⇧G" onClick={() => onAction("ungroup")} />
          <Sep />
          <SubMenuTrigger label="Color" subKey="color">
            <div className="grid grid-cols-5 gap-1 p-2">
              {["#e5e7eb", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAction("setColor", c); onClose(); }}
                  className="h-5 w-5 rounded-full hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </SubMenuTrigger>
          <SubMenuTrigger label="Stroke width" subKey="stroke">
            <div className="py-1">
              {[1.5, 3, 5, 8].map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAction("setStrokeWidth", w); onClose(); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.06]"
                >
                  <div className="rounded-full bg-gray-300" style={{ height: w, width: 24 }} />
                  <span>{w}px</span>
                </button>
              ))}
            </div>
          </SubMenuTrigger>
        </>
      ) : (
        <>
          <MenuItem label="Paste" shortcut="⌘V" onClick={() => onAction("pasteAt")} />
          <MenuItem label="Select all" shortcut="⌘A" onClick={() => onAction("selectAll")} />
          <Sep />
          <MenuItem label="Toggle grid" onClick={() => onAction("toggleGrid")} />
          <MenuItem label="Reset zoom" onClick={() => onAction("resetZoom")} />
          <MenuItem label="Zoom to fit" onClick={() => onAction("zoomToFit")} />
          <Sep />
          <SubMenuTrigger label="Add" subKey="add">
            <MenuItem label="Sticky note" onClick={() => onAction("addAt", "sticky")} />
            <MenuItem label="Text" onClick={() => onAction("addAt", "text")} />
            <MenuItem label="Rectangle" onClick={() => onAction("addAt", "rect")} />
            <MenuItem label="Ellipse" onClick={() => onAction("addAt", "ellipse")} />
            <MenuItem label="Triangle" onClick={() => onAction("addAt", "triangle")} />
            <MenuItem label="Diamond" onClick={() => onAction("addAt", "diamond")} />
            <MenuItem label="Star" onClick={() => onAction("addAt", "star")} />
          </SubMenuTrigger>
        </>
      )}
    </div>
  );
}

// ─── Text Ribbon (Google Docs-style formatting) ───────────────────
const FONT_FAMILIES = [
  { name: "Inter", css: "Inter, system-ui, sans-serif" },
  { name: "Arial", css: "Arial, sans-serif" },
  { name: "Helvetica", css: "Helvetica, sans-serif" },
  { name: "Georgia", css: "Georgia, serif" },
  { name: "Times", css: '"Times New Roman", Times, serif' },
  { name: "Courier", css: '"Courier New", Courier, monospace' },
  { name: "Comic Sans", css: '"Comic Sans MS", cursive' },
  { name: "Impact", css: "Impact, sans-serif" },
  { name: "Verdana", css: "Verdana, sans-serif" },
  { name: "Trebuchet", css: '"Trebuchet MS", sans-serif' },
];

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];

function execCmd(cmd, value) {
  try {
    document.execCommand(cmd, false, value);
  } catch {}
}

function TextRibbon({ textObject, onUpdate, editingTextRef, isEditing }) {
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const fontRef = useRef(null);
  const sizeRef = useRef(null);
  const colorRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (fontRef.current && !fontRef.current.contains(e.target)) setFontOpen(false);
      if (sizeRef.current && !sizeRef.current.contains(e.target)) setSizeOpen(false);
      if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const applyExec = (cmd, value) => {
    if (isEditing && editingTextRef?.current) {
      editingTextRef.current.focus();
      execCmd(cmd, value);
    }
  };

  // Apply object-level prop (when not editing or font-level)
  const setProp = (patch) => {
    onUpdate(patch);
  };

  const currentFont = FONT_FAMILIES.find(f => f.css === textObject.fontFamily) || FONT_FAMILIES[0];
  const currentSize = textObject.fontSize || 18;

  const handleFontPick = (font) => {
    setProp({ fontFamily: font.css });
    setFontOpen(false);
    if (isEditing) {
      editingTextRef?.current?.focus();
      execCmd("fontName", font.name);
    }
  };

  const handleSizePick = (size) => {
    setProp({ fontSize: size });
    setSizeOpen(false);
    if (isEditing && editingTextRef?.current) {
      editingTextRef.current.focus();
      // Wrap selection in span with style
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        execCmd("styleWithCSS", true);
        execCmd("fontSize", "7");
        // Replace generated font tags with span style
        const root = editingTextRef.current;
        root.querySelectorAll('font[size="7"]').forEach(f => {
          const span = document.createElement("span");
          span.style.fontSize = `${size}px`;
          span.innerHTML = f.innerHTML;
          f.replaceWith(span);
        });
      }
    }
  };

  const handleColorPick = (c) => {
    setProp({ color: c });
    setColorOpen(false);
    if (isEditing && editingTextRef?.current) {
      editingTextRef.current.focus();
      execCmd("styleWithCSS", true);
      execCmd("foreColor", c);
    }
  };

  const RbBtn = ({ onClick, active, title, children }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
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
      className="absolute top-[60px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-[#252628]/98 backdrop-blur-md border border-white/[0.1] rounded-xl px-1.5 py-1 shadow-2xl"
    >
      {/* Font family */}
      <div className="relative" ref={fontRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setFontOpen(o => !o); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-300 hover:bg-white/[0.07] min-w-[88px]"
          title="Font"
        >
          <span className="truncate flex-1 text-left" style={{ fontFamily: currentFont.css }}>{currentFont.name}</span>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {fontOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[140px] z-50 max-h-60 overflow-y-auto">
            {FONT_FAMILIES.map(f => (
              <button
                key={f.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); handleFontPick(f); }}
                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] ${currentFont.css === f.css ? "text-blue-300" : "text-gray-300"}`}
                style={{ fontFamily: f.css }}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font size */}
      <div className="relative" ref={sizeRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setSizeOpen(o => !o); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-300 hover:bg-white/[0.07] min-w-[52px]"
          title="Font size"
        >
          <span className="flex-1 text-center">{currentSize}</span>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {sizeOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[60px] z-50 max-h-60 overflow-y-auto">
            {FONT_SIZES.map(s => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); handleSizePick(s); }}
                className={`block w-full text-center px-2 py-1 text-xs hover:bg-white/[0.05] ${currentSize === s ? "text-blue-300" : "text-gray-300"}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Bold / Italic / Underline / Strikethrough */}
      <RbBtn onClick={() => applyExec("bold")} title="Bold (⌘B)"><Bold className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("italic")} title="Italic (⌘I)"><Italic className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("underline")} title="Underline (⌘U)"><Underline className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("strikeThrough")} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></RbBtn>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Color */}
      <div className="relative" ref={colorRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setColorOpen(o => !o); }}
          className="flex items-center gap-1 p-1.5 rounded-md hover:bg-white/[0.07] text-gray-300"
          title="Text color"
        >
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-bold leading-none">A</span>
            <div className="h-1 w-3 rounded-sm" style={{ backgroundColor: textObject.color || "#e5e7eb" }} />
          </div>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {colorOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl p-2 z-50">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); handleColorPick(c); }}
                  className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${textObject.color === c ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#2d2e30]" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 px-1">
              <span className="text-[10px] text-gray-500">Custom:</span>
              <input
                type="color"
                value={textObject.color || "#e5e7eb"}
                onChange={(e) => handleColorPick(e.target.value)}
                className="h-5 w-7 rounded cursor-pointer bg-transparent border border-white/[0.1]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Alignment */}
      <RbBtn onClick={() => { setProp({ textAlign: "left" }); applyExec("justifyLeft"); }} active={textObject.textAlign === "left" || !textObject.textAlign} title="Align left">
        <AlignLeft className="h-3.5 w-3.5" />
      </RbBtn>
      <RbBtn onClick={() => { setProp({ textAlign: "center" }); applyExec("justifyCenter"); }} active={textObject.textAlign === "center"} title="Align center">
        <AlignCenter className="h-3.5 w-3.5" />
      </RbBtn>
      <RbBtn onClick={() => { setProp({ textAlign: "right" }); applyExec("justifyRight"); }} active={textObject.textAlign === "right"} title="Align right">
        <AlignRight className="h-3.5 w-3.5" />
      </RbBtn>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Lists */}
      <RbBtn onClick={() => applyExec("insertUnorderedList")} title="Bulleted list"><List className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("insertOrderedList")} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></RbBtn>
    </div>
  );
}

// ─── Minimap ──────────────────────────────────────────────────────
function Minimap({ objects, viewport, containerSize, setViewport, contentBounds }) {
  const mapWidth = 200;
  const mapHeight = 140;

  // World bounds = bounding box of all objects + viewport, with padding
  const bounds = useMemo(() => {
    let minX = -200, minY = -200, maxX = 200, maxY = 200;
    for (const o of objects) {
      const b = objectBounds(o);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    // Include viewport in bounds so user always sees their position
    const vw = containerSize.w / viewport.zoom;
    const vh = containerSize.h / viewport.zoom;
    const vx = -viewport.x / viewport.zoom;
    const vy = -viewport.y / viewport.zoom;
    minX = Math.min(minX, vx);
    minY = Math.min(minY, vy);
    maxX = Math.max(maxX, vx + vw);
    maxY = Math.max(maxY, vy + vh);
    const pad = 80;
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }, [objects, viewport, containerSize]);

  const scaleX = mapWidth / bounds.w;
  const scaleY = mapHeight / bounds.h;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (mapWidth - bounds.w * scale) / 2;
  const offsetY = (mapHeight - bounds.h * scale) / 2;

  const worldToMap = (x, y) => ({
    x: (x - bounds.x) * scale + offsetX,
    y: (y - bounds.y) * scale + offsetY,
  });

  // Viewport rectangle in world coords
  const vw = containerSize.w / viewport.zoom;
  const vh = containerSize.h / viewport.zoom;
  const vx = -viewport.x / viewport.zoom;
  const vy = -viewport.y / viewport.zoom;
  const vmap = worldToMap(vx, vy);
  const vmapW = vw * scale;
  const vmapH = vh * scale;

  const [dragging, setDragging] = useState(false);
  const mapRef = useRef(null);

  const mapClickToWorld = (e) => {
    const rect = mapRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - offsetX) / scale + bounds.x;
    const wy = (my - offsetY) / scale + bounds.y;
    return { wx, wy };
  };

  const handleMouseDown = (e) => {
    setDragging(true);
    const { wx, wy } = mapClickToWorld(e);
    // Center viewport on click
    setViewport(v => ({ ...v, x: -wx * v.zoom + containerSize.w / 2, y: -wy * v.zoom + containerSize.h / 2 }));
  };
  const handleMouseMove = (e) => {
    if (!dragging) return;
    const { wx, wy } = mapClickToWorld(e);
    setViewport(v => ({ ...v, x: -wx * v.zoom + containerSize.w / 2, y: -wy * v.zoom + containerSize.h / 2 }));
  };
  const handleMouseUp = () => setDragging(false);

  useEffect(() => {
    if (!dragging) return;
    const mm = (e) => handleMouseMove(e);
    const mu = () => setDragging(false);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
  }, [dragging]);

  // Wheel on minimap zooms the main canvas — non-passive so we can prevent scroll
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = -e.deltaY * 0.001;
      setViewport(v => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * (1 + delta)));
        const cx = containerSize.w / 2;
        const cy = containerSize.h / 2;
        const worldCx = (cx - v.x) / v.zoom;
        const worldCy = (cy - v.y) / v.zoom;
        return { x: cx - worldCx * newZoom, y: cy - worldCy * newZoom, zoom: newZoom };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerSize.w, containerSize.h, setViewport]);

  return (
    <div
      ref={mapRef}
      onMouseDown={handleMouseDown}
      className="absolute bottom-3 right-3 z-30 bg-[#2a2b2d]/95 backdrop-blur border border-white/[0.08] rounded-lg overflow-hidden shadow-2xl cursor-pointer"
      style={{ width: mapWidth, height: mapHeight }}
      title="Click or drag to navigate • Scroll to zoom"
    >
      <svg width={mapWidth} height={mapHeight} className="block">
        {/* Background grid (lighter) */}
        <defs>
          <pattern id="minimap-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={mapWidth} height={mapHeight} fill="#18191a" />
        <rect width={mapWidth} height={mapHeight} fill="url(#minimap-grid)" />

        {/* Render objects as simplified shapes */}
        {objects.map(o => {
          const b = objectBounds(o);
          const p1 = worldToMap(b.x, b.y);
          const w = b.w * scale;
          const h = b.h * scale;
          let fill = o.color || "#94a3b8";
          if (o.type === "path") fill = "transparent";
          return (
            <rect
              key={o.id}
              x={p1.x}
              y={p1.y}
              width={Math.max(w, 1)}
              height={Math.max(h, 1)}
              fill={o.type === "path" || o.type === "line" || o.type === "arrow" ? "transparent" : fill + "30"}
              stroke={o.color || "#94a3b8"}
              strokeWidth={0.5}
              rx={1}
            />
          );
        })}

        {/* Viewport rectangle */}
        <rect
          x={vmap.x}
          y={vmap.y}
          width={vmapW}
          height={vmapH}
          fill="rgba(59, 130, 246, 0.08)"
          stroke="rgba(59, 130, 246, 0.8)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
      <div className="absolute top-1 left-1.5 text-[9px] text-gray-500 pointer-events-none uppercase tracking-wider font-semibold">Minimap</div>
      <div className="absolute bottom-1 right-1.5 text-[9px] text-gray-500 pointer-events-none">{Math.round(viewport.zoom * 100)}%</div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────
function shiftObj(o, dx, dy) {
  if (dx === 0 && dy === 0) return o;
  switch (o.type) {
    case "text":
    case "rect":
    case "ellipse":
    case "triangle":
    case "diamond":
    case "roundedRect":
    case "star":
      return { ...o, x: o.x + dx, y: o.y + dy };
    case "line":
    case "arrow":
      return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
    case "path":
      return { ...o, points: (o.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })) };
    default:
      return o;
  }
}

function objectBounds(o) {
  switch (o.type) {
    case "text":
      return { x: o.x, y: o.y, w: o.w || 200, h: o.h || (o.fontSize || 18) * 1.4 };
    case "rect":
    case "ellipse":
    case "triangle":
    case "diamond":
    case "roundedRect":
    case "star":
      return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
    case "line":
    case "arrow":
      return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1) || 1, h: Math.abs(o.y2 - o.y1) || 1 };
    case "path": {
      if (!o.points || o.points.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of o.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX || 1, h: maxY - minY || 1 };
    }
    default:
      return { x: 0, y: 0, w: 1, h: 1 };
  }
}

function pointInBounds(px, py, b, pad = 4) {
  return px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTest(o, x, y, tolerance = 8) {
  switch (o.type) {
    case "text":
    case "rect":
    case "ellipse":
    case "triangle":
    case "diamond":
    case "roundedRect":
    case "star":
      return pointInBounds(x, y, objectBounds(o), tolerance);
    case "line":
    case "arrow":
      return distToSegment(x, y, o.x1, o.y1, o.x2, o.y2) < tolerance;
    case "path":
      if (!o.points) return false;
      for (let i = 1; i < o.points.length; i++) {
        if (distToSegment(x, y, o.points[i - 1].x, o.points[i - 1].y, o.points[i].x, o.points[i].y) < tolerance) return true;
      }
      return false;
    default:
      return false;
  }
}

// ─── Main Whiteboard ──────────────────────────────────────────────
export default function Whiteboard({ page, onUpdate, headerSlot }) {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  // Viewport: x, y are screen offset; zoom is scale factor
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // Tool state
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState("#e5e7eb");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(18);
  const [showGrid, setShowGrid] = useState(() => localStorage.getItem("pulse_wb_grid") !== "false");
  useEffect(() => { localStorage.setItem("pulse_wb_grid", String(showGrid)); }, [showGrid]);

  // Objects + history
  const [objects, setObjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [historyVersion, setHistoryVersion] = useState(0); // to force re-render for canUndo/Redo

  // Drawing state
  const [drawingObject, setDrawingObject] = useState(null);
  const [panning, setPanning] = useState(false);
  const [draggingSelection, setDraggingSelection] = useState(null); // { startX, startY, originals }
  const [editingTextId, setEditingTextId] = useState(null);

  const saveTimer = useRef(null);
  const loadedRef = useRef(false);
  const editingTextRef = useRef(null);

  // ─── Context menu + clipboard ────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, target: object | null }
  const clipboardRef = useRef([]);
  const [snapToGrid, setSnapToGrid] = useState(() => localStorage.getItem("pulse_wb_snap") === "true");
  const [fill, setFill] = useState("transparent");
  const [opacity, setOpacity] = useState(1);

  useEffect(() => { localStorage.setItem("pulse_wb_snap", String(snapToGrid)); }, [snapToGrid]);

  // Helper: get all object IDs in the same group as the given id
  const groupMembers = useCallback((id) => {
    const o = objects.find(x => x.id === id);
    if (!o || !o.groupId) return [id];
    return objects.filter(x => x.groupId === o.groupId).map(x => x.id);
  }, [objects]);

  // Selection that respects groups
  const effectiveSelectionIds = useMemo(() => {
    const set = new Set(selectedIds);
    for (const id of selectedIds) {
      for (const m of groupMembers(id)) set.add(m);
    }
    return Array.from(set);
  }, [selectedIds, groupMembers]);

  // Copy / Paste / Duplicate
  const copySelection = useCallback(() => {
    const sel = objects.filter(o => effectiveSelectionIds.includes(o.id));
    if (sel.length === 0) return;
    clipboardRef.current = sel.map(o => JSON.parse(JSON.stringify(o)));
  }, [objects, effectiveSelectionIds]);

  const pasteClipboard = useCallback((atWorldX = null, atWorldY = null) => {
    if (clipboardRef.current.length === 0) return;
    pushHistory(objects);
    const idMap = {};
    const offset = 16;
    const newObjs = clipboardRef.current.map(o => {
      const newId = uid();
      idMap[o.id] = newId;
      const clone = { ...JSON.parse(JSON.stringify(o)), id: newId };
      // Shift positions
      if (clone.x !== undefined) clone.x += offset;
      if (clone.y !== undefined) clone.y += offset;
      if (clone.x1 !== undefined) { clone.x1 += offset; clone.y1 += offset; clone.x2 += offset; clone.y2 += offset; }
      if (clone.points) clone.points = clone.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
      return clone;
    });
    // Reassign group ids so pasted group stays a group of its own
    const groupMap = {};
    newObjs.forEach(o => {
      if (o.groupId) {
        if (!groupMap[o.groupId]) groupMap[o.groupId] = uid();
        o.groupId = groupMap[o.groupId];
      }
    });
    setObjects(prev => [...prev, ...newObjs]);
    setSelectedIds(newObjs.map(o => o.id));
  }, [objects]);

  const duplicateSelection = useCallback(() => {
    copySelection();
    pasteClipboard();
  }, [copySelection, pasteClipboard]);

  const deleteSelection = useCallback(() => {
    if (effectiveSelectionIds.length === 0) return;
    pushHistory(objects);
    setObjects(prev => prev.filter(o => !effectiveSelectionIds.includes(o.id)));
    setSelectedIds([]);
  }, [effectiveSelectionIds, objects]);

  // Layering
  const bringToFront = useCallback(() => {
    if (effectiveSelectionIds.length === 0) return;
    pushHistory(objects);
    setObjects(prev => {
      const sel = prev.filter(o => effectiveSelectionIds.includes(o.id));
      const rest = prev.filter(o => !effectiveSelectionIds.includes(o.id));
      return [...rest, ...sel];
    });
  }, [effectiveSelectionIds, objects]);

  const sendToBack = useCallback(() => {
    if (effectiveSelectionIds.length === 0) return;
    pushHistory(objects);
    setObjects(prev => {
      const sel = prev.filter(o => effectiveSelectionIds.includes(o.id));
      const rest = prev.filter(o => !effectiveSelectionIds.includes(o.id));
      return [...sel, ...rest];
    });
  }, [effectiveSelectionIds, objects]);

  const bringForward = useCallback(() => {
    if (effectiveSelectionIds.length === 0) return;
    pushHistory(objects);
    setObjects(prev => {
      const arr = [...prev];
      for (let i = arr.length - 2; i >= 0; i--) {
        if (effectiveSelectionIds.includes(arr[i].id) && !effectiveSelectionIds.includes(arr[i + 1].id)) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      }
      return arr;
    });
  }, [effectiveSelectionIds, objects]);

  const sendBackward = useCallback(() => {
    if (effectiveSelectionIds.length === 0) return;
    pushHistory(objects);
    setObjects(prev => {
      const arr = [...prev];
      for (let i = 1; i < arr.length; i++) {
        if (effectiveSelectionIds.includes(arr[i].id) && !effectiveSelectionIds.includes(arr[i - 1].id)) {
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
      return arr;
    });
  }, [effectiveSelectionIds, objects]);

  // Lock / unlock
  const toggleLock = useCallback(() => {
    pushHistory(objects);
    setObjects(prev => prev.map(o => effectiveSelectionIds.includes(o.id) ? { ...o, locked: !o.locked } : o));
  }, [effectiveSelectionIds, objects]);

  // Group / Ungroup
  const groupSelection = useCallback(() => {
    if (effectiveSelectionIds.length < 2) return;
    pushHistory(objects);
    const groupId = uid();
    setObjects(prev => prev.map(o => effectiveSelectionIds.includes(o.id) ? { ...o, groupId } : o));
  }, [effectiveSelectionIds, objects]);

  const ungroupSelection = useCallback(() => {
    pushHistory(objects);
    setObjects(prev => prev.map(o => effectiveSelectionIds.includes(o.id) ? { ...o, groupId: undefined } : o));
  }, [effectiveSelectionIds, objects]);

  // Alignment
  const alignSelection = useCallback((axis) => {
    if (effectiveSelectionIds.length < 2) return;
    pushHistory(objects);
    const sel = objects.filter(o => effectiveSelectionIds.includes(o.id));
    const bounds = sel.map(o => ({ id: o.id, b: objectBounds(o) }));
    setObjects(prev => prev.map(o => {
      if (!effectiveSelectionIds.includes(o.id)) return o;
      const b = objectBounds(o);
      let dx = 0, dy = 0;
      if (axis === "left") dx = Math.min(...bounds.map(x => x.b.x)) - b.x;
      else if (axis === "right") dx = Math.max(...bounds.map(x => x.b.x + x.b.w)) - (b.x + b.w);
      else if (axis === "center") dx = (Math.min(...bounds.map(x => x.b.x)) + Math.max(...bounds.map(x => x.b.x + x.b.w))) / 2 - (b.x + b.w / 2);
      else if (axis === "top") dy = Math.min(...bounds.map(x => x.b.y)) - b.y;
      else if (axis === "bottom") dy = Math.max(...bounds.map(x => x.b.y + x.b.h)) - (b.y + b.h);
      else if (axis === "middle") dy = (Math.min(...bounds.map(x => x.b.y)) + Math.max(...bounds.map(x => x.b.y + x.b.h))) / 2 - (b.y + b.h / 2);
      return shiftObj(o, dx, dy);
    }));
  }, [effectiveSelectionIds, objects]);

  const distributeSelection = useCallback((axis) => {
    if (effectiveSelectionIds.length < 3) return;
    pushHistory(objects);
    const sel = objects.filter(o => effectiveSelectionIds.includes(o.id)).map(o => ({ id: o.id, b: objectBounds(o) }));
    sel.sort((a, b) => axis === "h" ? a.b.x - b.b.x : a.b.y - b.b.y);
    const first = sel[0].b;
    const last = sel[sel.length - 1].b;
    const totalSpan = axis === "h" ? (last.x - first.x) : (last.y - first.y);
    const step = totalSpan / (sel.length - 1);
    const targets = {};
    sel.forEach((s, i) => {
      targets[s.id] = axis === "h" ? first.x + step * i : first.y + step * i;
    });
    setObjects(prev => prev.map(o => {
      if (!effectiveSelectionIds.includes(o.id)) return o;
      const b = objectBounds(o);
      const dx = axis === "h" ? (targets[o.id] - b.x) : 0;
      const dy = axis === "v" ? (targets[o.id] - b.y) : 0;
      return shiftObj(o, dx, dy);
    }));
  }, [effectiveSelectionIds, objects]);

  // Apply per-object property to selection (fill, opacity, color, strokeWidth)
  const setSelectionProp = useCallback((patch) => {
    if (effectiveSelectionIds.length === 0) return;
    pushHistory(objects);
    setObjects(prev => prev.map(o => effectiveSelectionIds.includes(o.id) ? { ...o, ...patch } : o));
  }, [effectiveSelectionIds, objects]);

  // Add quick shape at point
  const addQuickShape = useCallback((shapeType, atX, atY) => {
    pushHistory(objects);
    const newObj = shapeType === "text"
      ? { id: uid(), type: "text", x: atX, y: atY, w: 220, h: fontSize * 1.6, text: "Text", color, fontSize }
      : shapeType === "sticky"
      ? { id: uid(), type: "rect", x: atX, y: atY, w: 160, h: 160, color: "#fde047", strokeWidth: 2, fill: "rgba(253, 224, 71, 0.2)" }
      : { id: uid(), type: shapeType, x: atX, y: atY, w: 120, h: 80, color, strokeWidth };
    setObjects(prev => [...prev, newObj]);
    setSelectedIds([newObj.id]);
  }, [color, fontSize, strokeWidth, objects]);

  // Export functions
  const exportSVG = useCallback(() => {
    const svgEl = containerRef.current?.querySelector("svg");
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgStr = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.title || "whiteboard"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [page.title]);

  const exportPNG = useCallback(async () => {
    try {
      const { default: html2canvas } = await import("html2canvas");
      const el = containerRef.current;
      if (!el) return;
      const canvas = await html2canvas(el, { backgroundColor: "#1a1b1c" });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${page.title || "whiteboard"}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      console.error("PNG export failed", e);
    }
  }, [page.title]);

  // Load objects from page
  useEffect(() => {
    if (page.whiteboard) {
      try {
        const parsed = JSON.parse(page.whiteboard);
        if (Array.isArray(parsed)) setObjects(parsed);
        else setObjects([]);
      } catch {
        setObjects([]);
      }
    } else {
      setObjects([]);
    }
    setViewport({ x: 0, y: 0, zoom: 1 });
    setSelectedIds([]);
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion(v => v + 1);
    loadedRef.current = true;
  }, [page.id]);

  // Auto-save objects to page (debounced)
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate({ whiteboard: JSON.stringify(objects) });
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [objects, onUpdate]);

  // Container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Coordinate conversion
  const screenToWorld = useCallback((sx, sy) => {
    const rect = containerRef.current.getBoundingClientRect();
    const x = (sx - rect.left - viewport.x) / viewport.zoom;
    const y = (sy - rect.top - viewport.y) / viewport.zoom;
    return { x, y };
  }, [viewport]);

  // History helpers
  const pushHistory = useCallback((prev) => {
    undoStack.current.push(JSON.parse(JSON.stringify(prev)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion(v => v + 1);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop();
    redoStack.current.push(JSON.parse(JSON.stringify(objects)));
    setObjects(prev);
    setSelectedIds([]);
    setHistoryVersion(v => v + 1);
  }, [objects]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop();
    undoStack.current.push(JSON.parse(JSON.stringify(objects)));
    setObjects(next);
    setSelectedIds([]);
    setHistoryVersion(v => v + 1);
  }, [objects]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (editingTextId) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }
      if (mod && e.key === "c") { e.preventDefault(); copySelection(); return; }
      if (mod && e.key === "v") { e.preventDefault(); pasteClipboard(); return; }
      if (mod && e.key === "x") { e.preventDefault(); copySelection(); deleteSelection(); return; }
      if (mod && e.key === "d") { e.preventDefault(); duplicateSelection(); return; }
      if (mod && e.key === "a") { e.preventDefault(); setSelectedIds(objects.filter(o => !o.locked).map(o => o.id)); return; }
      if (mod && e.key === "g" && !e.shiftKey) { e.preventDefault(); groupSelection(); return; }
      if (mod && e.key === "g" && e.shiftKey) { e.preventDefault(); ungroupSelection(); return; }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          deleteSelection();
        }
      }
      // Tool shortcuts
      if (!mod && !e.shiftKey) {
        if (e.key === "v") setTool("select");
        else if (e.key === "h") setTool("hand");
        else if (e.key === "p") setTool("pen");
        else if (e.key === "t") setTool("text");
        else if (e.key === "r") setTool("rect");
        else if (e.key === "o") setTool("ellipse");
        else if (e.key === "a") setTool("arrow");
        else if (e.key === "l") setTool("line");
        else if (e.key === "e") setTool("eraser");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, selectedIds, objects, editingTextId]);

  // ─── Pointer handlers ────────────────────────────────────────────
  const handlePointerDown = (e) => {
    // Right-click handled by onContextMenu, not here
    if (e.button === 2) return;
    if (e.button === 1 || (tool === "hand" && e.button === 0)) {
      setPanning(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (editingTextId) return;
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (tool === "select") {
      // Hit test (skip locked unless directly clicked already-selected)
      const hit = [...objects].reverse().find(o => !o.locked && hitTest(o, x, y));
      if (hit) {
        // Expand to group members
        const expanded = [];
        if (hit.groupId) {
          const memberIds = objects.filter(o => o.groupId === hit.groupId).map(o => o.id);
          expanded.push(...memberIds);
        } else {
          expanded.push(hit.id);
        }
        const newSelection = e.shiftKey ? [...new Set([...selectedIds, ...expanded])] : expanded;
        setSelectedIds(newSelection);
        const dragIds = selectedIds.includes(hit.id) && !e.shiftKey ? selectedIds : expanded;
        setDraggingSelection({
          startX: x,
          startY: y,
          originals: objects.filter(o => dragIds.includes(o.id))
            .map(o => ({ id: o.id, snapshot: JSON.parse(JSON.stringify(o)) })),
        });
        pushHistory(objects);
      } else {
        // Click on empty space → start panning the canvas
        setSelectedIds([]);
        setPanning(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      return;
    }

    if (tool === "pen") {
      pushHistory(objects);
      setDrawingObject({ id: uid(), type: "path", points: [{ x, y }], color, strokeWidth });
      return;
    }

    if (tool === "text") {
      pushHistory(objects);
      // Start a drag-create for the text box (like rect)
      setDrawingObject({ id: uid(), type: "text", x, y, w: 0, h: 0, text: "", color, fontSize });
      return;
    }

    if (["rect", "ellipse", "triangle", "diamond", "roundedRect", "star"].includes(tool)) {
      pushHistory(objects);
      setDrawingObject({ id: uid(), type: tool, x, y, w: 0, h: 0, color, strokeWidth, fill, opacity });
      return;
    }

    if (tool === "arrow" || tool === "line") {
      pushHistory(objects);
      setDrawingObject({ id: uid(), type: tool, x1: x, y1: y, x2: x, y2: y, color, strokeWidth });
      return;
    }

    if (tool === "eraser") {
      const hit = [...objects].reverse().find(o => hitTest(o, x, y));
      if (hit) {
        pushHistory(objects);
        setObjects(prev => prev.filter(o => o.id !== hit.id));
      }
      return;
    }
  };

  const handlePointerMove = (e) => {
    if (panning) {
      setViewport(v => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }));
      return;
    }

    if (draggingSelection) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const dx = x - draggingSelection.startX;
      const dy = y - draggingSelection.startY;
      setObjects(prev => prev.map(o => {
        const orig = draggingSelection.originals.find(s => s.id === o.id);
        if (!orig) return o;
        const s = orig.snapshot;
        switch (s.type) {
          case "text":
          case "rect":
          case "ellipse":
            return { ...o, x: s.x + dx, y: s.y + dy };
          case "line":
          case "arrow":
            return { ...o, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
          case "path":
            return { ...o, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
          default:
            return o;
        }
      }));
      return;
    }

    if (drawingObject) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      if (drawingObject.type === "path") {
        setDrawingObject(o => ({ ...o, points: [...o.points, { x, y }] }));
      } else if (["rect", "ellipse", "text", "triangle", "diamond", "roundedRect", "star"].includes(drawingObject.type)) {
        setDrawingObject(o => ({ ...o, w: x - o.x, h: y - o.y }));
      } else if (drawingObject.type === "arrow" || drawingObject.type === "line") {
        setDrawingObject(o => ({ ...o, x2: x, y2: y }));
      }
    }

    if (tool === "eraser" && e.buttons === 1) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const hit = [...objects].reverse().find(o => hitTest(o, x, y));
      if (hit) {
        setObjects(prev => prev.filter(o => o.id !== hit.id));
      }
    }
  };

  const handlePointerUp = (e) => {
    if (panning) { setPanning(false); return; }
    if (draggingSelection) { setDraggingSelection(null); return; }
    if (drawingObject) {
      let obj = drawingObject;
      setDrawingObject(null);

      if (["rect", "ellipse", "triangle", "diamond", "roundedRect", "star"].includes(obj.type)) {
        if (Math.abs(obj.w) < 2 && Math.abs(obj.h) < 2) return;
        // Normalize negative dimensions
        if (obj.w < 0) obj = { ...obj, x: obj.x + obj.w, w: -obj.w };
        if (obj.h < 0) obj = { ...obj, y: obj.y + obj.h, h: -obj.h };
      }
      if (obj.type === "text") {
        // If user only clicked (no drag), use default size
        if (Math.abs(obj.w) < 10 || Math.abs(obj.h) < 10) {
          obj = { ...obj, w: 220, h: (obj.fontSize || 18) * 1.6 };
        } else {
          // Normalize negative dimensions
          if (obj.w < 0) obj = { ...obj, x: obj.x + obj.w, w: -obj.w };
          if (obj.h < 0) obj = { ...obj, y: obj.y + obj.h, h: -obj.h };
        }
        setObjects(prev => [...prev, obj]);
        setEditingTextId(obj.id);
        setSelectedIds([obj.id]);
        setTool("select");
        return;
      }
      if (obj.type === "line" || obj.type === "arrow") {
        if (Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) < 2) return;
      }
      if (obj.type === "path" && (!obj.points || obj.points.length < 2)) return;
      setObjects(prev => [...prev, obj]);
    }
  };

  // Wheel: zoom — attached via useEffect with passive:false so preventDefault works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      // Block ALL wheel events from bubbling to the page
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Trackpad pinch-zoom shows as ctrlKey wheel events; standard wheel = zoom too
      const delta = -e.deltaY * 0.0015;
      setViewport(v => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * (1 + delta)));
        const worldX = (mx - v.x) / v.zoom;
        const worldY = (my - v.y) / v.zoom;
        const newX = mx - worldX * newZoom;
        const newY = my - worldY * newZoom;
        return { x: newX, y: newY, zoom: newZoom };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleClear = () => {
    if (objects.length === 0) return;
    if (!confirm("Clear the entire whiteboard?")) return;
    pushHistory(objects);
    setObjects([]);
    setSelectedIds([]);
  };

  const fitToContent = () => {
    if (objects.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of objects) {
      const b = objectBounds(o);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    const padding = 80;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const zoom = Math.min(containerSize.w / w, containerSize.h / h, 1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({
      x: containerSize.w / 2 - cx * zoom,
      y: containerSize.h / 2 - cy * zoom,
      zoom,
    });
  };

  // Cursor for the canvas
  const cursorClass = (() => {
    if (panning) return "cursor-grabbing";
    if (tool === "hand") return "cursor-grab";
    if (tool === "select") return "cursor-default"; // becomes grab on empty-space hover via SVG hit area
    if (tool === "eraser") return "cursor-cell";
    if (tool === "text") return "cursor-text";
    return "cursor-crosshair";
  })();

  const allDrawing = drawingObject ? [...objects, drawingObject] : objects;

  // Strip HTML tags to detect truly empty content
  const finishTextEdit = (id, html) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    const plain = (tmp.textContent || "").trim();
    if (!plain) {
      setObjects(prev => prev.filter(o => o.id !== id));
    } else {
      setObjects(prev => prev.map(o => o.id === id ? { ...o, text: html } : o));
    }
    setEditingTextId(null);
  };

  return (
    <div className="relative h-full flex flex-col bg-[#1a1b1c]">
      {headerSlot}
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-hidden ${cursorClass} select-none`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          if (editingTextId) return;
          const { x, y } = screenToWorld(e.clientX, e.clientY);
          const hit = [...objects].reverse().find(o => hitTest(o, x, y));
          if (hit) {
            // Select if not already selected (respect groups)
            const expanded = hit.groupId
              ? objects.filter(o => o.groupId === hit.groupId).map(o => o.id)
              : [hit.id];
            if (!selectedIds.includes(hit.id)) setSelectedIds(expanded);
            setCtxMenu({ x: e.clientX, y: e.clientY, target: hit, worldX: x, worldY: y });
          } else {
            setSelectedIds([]);
            setCtxMenu({ x: e.clientX, y: e.clientY, target: null, worldX: x, worldY: y });
          }
        }}
        style={showGrid ? {
          backgroundColor: "#1a1b1c",
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px, ${20 * viewport.zoom}px ${20 * viewport.zoom}px, ${100 * viewport.zoom}px ${100 * viewport.zoom}px, ${100 * viewport.zoom}px ${100 * viewport.zoom}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        } : { backgroundColor: "#1a1b1c" }}
      >
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          fontSize={fontSize}
          setFontSize={setFontSize}
          onClear={handleClear}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.current.length > 0}
          canRedo={redoStack.current.length > 0}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
        />

        {/* Whiteboard right-click context menu */}
        {ctxMenu && (
          <WhiteboardContextMenu
            menu={ctxMenu}
            onClose={() => setCtxMenu(null)}
            onAction={(action, payload) => {
              switch (action) {
                case "editText":
                  setEditingTextId(payload.id);
                  setSelectedIds([payload.id]);
                  break;
                case "copy": copySelection(); break;
                case "cut": copySelection(); deleteSelection(); break;
                case "paste": pasteClipboard(); break;
                case "pasteAt": pasteClipboard(ctxMenu.worldX, ctxMenu.worldY); break;
                case "duplicate": duplicateSelection(); break;
                case "delete": deleteSelection(); break;
                case "bringToFront": bringToFront(); break;
                case "bringForward": bringForward(); break;
                case "sendBackward": sendBackward(); break;
                case "sendToBack": sendToBack(); break;
                case "toggleLock": toggleLock(); break;
                case "group": groupSelection(); break;
                case "ungroup": ungroupSelection(); break;
                case "setColor": setSelectionProp({ color: payload }); break;
                case "setStrokeWidth": setSelectionProp({ strokeWidth: payload }); break;
                case "selectAll": setSelectedIds(objects.filter(o => !o.locked).map(o => o.id)); break;
                case "toggleGrid": setShowGrid(g => !g); break;
                case "resetZoom": setViewport({ x: 0, y: 0, zoom: 1 }); break;
                case "zoomToFit": fitToContent(); break;
                case "addAt": addQuickShape(payload, ctxMenu.worldX, ctxMenu.worldY); break;
                default: break;
              }
            }}
          />
        )}

        {/* Text formatting ribbon OR selection action bar */}
        {(() => {
          const focusedTextId = editingTextId || (selectedIds.length === 1 ? selectedIds[0] : null);
          const focusedText = focusedTextId ? objects.find(o => o.id === focusedTextId && o.type === "text") : null;
          if (focusedText) {
            return (
              <TextRibbon
                textObject={focusedText}
                isEditing={editingTextId === focusedTextId}
                editingTextRef={editingTextRef}
                onUpdate={(patch) => {
                  pushHistory(objects);
                  setObjects(prev => prev.map(o => o.id === focusedTextId ? { ...o, ...patch } : o));
                }}
              />
            );
          }
          // Show selection action bar when 1+ non-text objects are selected
          if (selectedIds.length > 0) {
            const first = objects.find(o => o.id === selectedIds[0]);
            return (
              <SelectionBar
                count={selectedIds.length}
                selected={objects.filter(o => selectedIds.includes(o.id))}
                locked={!!first?.locked}
                fill={first?.fill ?? "transparent"}
                opacity={first?.opacity ?? 1}
                onSetFill={(c) => setSelectionProp({ fill: c })}
                onSetOpacity={(v) => setSelectionProp({ opacity: v })}
                onAlign={alignSelection}
                onDistribute={distributeSelection}
                onBringToFront={bringToFront}
                onBringForward={bringForward}
                onSendBackward={sendBackward}
                onSendToBack={sendToBack}
                onGroup={groupSelection}
                onUngroup={ungroupSelection}
                onToggleLock={toggleLock}
                onDuplicate={duplicateSelection}
                onDelete={deleteSelection}
                onExportPNG={exportPNG}
                onExportSVG={exportSVG}
              />
            );
          }
          return null;
        })()}

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-[#2a2b2d]/95 backdrop-blur border border-white/[0.08] rounded-lg px-1 py-1 shadow-2xl">
          <button
            onClick={() => setViewport(v => {
              const newZoom = Math.max(MIN_ZOOM, v.zoom * 0.8);
              const cx = containerSize.w / 2, cy = containerSize.h / 2;
              const wx = (cx - v.x) / v.zoom, wy = (cy - v.y) / v.zoom;
              return { x: cx - wx * newZoom, y: cy - wy * newZoom, zoom: newZoom };
            })}
            className="p-1 rounded text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
            className="px-1.5 text-[10px] text-gray-400 hover:text-gray-200 min-w-[40px]"
            title="Reset zoom"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            onClick={() => setViewport(v => {
              const newZoom = Math.min(MAX_ZOOM, v.zoom * 1.25);
              const cx = containerSize.w / 2, cy = containerSize.h / 2;
              const wx = (cx - v.x) / v.zoom, wy = (cy - v.y) / v.zoom;
              return { x: cx - wx * newZoom, y: cy - wy * newZoom, zoom: newZoom };
            })}
            className="p-1 rounded text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={fitToContent}
            className="p-1 rounded text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"
            title="Fit to content"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* SVG Canvas */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: "visible" }}
        >
          <defs>
            <marker id="wb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
            {allDrawing.map(o => {
              const isSel = selectedIds.includes(o.id);
              const selStyle = isSel ? { filter: "drop-shadow(0 0 4px rgba(59,130,246,0.8))" } : {};

              const objOpacity = o.opacity ?? 1;
              const objFill = o.fill && o.fill !== "transparent" ? o.fill : (o.color + "20");
              const lockedStyle = o.locked ? { ...selStyle, opacity: 0.7 } : selStyle;

              if (o.type === "rect" || o.type === "roundedRect") {
                const x = Math.min(o.x, o.x + o.w);
                const y = Math.min(o.y, o.y + o.h);
                const w = Math.abs(o.w);
                const h = Math.abs(o.h);
                return (
                  <rect
                    key={o.id}
                    x={x} y={y} width={w} height={h}
                    fill={objFill}
                    fillOpacity={objOpacity}
                    stroke={o.color}
                    strokeWidth={o.strokeWidth || 2}
                    strokeOpacity={objOpacity}
                    rx={o.type === "roundedRect" ? Math.min(w, h) / 4 : 4}
                    style={lockedStyle}
                  />
                );
              }
              if (o.type === "triangle") {
                const x = Math.min(o.x, o.x + o.w);
                const y = Math.min(o.y, o.y + o.h);
                const w = Math.abs(o.w);
                const h = Math.abs(o.h);
                const pts = `${x + w / 2},${y} ${x},${y + h} ${x + w},${y + h}`;
                return (
                  <polygon key={o.id} points={pts} fill={objFill} fillOpacity={objOpacity} stroke={o.color} strokeWidth={o.strokeWidth || 2} strokeOpacity={objOpacity} style={lockedStyle} />
                );
              }
              if (o.type === "diamond") {
                const x = Math.min(o.x, o.x + o.w);
                const y = Math.min(o.y, o.y + o.h);
                const w = Math.abs(o.w);
                const h = Math.abs(o.h);
                const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
                return (
                  <polygon key={o.id} points={pts} fill={objFill} fillOpacity={objOpacity} stroke={o.color} strokeWidth={o.strokeWidth || 2} strokeOpacity={objOpacity} style={lockedStyle} />
                );
              }
              if (o.type === "star") {
                const x = Math.min(o.x, o.x + o.w);
                const y = Math.min(o.y, o.y + o.h);
                const w = Math.abs(o.w);
                const h = Math.abs(o.h);
                const cx = x + w / 2, cy = y + h / 2;
                const outerR = Math.min(w, h) / 2;
                const innerR = outerR * 0.4;
                const pts = [];
                for (let i = 0; i < 10; i++) {
                  const r = i % 2 === 0 ? outerR : innerR;
                  const a = (Math.PI / 5) * i - Math.PI / 2;
                  pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
                }
                return (
                  <polygon key={o.id} points={pts.join(" ")} fill={objFill} fillOpacity={objOpacity} stroke={o.color} strokeWidth={o.strokeWidth || 2} strokeOpacity={objOpacity} style={lockedStyle} />
                );
              }
              if (o.type === "ellipse") {
                const cx = o.x + o.w / 2;
                const cy = o.y + o.h / 2;
                const rx = Math.abs(o.w / 2);
                const ry = Math.abs(o.h / 2);
                return (
                  <ellipse
                    key={o.id}
                    cx={cx} cy={cy} rx={rx} ry={ry}
                    fill={objFill}
                    fillOpacity={objOpacity}
                    stroke={o.color}
                    strokeWidth={o.strokeWidth || 2}
                    strokeOpacity={objOpacity}
                    style={lockedStyle}
                  />
                );
              }
              if (o.type === "line") {
                return (
                  <line
                    key={o.id}
                    x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2}
                    stroke={o.color}
                    strokeWidth={o.strokeWidth || 2}
                    strokeLinecap="round"
                    style={selStyle}
                  />
                );
              }
              if (o.type === "arrow") {
                return (
                  <line
                    key={o.id}
                    x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2}
                    stroke={o.color}
                    strokeWidth={o.strokeWidth || 2}
                    strokeLinecap="round"
                    markerEnd="url(#wb-arrow)"
                    style={{ color: o.color, ...selStyle }}
                  />
                );
              }
              if (o.type === "path") {
                const d = o.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                return (
                  <path
                    key={o.id}
                    d={d}
                    fill="none"
                    stroke={o.color}
                    strokeWidth={o.strokeWidth || 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={selStyle}
                  />
                );
              }
              if (o.type === "text") {
                if (editingTextId === o.id) return null;
                // Drag preview (in-progress text box)
                if (drawingObject && drawingObject.id === o.id) {
                  const x = Math.min(o.x, o.x + o.w);
                  const y = Math.min(o.y, o.y + o.h);
                  const w = Math.abs(o.w);
                  const h = Math.abs(o.h);
                  return (
                    <rect
                      key={o.id}
                      x={x} y={y} width={w} height={h}
                      fill="rgba(59,130,246,0.04)"
                      stroke="rgba(59,130,246,0.7)"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      rx={3}
                    />
                  );
                }
                // Use foreignObject to allow text wrapping within the box width
                const tw = Math.max(o.w || 200, 50);
                const th = Math.max(o.h || (o.fontSize || 18) * 1.6, 20);
                return (
                  <foreignObject
                    key={o.id}
                    x={o.x}
                    y={o.y}
                    width={tw}
                    height={th}
                    style={{ ...selStyle, overflow: "visible" }}
                  >
                    <div
                      xmlns="http://www.w3.org/1999/xhtml"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (tool === "select") {
                          setEditingTextId(o.id);
                          setSelectedIds([o.id]);
                        }
                      }}
                      style={{
                        color: o.color,
                        fontSize: `${o.fontSize || 18}px`,
                        fontFamily: o.fontFamily || "Inter, system-ui, sans-serif",
                        textAlign: o.textAlign || "left",
                        lineHeight: 1.3,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        padding: "2px",
                        width: "100%",
                        height: "100%",
                        cursor: tool === "select" ? "text" : "default",
                        pointerEvents: "auto",
                      }}
                      dangerouslySetInnerHTML={{ __html: o.text || "" }}
                    />
                  </foreignObject>
                );
              }
              return null;
            })}
          </g>
        </svg>

        {/* Text edit overlay (contentEditable for rich text) */}
        {editingTextId && (() => {
          const o = objects.find(o => o.id === editingTextId);
          if (!o) return null;
          const sx = o.x * viewport.zoom + viewport.x;
          const sy = o.y * viewport.zoom + viewport.y;
          return (
            <div
              ref={editingTextRef}
              contentEditable
              suppressContentEditableWarning
              autoFocus
              onBlur={(e) => finishTextEdit(o.id, e.currentTarget.innerHTML)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.currentTarget.blur(); }
                // Cmd/Ctrl + Enter to commit (Enter alone allows new paragraphs)
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur(); }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: o.text || "" }}
              className="absolute bg-[#1e1f20]/95 border-2 border-blue-400/60 rounded px-1.5 py-1 outline-none text-gray-100 overflow-auto"
              style={{
                left: sx,
                top: sy,
                width: Math.max((o.w || 200) * viewport.zoom, 80),
                minHeight: Math.max((o.h || 30) * viewport.zoom, (o.fontSize || 18) * viewport.zoom * 1.4),
                color: o.color,
                fontSize: (o.fontSize || 18) * viewport.zoom,
                fontFamily: o.fontFamily || "Inter, system-ui, sans-serif",
                textAlign: o.textAlign || "left",
                lineHeight: 1.3,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
              data-placeholder="Type something..."
            />
          );
        })()}

        {/* Minimap */}
        <Minimap
          objects={objects}
          viewport={viewport}
          setViewport={setViewport}
          containerSize={containerSize}
        />

        {/* Empty hint */}
        {objects.length === 0 && !drawingObject && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-700">
              <Pencil className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Pick a tool and start drawing</p>
              <p className="text-[10px] mt-1 opacity-70">V select · P pen · T text · R rect · O ellipse · A arrow</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
