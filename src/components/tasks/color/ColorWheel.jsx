import React, { useEffect, useRef, useState, useCallback } from "react";
import { hexToHsv, hsvToHex } from "./colorMath";

// Hue ring with a saturation/value square inside. Drag the ring to change hue,
// drag the square to change saturation (x) and value (y). Calls onChange on every
// move and onCommit when the pointer is released.
const SIZE = 168;
const OUTER = SIZE / 2 - 2;
const INNER = OUTER - 18;
const HALF = Math.floor((INNER * Math.SQRT1_2) - 3);

export default function ColorWheel({ value, onChange, onCommit }) {
  const canvasRef = useRef(null);
  const [hsv, setHsv] = useState(() => hexToHsv(value) || { h: 210, s: 0.8, v: 0.9 });
  const modeRef = useRef(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // Follow the current color while the user isn't dragging.
  useEffect(() => {
    if (modeRef.current) return;
    const next = hexToHsv(value);
    if (next && hsvToHex(next) !== hsvToHex(hsvRef.current)) setHsv(next);
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    const cx = SIZE / 2, cy = SIZE / 2;

    // Hue ring
    for (let a = 0; a < 360; a += 1) {
      const start = ((a - 90 - 0.6) * Math.PI) / 180;
      const end = ((a - 90 + 0.6) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, OUTER, start, end);
      ctx.arc(cx, cy, INNER, end, start, true);
      ctx.closePath();
      ctx.fillStyle = `hsl(${a} 100% 50%)`;
      ctx.fill();
    }

    // SV square
    const x0 = cx - HALF, y0 = cy - HALF, side = HALF * 2;
    ctx.fillStyle = `hsl(${hsv.h} 100% 50%)`;
    ctx.fillRect(x0, y0, side, side);
    const gWhite = ctx.createLinearGradient(x0, 0, x0 + side, 0);
    gWhite.addColorStop(0, "rgba(255,255,255,1)");
    gWhite.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gWhite;
    ctx.fillRect(x0, y0, side, side);
    const gBlack = ctx.createLinearGradient(0, y0, 0, y0 + side);
    gBlack.addColorStop(0, "rgba(0,0,0,0)");
    gBlack.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = gBlack;
    ctx.fillRect(x0, y0, side, side);

    // Markers
    const ha = ((hsv.h - 90) * Math.PI) / 180;
    const hr = (OUTER + INNER) / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ha) * hr, cy + Math.sin(ha) * hr, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const mx = x0 + hsv.s * side, my = y0 + (1 - hsv.v) * side;
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.strokeStyle = hsv.v > 0.6 && hsv.s < 0.5 ? "rgba(0,0,0,0.8)" : "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [hsv]);

  const apply = useCallback((next, commit) => {
    setHsv(next);
    const hex = hsvToHex(next);
    if (commit) onCommit?.(hex); else onChange?.(hex);
  }, [onChange, onCommit]);

  const update = useCallback((e, mode) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - SIZE / 2;
    const y = e.clientY - rect.top - SIZE / 2;
    const cur = hsvRef.current;
    if (mode === "hue") {
      let h = (Math.atan2(y, x) * 180) / Math.PI + 90;
      if (h < 0) h += 360;
      return { ...cur, h };
    }
    const s = Math.max(0, Math.min(1, (x + HALF) / (HALF * 2)));
    const v = Math.max(0, Math.min(1, 1 - (y + HALF) / (HALF * 2)));
    return { ...cur, s, v };
  }, []);

  const onPointerDown = (e) => {
    // Keep the editor's selection: no focus change, no mousedown bubbling.
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - SIZE / 2;
    const y = e.clientY - rect.top - SIZE / 2;
    const d = Math.hypot(x, y);
    let mode = null;
    if (Math.abs(x) <= HALF && Math.abs(y) <= HALF) mode = "sv";
    else if (d >= INNER - 3 && d <= OUTER + 3) mode = "hue";
    if (!mode) return;
    modeRef.current = mode;
    canvasRef.current.setPointerCapture(e.pointerId);
    apply(update(e, mode), false);
  };
  const onPointerMove = (e) => {
    if (!modeRef.current) return;
    e.preventDefault();
    apply(update(e, modeRef.current), false);
  };
  const onPointerUp = (e) => {
    if (!modeRef.current) return;
    const mode = modeRef.current;
    modeRef.current = null;
    try { canvasRef.current.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    apply(update(e, mode), true);
  };

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{ width: SIZE, height: SIZE, touchAction: "none", cursor: "crosshair" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      aria-label="Color wheel"
    />
  );
}
