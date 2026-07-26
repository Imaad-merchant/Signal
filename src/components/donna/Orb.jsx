import React, { useRef, useEffect } from "react";

// Per-state RGB. Idle = slate, Listening = cyan, Processing = amber, Speaking = white-silver.
const STATE_COLOR = {
  idle: [124, 138, 160],
  listening: [34, 211, 238],
  processing: [245, 158, 11],
  speaking: [226, 232, 240],
};
// When Donna has something to say (idle + attention), the orb breathes amber.
const ATTN_COLOR = [245, 176, 74];

// A glowing particle-sphere "orb" — dependency-free 2D canvas + requestAnimationFrame.
// Props:
//   state        - "idle" | "listening" | "processing" | "speaking"
//   amplitudeRef - React ref { current: 0..1 }; the page feeds it mic level (listening)
//                  or TTS word-boundary bumps (speaking). Read + decayed each frame.
export default function Orb({ state = "idle", amplitudeRef, attention = false }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const attnRef = useRef(attention);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { attnRef.current = attention; }, [attention]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const N = reduce ? 260 : 620;

    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, tw: Math.random() * Math.PI * 2 });
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
      cx = w / 2; cy = h / 2;
      radius = Math.min(w, h) * 0.36;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Smoothly cross-fade the color when the state changes.
    const cur = [...STATE_COLOR.idle];

    let raf = 0, t = 0, ay = 0, ax = 0;
    const render = () => {
      t += 0.016;
      const st = stateRef.current;
      const active = st === "listening" || st === "speaking";
      const processing = st === "processing";

      // Amplitude 0..1: mic (listening) or TTS bumps (speaking), decayed each frame.
      let amp = 0;
      if (amplitudeRef && amplitudeRef.current != null) {
        amp = amplitudeRef.current;
        amplitudeRef.current = amp * 0.9;
      }
      if (st === "speaking") amp = Math.max(amp, 0.28 + 0.18 * Math.sin(t * 7.5));
      if (processing) amp = Math.max(amp, 0.32 + 0.22 * Math.sin(t * 9)); // amber shimmer
      // "Wants to talk": a slow amber breathing pulse while idle.
      const wantsToTalk = attnRef.current && st === "idle";
      if (wantsToTalk) amp = Math.max(amp, 0.2 + 0.16 * Math.sin(t * 2.2));
      amp = Math.min(1, amp);

      // Ease color toward the target for the current state (amber when it wants to talk).
      const tgt = wantsToTalk ? ATTN_COLOR : (STATE_COLOR[st] || STATE_COLOR.idle);
      for (let k = 0; k < 3; k++) cur[k] += (tgt[k] - cur[k]) * 0.08;
      const cr = Math.round(cur[0]), cg = Math.round(cur[1]), cb = Math.round(cur[2]);

      const rotSpeed = 0.0035 + (active ? 0.004 : 0) + (processing ? 0.009 : 0) + amp * 0.006;
      ay += rotSpeed;
      ax = Math.sin(t * 0.15) * 0.25;
      const cosY = Math.cos(ay), sinY = Math.sin(ay), cosX = Math.cos(ax), sinX = Math.sin(ax);

      const breathe = 1 + 0.03 * Math.sin(t * 1.1) + amp * 0.18;
      const R = radius * breathe;

      ctx.clearRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},${0.2 + amp * 0.25})`);
      glow.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.05)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      const fov = 3;
      const twSpeed = processing ? 5 : 2;
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        const y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;
        const persp = fov / (fov - z);
        const sx = cx + x * R * persp;
        const sy = cy + y * R * persp;
        const depth = (z + 1) / 2;
        const twinkle = 0.75 + 0.25 * Math.sin(t * twSpeed + p.tw);
        const size = (0.6 + depth * 1.8 + amp * 1.6) * twinkle;
        const alpha = (0.15 + depth * 0.7) * twinkle;
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
