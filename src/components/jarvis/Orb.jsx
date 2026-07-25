import React, { useRef, useEffect } from "react";

// Parse "#rrggbb" -> [r, g, b]; falls back to Signal blue.
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [66, 133, 244];
}

// A glowing particle-sphere "orb" — dependency-free 2D canvas + requestAnimationFrame.
// Props:
//   color        - accent hex, e.g. "#4285f4"
//   speaking     - when true, animates livelier (talking) even without amplitude bumps
//   amplitudeRef - React ref { current: 0..1 }; the page bumps it (e.g. per spoken word).
//                  The orb reads it each frame and decays it, so it "mouths" the words.
export default function Orb({ color = "#4285f4", speaking = false, amplitudeRef }) {
  const canvasRef = useRef(null);
  const speakingRef = useRef(speaking);
  const colorRef = useRef(color);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => { colorRef.current = color; }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const N = reduce ? 260 : 620;

    // Particles on a unit sphere via the fibonacci-sphere distribution.
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, tw: Math.random() * Math.PI * 2 });
    }

    let w = 0, h = 0, dpr = 1, cx = 0, cy = 0, radius = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2;
      cy = h / 2;
      radius = Math.min(w, h) * 0.36;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0, t = 0, ay = 0, ax = 0;
    const render = () => {
      t += 0.016;

      // Amplitude 0..1: read + decay the shared ref; keep a lively floor while speaking
      // so the orb still animates in browsers that don't fire `onboundary`.
      let amp = 0;
      if (amplitudeRef && amplitudeRef.current != null) {
        amp = amplitudeRef.current;
        amplitudeRef.current = amp * 0.9;
      }
      if (speakingRef.current) amp = Math.max(amp, 0.28 + 0.18 * Math.sin(t * 7.5));
      amp = Math.min(1, amp);

      const rotSpeed = 0.0035 + (speakingRef.current ? 0.004 : 0) + amp * 0.006;
      ay += rotSpeed;
      ax = Math.sin(t * 0.15) * 0.25;
      const cosY = Math.cos(ay), sinY = Math.sin(ay);
      const cosX = Math.cos(ax), sinX = Math.sin(ax);

      const breathe = 1 + 0.03 * Math.sin(t * 1.1) + amp * 0.18;
      const R = radius * breathe;
      const [cr, cg, cb] = hexToRgb(colorRef.current);

      ctx.clearRect(0, 0, w, h);

      // Soft central bloom behind the particles.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},${0.22 + amp * 0.25})`);
      glow.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.05)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Additive blending gives the particles their glow.
      ctx.globalCompositeOperation = "lighter";
      const fov = 3;
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        // rotate around Y, then X
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        const y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;

        const persp = fov / (fov - z); // z in [-1,1]
        const sx = cx + x * R * persp;
        const sy = cy + y * R * persp;
        const depth = (z + 1) / 2; // 0 far .. 1 near
        const twinkle = 0.75 + 0.25 * Math.sin(t * 2 + p.tw);
        const size = (0.6 + depth * 1.8 + amp * 1.6) * twinkle;
        const alpha = (0.15 + depth * 0.7) * twinkle;

        // Near particles glow white-cyan; far ones sit at the accent color.
        const mix = depth;
        const rr = Math.round(cr + (255 - cr) * mix * 0.8);
        const gg = Math.round(cg + (255 - cg) * mix * 0.7);
        const bb = Math.round(cb + (255 - cb) * mix * 0.5);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [amplitudeRef]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
