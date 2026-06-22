// ─── Constants ─────────────────────────────────────────────────────
export const COLORS = ["#e5e7eb", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
export const STROKE_WIDTHS = [1.5, 3, 5, 8];
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

// ─── Text Ribbon fonts ─────────────────────────────────────────────
export const FONT_FAMILIES = [
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

export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];

export const BOX_TYPES = ["text", "rect", "ellipse", "triangle", "diamond", "roundedRect", "star"];

export function execCmd(cmd, value) {
  try {
    document.execCommand(cmd, false, value);
  } catch {}
}

// ─── Stroke style ───────────────────────────────────────────────────
export const STROKE_STYLES = ["solid", "dashed", "dotted"];

// Resolve an object's stroke dasharray. Honors an explicit `strokeDasharray`
// override, otherwise derives one from the `strokeStyle` keyword. Scales the
// dash pattern with stroke width so it reads well at any thickness. Returns
// undefined for a solid stroke (the SVG default).
export function strokeDashArray(o) {
  if (o.strokeDasharray) return o.strokeDasharray;
  const sw = o.strokeWidth || 2;
  switch (o.strokeStyle) {
    case "dashed":
      return `${sw * 3} ${sw * 2}`;
    case "dotted":
      return `${sw} ${sw * 2}`;
    default:
      return undefined;
  }
}

// Resolve fill / stroke opacity, falling back to the legacy single `opacity`
// (then to fully opaque) so older objects keep rendering as before.
export function fillOpacityOf(o) {
  return o.fillOpacity ?? o.opacity ?? 1;
}
export function strokeOpacityOf(o) {
  return o.strokeOpacity ?? o.opacity ?? 1;
}

// ─── Helpers ───────────────────────────────────────────────────────
export function shiftObj(o, dx, dy) {
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

export function objectBounds(o) {
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

export function pointInBounds(px, py, b, pad = 4) {
  return px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;
}

export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Rotate a point (px,py) around center (cx,cy) by `deg` degrees.
export function rotatePt(px, py, cx, cy, deg) {
  if (!deg) return { x: px, y: py };
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function hitTest(o, x, y, tolerance = 8) {
  // For rotated box objects, inverse-rotate the test point into the object's local frame.
  if (o.rotation && BOX_TYPES.includes(o.type)) {
    const b = objectBounds(o);
    const p = rotatePt(x, y, b.x + b.w / 2, b.y + b.h / 2, -o.rotation);
    x = p.x; y = p.y;
  }
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

export function worldToScreen(wx, wy, viewport) {
  return { x: wx * viewport.zoom + viewport.x, y: wy * viewport.zoom + viewport.y };
}

export const GRID_SIZE = 20;

// Snap a single scalar to the grid.
export function snap(v, size = GRID_SIZE) {
  return Math.round(v / size) * size;
}

// Snap an object's coordinates to the grid (box, line/arrow, path).
export function snapObj(o, size = GRID_SIZE) {
  switch (o.type) {
    case "text":
    case "rect":
    case "ellipse":
    case "triangle":
    case "diamond":
    case "roundedRect":
    case "star":
      return { ...o, x: snap(o.x, size), y: snap(o.y, size) };
    case "line":
    case "arrow":
      return { ...o, x1: snap(o.x1, size), y1: snap(o.y1, size), x2: snap(o.x2, size), y2: snap(o.y2, size) };
    case "path":
      return { ...o, points: (o.points || []).map(p => ({ x: snap(p.x, size), y: snap(p.y, size) })) };
    default:
      return o;
  }
}
