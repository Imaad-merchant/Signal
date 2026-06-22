import React, { useState, useRef, useEffect, useMemo } from "react";
import { objectBounds, MIN_ZOOM, MAX_ZOOM } from "./geometry";

// ─── Minimap ──────────────────────────────────────────────────────
export default function Minimap({ objects, viewport, containerSize, setViewport, contentBounds }) {
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
