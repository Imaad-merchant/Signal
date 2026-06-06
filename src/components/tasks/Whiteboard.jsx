import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MousePointer2, Hand, Pencil, Type, Square, Circle, ArrowRight, Eraser, Trash2, ZoomIn, ZoomOut, Maximize2, Undo2, Redo2, Minus, Grid3x3, Eye, EyeOff, Palette as PaletteIcon, ChevronDown } from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────
const COLORS = ["#e5e7eb", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
const STROKE_WIDTHS = [1.5, 3, 5, 8];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

// Generate a stable id
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
function objectBounds(o) {
  switch (o.type) {
    case "text":
      return { x: o.x, y: o.y, w: o.w || 200, h: o.h || (o.fontSize || 18) * 1.4 };
    case "rect":
    case "ellipse":
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
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          pushHistory(objects);
          setObjects(prev => prev.filter(o => !selectedIds.includes(o.id)));
          setSelectedIds([]);
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
  }, [handleUndo, handleRedo, selectedIds, objects, pushHistory, editingTextId]);

  // ─── Pointer handlers ────────────────────────────────────────────
  const handlePointerDown = (e) => {
    if (e.button === 1 || (tool === "hand" && e.button === 0)) {
      setPanning(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (editingTextId) return;
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (tool === "select") {
      // Hit test
      const hit = [...objects].reverse().find(o => hitTest(o, x, y));
      if (hit) {
        if (!selectedIds.includes(hit.id)) {
          setSelectedIds(e.shiftKey ? [...selectedIds, hit.id] : [hit.id]);
        }
        setDraggingSelection({
          startX: x,
          startY: y,
          originals: objects.filter(o => (e.shiftKey ? [...selectedIds, hit.id] : selectedIds.includes(hit.id) ? selectedIds : [hit.id]).includes(o.id))
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
      const newObj = { id: uid(), type: "text", x, y, w: 200, h: fontSize * 1.5, text: "", color, fontSize };
      setObjects(prev => [...prev, newObj]);
      setEditingTextId(newObj.id);
      setSelectedIds([newObj.id]);
      setTool("select");
      return;
    }

    if (tool === "rect" || tool === "ellipse") {
      pushHistory(objects);
      setDrawingObject({ id: uid(), type: tool, x, y, w: 0, h: 0, color, strokeWidth });
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
      } else if (drawingObject.type === "rect" || drawingObject.type === "ellipse") {
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
      const obj = drawingObject;
      setDrawingObject(null);
      // Don't add zero-size objects
      if (obj.type === "rect" || obj.type === "ellipse") {
        if (Math.abs(obj.w) < 2 && Math.abs(obj.h) < 2) return;
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

  // Cancel text edit on blur
  const finishTextEdit = (id, newText) => {
    if (!newText.trim()) {
      setObjects(prev => prev.filter(o => o.id !== id));
    } else {
      setObjects(prev => prev.map(o => o.id === id ? { ...o, text: newText } : o));
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
        onContextMenu={(e) => e.preventDefault()}
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

              if (o.type === "rect") {
                const x = Math.min(o.x, o.x + o.w);
                const y = Math.min(o.y, o.y + o.h);
                const w = Math.abs(o.w);
                const h = Math.abs(o.h);
                return (
                  <rect
                    key={o.id}
                    x={x} y={y} width={w} height={h}
                    fill={o.color + "20"}
                    stroke={o.color}
                    strokeWidth={o.strokeWidth || 2}
                    rx={4}
                    style={selStyle}
                  />
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
                    fill={o.color + "20"}
                    stroke={o.color}
                    strokeWidth={o.strokeWidth || 2}
                    style={selStyle}
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
                return (
                  <text
                    key={o.id}
                    x={o.x}
                    y={o.y + (o.fontSize || 18)}
                    fill={o.color}
                    fontSize={o.fontSize || 18}
                    fontFamily="Inter, system-ui, sans-serif"
                    style={selStyle}
                  >
                    {o.text || ""}
                  </text>
                );
              }
              return null;
            })}
          </g>
        </svg>

        {/* Text edit overlay */}
        {editingTextId && (() => {
          const o = objects.find(o => o.id === editingTextId);
          if (!o) return null;
          const sx = o.x * viewport.zoom + viewport.x;
          const sy = o.y * viewport.zoom + viewport.y;
          return (
            <textarea
              autoFocus
              defaultValue={o.text || ""}
              onBlur={(e) => finishTextEdit(o.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.target.blur(); }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
              }}
              className="absolute bg-[#2a2b2d]/80 border border-blue-400/40 rounded px-1 py-0.5 outline-none resize text-gray-100 overflow-hidden"
              style={{
                left: sx,
                top: sy,
                color: o.color,
                fontSize: (o.fontSize || 18) * viewport.zoom,
                fontFamily: "Inter, system-ui, sans-serif",
                minWidth: 100 * viewport.zoom,
                lineHeight: 1.2,
              }}
              placeholder="Type something..."
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
