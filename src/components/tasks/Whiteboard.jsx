import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Pencil, ZoomIn, ZoomOut, Maximize2, RotateCw } from "lucide-react";
import AIPromptDialog from "./AIPromptDialog";
import { base44 } from "@/api/base44Client";
import { useIsMobile } from "@/components/useIsMobile";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  BOX_TYPES,
  rotatePt,
  objectBounds,
  shiftObj,
  hitTest,
  worldToScreen,
  snap,
  snapObj,
  GRID_SIZE,
} from "./whiteboard/geometry";
import Toolbar from "./whiteboard/Toolbar";
import SelectionBar from "./whiteboard/SelectionBar";
import TextRibbon from "./whiteboard/TextRibbon";
import WhiteboardContextMenu from "./whiteboard/WhiteboardContextMenu";
import Minimap from "./whiteboard/Minimap";

// Generate a stable id
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ─── Main Whiteboard ──────────────────────────────────────────────
export default function Whiteboard({ page, onUpdate, headerSlot }) {
  const containerRef = useRef(null);
  const isMobile = useIsMobile();
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
  const dragHistoryRef = useRef(false); // whether a history snapshot was pushed for the active drag
  const [marquee, setMarquee] = useState(null); // { startX, startY, x, y } in world coords
  const eraseHistoryRef = useRef(false); // whether a history snapshot was pushed for the active erase-drag
  const lastPointer = useRef(null); // last screen pointer pos, for touch-friendly panning
  const pointers = useRef(new Map()); // active pointers (for pinch-zoom)
  const pinchRef = useRef(null); // { startDist, startMid, startViewport }
  const [editingTextId, setEditingTextId] = useState(null);

  const saveTimer = useRef(null);
  const loadedRef = useRef(false);
  const skipSaveRef = useRef(false); // suppress the save triggered by loading a page
  const editingTextRef = useRef(null);

  // ─── AI prompt state ─────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const runAI = useCallback(async (prompt, mode = "create") => {
    setAiLoading(true);
    try {
      const res = await base44.functions.invoke("aiCanvas", {
        prompt,
        existingObjects: objects,
        mode,
      });
      const actions = res.data?.actions || [];
      if (actions.length === 0) { setAiLoading(false); setAiOpen(false); return; }
      // Snapshot the pre-change state for undo, using the live objects array
      // (snapshot BEFORE applying so undo restores the canvas as it was).
      pushHistory(objects);
      setObjects(prev => {
        let next = [...prev];
        for (const a of actions) {
          if (a.action === "add" && a.object) {
            next.push(a.object);
          } else if (a.action === "move" && a.id) {
            next = next.map(o => o.id === a.id ? { ...o, ...(a.x !== undefined ? { x: a.x } : {}), ...(a.y !== undefined ? { y: a.y } : {}), ...(a.w !== undefined ? { w: a.w } : {}), ...(a.h !== undefined ? { h: a.h } : {}) } : o);
          }
        }
        return next;
      });
      setAiOpen(false);
    } catch (e) {
      console.error("aiCanvas failed", e);
      alert("AI failed. Try again.");
    } finally {
      setAiLoading(false);
    }
  }, [objects]);

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
      const sel = new Set(effectiveSelectionIds);
      // Shift the whole selection forward by exactly one slot relative to
      // non-selected items: for each maximal run of selected items, swap the
      // single non-selected item directly after the run with the run (i.e. move
      // that separator before the run). Processing top-down avoids leapfrogging.
      let i = arr.length - 1;
      while (i >= 0) {
        if (!sel.has(arr[i].id)) { i--; continue; }
        // [start..i] is a run of selected items ending at i.
        let start = i;
        while (start - 1 >= 0 && sel.has(arr[start - 1].id)) start--;
        // If a non-selected item sits right after the run, move it before the run.
        if (i + 1 < arr.length && !sel.has(arr[i + 1].id)) {
          const [mover] = arr.splice(i + 1, 1);
          arr.splice(start, 0, mover);
        }
        i = start - 1;
      }
      return arr;
    });
  }, [effectiveSelectionIds, objects]);

  const sendBackward = useCallback(() => {
    if (effectiveSelectionIds.length === 0) return;
    pushHistory(objects);
    setObjects(prev => {
      const arr = [...prev];
      const sel = new Set(effectiveSelectionIds);
      // Mirror of bringForward: for each maximal run of selected items, move the
      // single non-selected item directly before the run to just after the run.
      let i = 0;
      while (i < arr.length) {
        if (!sel.has(arr[i].id)) { i++; continue; }
        let end = i;
        while (end + 1 < arr.length && sel.has(arr[end + 1].id)) end++;
        if (i - 1 >= 0 && !sel.has(arr[i - 1].id)) {
          const [mover] = arr.splice(i - 1, 1);
          arr.splice(end, 0, mover); // end shifted left by 1 after splice → lands after run
        }
        i = end + 1;
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
    if (snapToGrid) { atX = snap(atX); atY = snap(atY); }
    const newObj = shapeType === "text"
      ? { id: uid(), type: "text", x: atX, y: atY, w: 220, h: fontSize * 1.6, text: "Text", color, fontSize }
      : shapeType === "sticky"
      ? { id: uid(), type: "rect", x: atX, y: atY, w: 160, h: 160, color: "#fde047", strokeWidth: 2, fill: "rgba(253, 224, 71, 0.2)" }
      : { id: uid(), type: shapeType, x: atX, y: atY, w: 120, h: 80, color, strokeWidth };
    setObjects(prev => [...prev, newObj]);
    setSelectedIds([newObj.id]);
  }, [color, fontSize, strokeWidth, objects, snapToGrid]);

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
    // Restore persisted viewport if present, else reset.
    let restored = { x: 0, y: 0, zoom: 1 };
    if (page.viewport) {
      try {
        const v = typeof page.viewport === "string" ? JSON.parse(page.viewport) : page.viewport;
        if (v && typeof v.x === "number" && typeof v.y === "number" && typeof v.zoom === "number") {
          restored = { x: v.x, y: v.y, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom)) };
        }
      } catch { /* ignore malformed viewport */ }
    }
    setViewport(restored);
    setSelectedIds([]);
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion(v => v + 1);
    loadedRef.current = true;
    // Skip the save that the above setObjects/setViewport will trigger, so merely
    // opening a page doesn't write the data straight back (which would bump
    // updated_date and reorder the page list).
    skipSaveRef.current = true;
  }, [page.id]);

  // Auto-save objects to page (debounced)
  useEffect(() => {
    if (!loadedRef.current) return;
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate({ whiteboard: JSON.stringify(objects), viewport: JSON.stringify(viewport) });
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [objects, viewport, onUpdate]);

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
      // Skip if the user is typing in an input, textarea, contentEditable, or any modal
      const t = e.target;
      const tag = (t?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (t?.closest && t.closest("[data-ai-dialog]")) return;
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
        return;
      }
      // Escape: deselect everything
      if (e.key === "Escape") {
        if (selectedIds.length > 0) { e.preventDefault(); setSelectedIds([]); }
        return;
      }
      // Arrow keys: nudge selection (1px, or 10px with Shift)
      if (!mod && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        if (effectiveSelectionIds.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        // Only snapshot on the initial press, not on OS key-repeat, so holding an
        // arrow key produces a single undo entry rather than one per pixel.
        if (!e.repeat) pushHistory(objects);
        setObjects(prev => prev.map(o => effectiveSelectionIds.includes(o.id) ? shiftObj(o, dx, dy) : o));
        return;
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
  }, [handleUndo, handleRedo, selectedIds, effectiveSelectionIds, objects, editingTextId, copySelection, pasteClipboard, deleteSelection, duplicateSelection, groupSelection, ungroupSelection, pushHistory]);

  // ─── Pointer handlers ────────────────────────────────────────────
  const handlePointerDown = (e) => {
    // Right-click handled by onContextMenu, not here
    if (e.button === 2) return;

    // Track pointers for pinch-zoom
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Second finger down → start a pinch, cancelling any single-finger action.
      const pts = [...pointers.current.values()];
      const rect = containerRef.current.getBoundingClientRect();
      pinchRef.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        startMid: { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top },
        startViewport: { ...viewport },
      };
      setPanning(false);
      setDraggingSelection(null);
      setDrawingObject(null);
      setMarquee(null);
      return;
    }
    if (pinchRef.current) return; // already pinching

    if (e.button === 1 || (tool === "hand" && e.button === 0)) {
      setPanning(true);
      lastPointer.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (editingTextId) return;
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (tool === "select") {
      // Hit test (skip locked unless directly clicked already-selected).
      // Divide tolerance by zoom so the slop stays constant in screen pixels.
      const hit = [...objects].reverse().find(o => !o.locked && hitTest(o, x, y, 8 / viewport.zoom));
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
        // Defer the history snapshot until the drag actually moves, so a plain
        // select-click without movement doesn't spam the undo stack.
        dragHistoryRef.current = false;
        setDraggingSelection({
          startX: x,
          startY: y,
          originals: objects.filter(o => dragIds.includes(o.id))
            .map(o => ({ id: o.id, snapshot: JSON.parse(JSON.stringify(o)) })),
        });
      } else {
        // Click on empty canvas:
        //  - touch: pan (one finger drag feels natural on mobile)
        //  - mouse/pen: rubber-band marquee to select intersecting objects
        setSelectedIds([]);
        if (e.pointerType === "touch") {
          setPanning(true);
          lastPointer.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } else {
          setMarquee({ startX: x, startY: y, x, y });
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }
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
      // Track whether a snapshot has been pushed for this erase gesture so a
      // drag that only starts deleting after the initial press still records undo.
      eraseHistoryRef.current = false;
      const hit = [...objects].reverse().find(o => hitTest(o, x, y, 8 / viewport.zoom));
      if (hit) {
        pushHistory(objects);
        eraseHistoryRef.current = true;
        setObjects(prev => prev.filter(o => o.id !== hit.id));
      }
      return;
    }
  };

  const handlePointerMove = (e) => {
    // Two-finger pinch: zoom + pan around the fingers' midpoint (TradingView-style).
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const rect = containerRef.current.getBoundingClientRect();
      const curMid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top };
      const { startDist, startMid, startViewport } = pinchRef.current;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, startViewport.zoom * (curDist / startDist)));
      const wx = (startMid.x - startViewport.x) / startViewport.zoom;
      const wy = (startMid.y - startViewport.y) / startViewport.zoom;
      setViewport({ x: curMid.x - wx * newZoom, y: curMid.y - wy * newZoom, zoom: newZoom });
      return;
    }

    if (panning) {
      // Track delta manually — pointer movementX/Y is unreliable for touch.
      const last = lastPointer.current || { x: e.clientX, y: e.clientY };
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setViewport(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }

    if (draggingSelection) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      let dx = x - draggingSelection.startX;
      let dy = y - draggingSelection.startY;
      // Snap the drag delta to the grid (keeps relative offsets within a multi-selection).
      if (snapToGrid) { dx = snap(dx); dy = snap(dy); }
      // Push a single history snapshot the first time the drag actually moves.
      if (!dragHistoryRef.current && (dx !== 0 || dy !== 0)) {
        dragHistoryRef.current = true;
        pushHistory(objects);
      }
      setObjects(prev => prev.map(o => {
        const orig = draggingSelection.originals.find(s => s.id === o.id);
        if (!orig) return o;
        return shiftObj(orig.snapshot, dx, dy);
      }));
      return;
    }

    if (marquee) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      setMarquee(m => m ? { ...m, x, y } : m);
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
      const hit = [...objects].reverse().find(o => hitTest(o, x, y, 8 / viewport.zoom));
      if (hit) {
        // Push a snapshot once per erase gesture, even if the initial press missed.
        if (!eraseHistoryRef.current) {
          eraseHistoryRef.current = true;
          pushHistory(objects);
        }
        setObjects(prev => prev.filter(o => o.id !== hit.id));
      }
    }
  };

  const handlePointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (panning) { setPanning(false); lastPointer.current = null; return; }
    if (draggingSelection) {
      dragHistoryRef.current = false;
      setDraggingSelection(null);
      return;
    }
    if (tool === "eraser") { eraseHistoryRef.current = false; }
    if (marquee) {
      // Select every object whose bounds intersect the rubber-band rectangle.
      const mx = Math.min(marquee.startX, marquee.x);
      const my = Math.min(marquee.startY, marquee.y);
      const mw = Math.abs(marquee.x - marquee.startX);
      const mh = Math.abs(marquee.y - marquee.startY);
      setMarquee(null);
      // A tiny marquee is treated as a plain click on empty space (deselect only).
      if (mw < 3 && mh < 3) { setSelectedIds([]); return; }
      const hits = objects.filter(o => {
        if (o.locked) return false;
        const b = objectBounds(o);
        return b.x < mx + mw && b.x + b.w > mx && b.y < my + mh && b.y + b.h > my;
      });
      // Expand selection to include full groups.
      const ids = new Set();
      for (const o of hits) {
        if (o.groupId) objects.filter(g => g.groupId === o.groupId).forEach(g => ids.add(g.id));
        else ids.add(o.id);
      }
      setSelectedIds(Array.from(ids));
      return;
    }
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
        if (snapToGrid) obj = snapObj(obj);
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
      if (snapToGrid) obj = snapObj(obj);
      setObjects(prev => [...prev, obj]);
    }
  };

  // Per-handle anchor config: ax/ay = anchor point as fraction of the box,
  // sx/sy = direction from anchor to center, dimX/dimY = which dimensions resize.
  const HANDLE_CFG = {
    se: { ax: 0,   ay: 0,   sx: 1,  sy: 1,  dimX: 1, dimY: 1 },
    sw: { ax: 1,   ay: 0,   sx: -1, sy: 1,  dimX: 1, dimY: 1 },
    ne: { ax: 0,   ay: 1,   sx: 1,  sy: -1, dimX: 1, dimY: 1 },
    nw: { ax: 1,   ay: 1,   sx: -1, sy: -1, dimX: 1, dimY: 1 },
    e:  { ax: 0,   ay: 0.5, sx: 1,  sy: 0,  dimX: 1, dimY: 0 },
    w:  { ax: 1,   ay: 0.5, sx: -1, sy: 0,  dimX: 1, dimY: 0 },
    n:  { ax: 0.5, ay: 1,   sx: 0,  sy: -1, dimX: 0, dimY: 1 },
    s:  { ax: 0.5, ay: 0,   sx: 0,  sy: 1,  dimX: 0, dimY: 1 },
  };

  // Start a resize/rotate gesture from a selection handle (mouse or touch).
  // Uses document listeners so it's robust against implicit touch pointer capture.
  const startTransform = (e, mode, handle, obj) => {
    e.stopPropagation();
    e.preventDefault?.();
    pushHistory(objects);
    const b = objectBounds(obj);
    const oc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const r = obj.rotation || 0;
    const id = obj.id;
    const start = screenToWorld(e.clientX, e.clientY);
    const startAngle = Math.atan2(start.y - oc.y, start.x - oc.x) * 180 / Math.PI;
    setSelectedIds([id]);

    const onMove = (ev) => {
      const { x, y } = screenToWorld(ev.clientX, ev.clientY);
      if (mode === "rotate") {
        const ang = Math.atan2(y - oc.y, x - oc.x) * 180 / Math.PI;
        let rotation = r + (ang - startAngle);
        if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15;
        setObjects(prev => prev.map(o => o.id === id ? { ...o, rotation } : o));
        return;
      }
      // Anchored (PowerPoint-style) resize: the opposite corner/edge stays put.
      const cfg = HANDLE_CFG[handle];
      const anchorStored = { x: b.x + cfg.ax * b.w, y: b.y + cfg.ay * b.h };
      const anchorVisual = rotatePt(anchorStored.x, anchorStored.y, oc.x, oc.y, r);
      const d = rotatePt(x - anchorVisual.x, y - anchorVisual.y, 0, 0, -r); // un-rotate the drag vector
      let newW = cfg.dimX ? Math.max(8, Math.abs(d.x)) : b.w;
      let newH = cfg.dimY ? Math.max(8, Math.abs(d.y)) : b.h;
      if (snapToGrid) {
        if (cfg.dimX) newW = Math.max(GRID_SIZE, snap(newW));
        if (cfg.dimY) newH = Math.max(GRID_SIZE, snap(newH));
      }
      const offWorld = rotatePt(cfg.sx * newW / 2, cfg.sy * newH / 2, 0, 0, r);
      const cx = anchorVisual.x + offWorld.x;
      const cy = anchorVisual.y + offWorld.y;
      setObjects(prev => prev.map(o => o.id === id
        ? { ...o, x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH }
        : o));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  // Wheel: zoom — attached via useEffect with passive:false so preventDefault works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      // Block ALL wheel events from bubbling to the page
      e.preventDefault();
      e.stopPropagation();
      // ctrl/⌘ + wheel (and trackpad pinch, which the browser reports as ctrlKey
      // wheel events) = zoom; a plain wheel/two-finger swipe = pan.
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const delta = -e.deltaY * 0.0015;
        setViewport(v => {
          const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * (1 + delta)));
          const worldX = (mx - v.x) / v.zoom;
          const worldY = (my - v.y) / v.zoom;
          const newX = mx - worldX * newZoom;
          const newY = my - worldY * newZoom;
          return { x: newX, y: newY, zoom: newZoom };
        });
      } else {
        // Plain wheel: pan by the scroll delta (supports trackpad two-finger panning).
        setViewport(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
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
        className={`relative flex-1 overflow-hidden touch-none ${cursorClass} select-none`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          if (editingTextId) return;
          const { x, y } = screenToWorld(e.clientX, e.clientY);
          const hit = [...objects].reverse().find(o => hitTest(o, x, y, 8 / viewport.zoom));
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
          onAIOpen={() => setAiOpen(true)}
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

        {/* Zoom controls — top-right on desktop, bottom-left (above tab bar) on mobile to avoid the toolbar */}
        <div
          className="absolute z-30 flex items-center gap-1 bg-[#2a2b2d]/95 backdrop-blur border border-white/[0.08] rounded-lg px-1 py-1 shadow-2xl"
          style={isMobile
            ? { left: 12, bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)" }
            : { top: 12, right: 12 }}
        >
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
                    transform={o.rotation ? `rotate(${o.rotation} ${x + w / 2} ${y + h / 2})` : undefined}
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
                  <polygon key={o.id} points={pts} fill={objFill} fillOpacity={objOpacity} stroke={o.color} strokeWidth={o.strokeWidth || 2} strokeOpacity={objOpacity} transform={o.rotation ? `rotate(${o.rotation} ${x + w / 2} ${y + h / 2})` : undefined} style={lockedStyle} />
                );
              }
              if (o.type === "diamond") {
                const x = Math.min(o.x, o.x + o.w);
                const y = Math.min(o.y, o.y + o.h);
                const w = Math.abs(o.w);
                const h = Math.abs(o.h);
                const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
                return (
                  <polygon key={o.id} points={pts} fill={objFill} fillOpacity={objOpacity} stroke={o.color} strokeWidth={o.strokeWidth || 2} strokeOpacity={objOpacity} transform={o.rotation ? `rotate(${o.rotation} ${x + w / 2} ${y + h / 2})` : undefined} style={lockedStyle} />
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
                  <polygon key={o.id} points={pts.join(" ")} fill={objFill} fillOpacity={objOpacity} stroke={o.color} strokeWidth={o.strokeWidth || 2} strokeOpacity={objOpacity} transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} style={lockedStyle} />
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
                    transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined}
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
                    transform={o.rotation ? `rotate(${o.rotation} ${o.x + tw / 2} ${o.y + th / 2})` : undefined}
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
            {/* Rubber-band marquee selection rectangle */}
            {marquee && (
              <rect
                x={Math.min(marquee.startX, marquee.x)}
                y={Math.min(marquee.startY, marquee.y)}
                width={Math.abs(marquee.x - marquee.startX)}
                height={Math.abs(marquee.y - marquee.startY)}
                fill="rgba(59,130,246,0.08)"
                stroke="rgba(59,130,246,0.8)"
                strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`}
              />
            )}
          </g>
        </svg>

        {/* Resize / rotate handles for a single selected box object */}
        {tool === "select" && !editingTextId && !drawingObject && selectedIds.length === 1 && (() => {
          const o = objects.find(ob => ob.id === selectedIds[0]);
          if (!o || !BOX_TYPES.includes(o.type) || o.locked) return null;
          const b = objectBounds(o);
          const oc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          const rot = o.rotation || 0;
          const z = viewport.zoom;
          const w2s = (wx, wy) => {
            const p = rotatePt(wx, wy, oc.x, oc.y, rot);
            return { left: p.x * z + viewport.x, top: p.y * z + viewport.y };
          };
          const handles = [
            { k: "nw", x: b.x, y: b.y }, { k: "n", x: b.x + b.w / 2, y: b.y }, { k: "ne", x: b.x + b.w, y: b.y },
            { k: "e", x: b.x + b.w, y: b.y + b.h / 2 }, { k: "se", x: b.x + b.w, y: b.y + b.h },
            { k: "s", x: b.x + b.w / 2, y: b.y + b.h }, { k: "sw", x: b.x, y: b.y + b.h }, { k: "w", x: b.x, y: b.y + b.h / 2 },
          ];
          const cScr = { left: oc.x * z + viewport.x, top: oc.y * z + viewport.y };
          const topMid = w2s(b.x + b.w / 2, b.y);
          const rdx = topMid.left - cScr.left, rdy = topMid.top - cScr.top;
          const rlen = Math.hypot(rdx, rdy) || 1;
          const rotPos = { left: topMid.left + (rdx / rlen) * 28, top: topMid.top + (rdy / rlen) * 28 };
          const cursorFor = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
          return (
            <>
              {/* rotated bounding box */}
              <div className="absolute pointer-events-none border border-blue-400/80 rounded-sm" style={{
                left: cScr.left, top: cScr.top, width: b.w * z, height: b.h * z,
                transform: `translate(-50%,-50%) rotate(${rot}deg)`,
              }} />
              {handles.map(hd => {
                const s = w2s(hd.x, hd.y);
                return (
                  <div key={hd.k}
                    onPointerDown={(e) => startTransform(e, "resize", hd.k, o)}
                    className="absolute z-40 flex items-center justify-center"
                    style={{ left: s.left, top: s.top, width: 28, height: 28, transform: "translate(-50%,-50%)", cursor: cursorFor[hd.k], touchAction: "none" }}
                  >
                    <div className="rounded-[3px] bg-white border-2 border-blue-500 shadow" style={{ width: 14, height: 14 }} />
                  </div>
                );
              })}
              <div
                onPointerDown={(e) => startTransform(e, "rotate", null, o)}
                className="absolute z-40 flex items-center justify-center"
                style={{ left: rotPos.left, top: rotPos.top, width: 32, height: 32, transform: "translate(-50%,-50%)", cursor: "grab", touchAction: "none" }}
              >
                <div className="rounded-full bg-white border-2 border-blue-500 shadow flex items-center justify-center" style={{ width: 20, height: 20 }}>
                  <RotateCw className="h-3 w-3 text-blue-600" />
                </div>
              </div>
            </>
          );
        })()}

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

        {/* AI Prompt Dialog */}
        <AIPromptDialog
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          loading={aiLoading}
          title="Ask AI on this canvas"
          subtitle="Generate diagrams, charts, or reorganize what's here"
          placeholder="e.g. Build a flowchart for user signup, or 'Make a kanban with To Do / Doing / Done'"
          presets={[
            { label: "↻ Reorganize", prompt: "Reorganize the existing canvas into a clean, aligned layout. Group related items and add connector arrows.", mode: "reorganize" },
            { label: "🧠 Mind map", prompt: "Build a mind map about the central topic. Add a central node and 4-6 branches." },
            { label: "📊 Flow chart", prompt: "Create a flowchart for a typical process. Use rectangles for steps, diamonds for decisions, arrows for flow." },
            { label: "📅 Timeline", prompt: "Create a horizontal timeline with 5 milestones." },
            { label: "🏗 Building blocks", prompt: "Create a stacked building-blocks diagram with 4 layers." },
            { label: "📋 Kanban", prompt: "Create a kanban board with To Do, In Progress, Done columns." },
          ]}
          onSubmit={(p) => runAI(p, p.toLowerCase().includes("reorganize") ? "reorganize" : "create")}
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
