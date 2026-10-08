import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripVertical, ChevronsLeft, ChevronsRight } from "lucide-react";

// TradingView-style floating tool dock: a grip on the left drags it anywhere on
// the board (position remembered), a chevron collapses it to a small pill, and
// a double-tap on the grip snaps it back to the top-center default.
//
// `children` is the dock body (toolbar row + any contextual row); `collapsedIcon`
// is what the collapsed pill shows (the active tool) so you can still see it.

const POS_KEY = "wb_dock_pos";
const COLLAPSED_KEY = "wb_dock_collapsed";
const MARGIN = 6;

function readPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch { return null; }
}

export default function FloatingDock({ children, collapsedIcon = null }) {
  const parts = React.Children.toArray(children);
  const dockRef = useRef(null);
  const dragRef = useRef(null);
  const lastTapRef = useRef(0);
  const [pos, setPos] = useState(readPos); // null = top-center default
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; }
  });

  // Keep the dock fully on the board (after drags, resizes, rotation, and when
  // its own size changes — e.g. a formatting row opens).
  const clamp = useCallback((p) => {
    const dock = dockRef.current;
    const parent = dock?.offsetParent;
    if (!dock || !parent || !p) return p;
    const maxX = Math.max(MARGIN, parent.clientWidth - dock.offsetWidth - MARGIN);
    const maxY = Math.max(MARGIN, parent.clientHeight - dock.offsetHeight - MARGIN);
    return { x: Math.min(Math.max(MARGIN, p.x), maxX), y: Math.min(Math.max(MARGIN, p.y), maxY) };
  }, []);

  useLayoutEffect(() => {
    if (!pos) return;
    const c = clamp(pos);
    if (c && (c.x !== pos.x || c.y !== pos.y)) setPos(c);
  });

  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [clamp]);

  const save = (p) => {
    try {
      if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
      else localStorage.removeItem(POS_KEY);
    } catch { /* private mode */ }
  };

  const toggleCollapsed = (e) => {
    e.stopPropagation();
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1"); } catch { /* ignore */ }
      return !c;
    });
  };

  const onGripDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap → back to the default spot.
      lastTapRef.current = 0;
      setPos(null);
      save(null);
      return;
    }
    lastTapRef.current = now;
    const dock = dockRef.current;
    if (!dock) return;
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: dock.offsetLeft,
      originY: dock.offsetTop,
      moved: false,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onGripMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    d.moved = true;
    setPos(clamp({ x: d.originX + dx, y: d.originY + dy }));
  };

  const onGripUp = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d.moved) setPos((p) => { save(p); return p; });
  };

  const style = pos
    ? { left: pos.x, top: pos.y }
    : { left: "50%", top: 8, transform: "translateX(-50%)" };

  return (
    <div
      ref={dockRef}
      className="absolute z-30 flex w-max max-w-[calc(100%-12px)] flex-col items-start gap-1.5"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex max-w-full items-stretch rounded-xl border border-white/[0.1] bg-[#252628] shadow-2xl">
        <button
          type="button"
          aria-label="Move toolbar (double-tap to reset)"
          title="Drag to move · double-tap to reset"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-xl text-gray-500 hover:bg-white/[0.05] hover:text-gray-300 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {collapsed ? (
          collapsedIcon && <div className="flex items-center px-1">{collapsedIcon}</div>
        ) : (
          <div className="flex min-w-0 flex-1">{parts[0]}</div>
        )}

        <button
          type="button"
          aria-label={collapsed ? "Expand toolbar" : "Collapse toolbar"}
          title={collapsed ? "Expand toolbar" : "Collapse toolbar"}
          onClick={toggleCollapsed}
          className="flex w-6 shrink-0 items-center justify-center rounded-r-xl border-l border-white/[0.06] text-gray-500 hover:bg-white/[0.05] hover:text-gray-300"
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Contextual rows (formatting, selection, image) hang under the dock and move with it. */}
      {!collapsed && parts.slice(1)}
    </div>
  );
}
