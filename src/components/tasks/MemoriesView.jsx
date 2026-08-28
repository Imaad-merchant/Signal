import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowUpRight, Link2, CornerDownRight, FileText, ChevronLeft } from "lucide-react";
import { ICON_MAP } from "./NotionSidebar";

const TYPE_COLOR = { whiteboard: "#60a5fa", document: "#34d399", notion: "#c084fc" };
const colorFor = (p) => TYPE_COLOR[p?.type] || "#9ca3af";

const relTime = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString();
};

// Plain text from a page's stored content (HTML or markdown-ish).
const plainText = (html) => {
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent || el.innerText || "";
};

// Build the wiki-link graph, exactly like Obsidian:
//   • resolved [[Title]] links become edges
//   • a note whose plain text mentions another note's title (without a link) is
//     an "unlinked mention" — shown faintly and in the backlinks panel.
function useGraphModel(pages) {
  return useMemo(() => {
    const byId = Object.fromEntries(pages.map((p) => [p.id, p]));
    const titleToId = new Map();
    for (const p of pages) {
      const t = (p.title || "").trim().toLowerCase();
      if (t && !titleToId.has(t)) titleToId.set(t, p.id);
    }

    const text = new Map(); // id -> lowercased plain text
    for (const p of pages) text.set(p.id, plainText(p.content).toLowerCase());

    // Resolved wiki links
    const linkSet = new Set(); // "src->tgt"
    const outLinks = new Map(); // id -> Set(targetId)
    const inLinks = new Map(); // id -> Set(sourceId)
    const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
    for (const p of pages) {
      const raw = `${p.title || ""}\n${p.content || ""}`;
      let m;
      while ((m = re.exec(raw))) {
        const target = titleToId.get(m[1].trim().toLowerCase());
        if (target && target !== p.id) {
          linkSet.add(`${p.id}->${target}`);
          if (!outLinks.has(p.id)) outLinks.set(p.id, new Set());
          outLinks.get(p.id).add(target);
          if (!inLinks.has(target)) inLinks.set(target, new Set());
          inLinks.get(target).add(p.id);
        }
      }
    }

    // Unlinked mentions: title of B appears in A's text, and A has no [[B]] link.
    const unlinked = new Set(); // "a~b" (A mentions B)
    for (const a of pages) {
      const t = text.get(a.id) || "";
      if (!t) continue;
      for (const b of pages) {
        if (a.id === b.id) continue;
        const title = (b.title || "").trim().toLowerCase();
        if (title.length < 3) continue;
        if (outLinks.get(a.id)?.has(b.id)) continue; // already a real link
        if (t.includes(title)) unlinked.add(`${a.id}~${b.id}`);
      }
    }

    // Edges + degree
    const edges = [];
    for (const key of linkSet) {
      const [s, t] = key.split("->");
      edges.push({ s, t, kind: "link" });
    }
    for (const key of unlinked) {
      const [a, b] = key.split("~");
      if (linkSet.has(`${a}->${b}`) || linkSet.has(`${b}->${a}`)) continue;
      edges.push({ s: a, t: b, kind: "mention" });
    }

    const degree = {};
    for (const e of edges) { degree[e.s] = (degree[e.s] || 0) + 1; degree[e.t] = (degree[e.t] || 0) + 1; }

    return { byId, titleToId, edges, degree, outLinks, inLinks, unlinked, text };
  }, [pages]);
}

export default function MemoriesView({ pages, onOpen }) {
  const model = useGraphModel(pages);
  const [showMentions, setShowMentions] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const simRef = useRef({ nodes: [], byId: new Map() });
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef(null);
  const hoverRef = useRef(null);
  const rafRef = useRef(0);
  const selRef = useRef(null);
  useEffect(() => { selRef.current = selectedId; }, [selectedId]);

  const activeEdges = useMemo(
    () => model.edges.filter((e) => showMentions || e.kind === "link"),
    [model.edges, showMentions]
  );

  // (Re)build the simulation when the set of pages changes. Positions persist for
  // ids that still exist so the graph doesn't jump around on unrelated updates.
  useEffect(() => {
    const prev = simRef.current.byId;
    const nodes = pages.map((p, i) => {
      const old = prev.get(p.id);
      const a = (i / Math.max(pages.length, 1)) * Math.PI * 2;
      return {
        id: p.id,
        title: p.title || "Untitled",
        color: colorFor(p),
        x: old ? old.x : Math.cos(a) * 140 + (Math.random() - 0.5) * 30,
        y: old ? old.y : Math.sin(a) * 140 + (Math.random() - 0.5) * 30,
        vx: 0, vy: 0,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    simRef.current = { nodes, byId };
  }, [pages]);

  // Resize canvas to its container (devicePixelRatio-aware).
  useEffect(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, r.width * dpr);
      cv.height = Math.max(1, r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Physics + render loop.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const degree = model.degree;
    // Size fallback in case ResizeObserver hasn't fired yet.
    if (cv.width <= 300 && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (r.width > 0) { cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = `${r.width}px`; cv.style.height = `${r.height}px`; }
    }

    const step = () => {
      const { nodes, byId } = simRef.current;
      const n = nodes.length;
      const KREP = 5200, LEN = 74, KSPR = 0.045, G = 0.018, DAMP = 0.86;
      // forces
      for (const nd of nodes) { nd.fx = -nd.x * G; nd.fy = -nd.y * G; }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
          const f = KREP / d2;
          const d = Math.sqrt(d2);
          const ux = dx / d, uy = dy / d;
          a.fx += ux * f; a.fy += uy * f;
          b.fx -= ux * f; b.fy -= uy * f;
        }
      }
      for (const e of activeEdges) {
        const a = byId.get(e.s), b = byId.get(e.t);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - LEN) * KSPR;
        const ux = dx / d, uy = dy / d;
        a.fx += ux * f; a.fy += uy * f;
        b.fx -= ux * f; b.fy -= uy * f;
      }
      const dragging = dragRef.current?.mode === "node" ? dragRef.current.id : null;
      for (const nd of nodes) {
        if (nd.id === dragging) { nd.vx = 0; nd.vy = 0; continue; }
        nd.vx = (nd.vx + nd.fx) * DAMP;
        nd.vy = (nd.vy + nd.fy) * DAMP;
        nd.x += nd.vx; nd.y += nd.vy;
      }

      // render
      const dpr = window.devicePixelRatio || 1;
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const { scale, tx, ty } = viewRef.current;
      ctx.save();
      ctx.translate(W / 2 + tx * dpr, H / 2 + ty * dpr);
      ctx.scale(scale * dpr, scale * dpr);

      const hov = hoverRef.current, sel = selRef.current;
      const focusId = hov || sel;
      const neighbor = new Set();
      if (focusId) {
        neighbor.add(focusId);
        for (const e of activeEdges) {
          if (e.s === focusId) neighbor.add(e.t);
          if (e.t === focusId) neighbor.add(e.s);
        }
      }

      // edges
      for (const e of activeEdges) {
        const a = byId.get(e.s), b = byId.get(e.t);
        if (!a || !b) continue;
        const on = focusId ? (neighbor.has(e.s) && neighbor.has(e.t)) : true;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (e.kind === "mention") { ctx.setLineDash([3, 3]); ctx.strokeStyle = on ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)"; }
        else { ctx.setLineDash([]); ctx.strokeStyle = on ? "rgba(147,197,253,0.5)" : "rgba(255,255,255,0.05)"; }
        ctx.lineWidth = e.kind === "mention" ? 0.8 : 1.1;
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // nodes
      for (const nd of nodes) {
        const deg = degree[nd.id] || 0;
        const r = 3.5 + Math.min(deg, 10) * 0.9;
        const dim = focusId && !neighbor.has(nd.id);
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, nd.id === focusId ? r + 2 : r, 0, Math.PI * 2);
        ctx.fillStyle = nd.color;
        ctx.fill();
        if (nd.id === focusId) { ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff"; ctx.stroke(); }
        // labels when zoomed in, or for focus/neighbours
        if (scale > 0.85 || (focusId && neighbor.has(nd.id))) {
          ctx.globalAlpha = dim ? 0.25 : 0.9;
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "11px Inter, system-ui, sans-serif";
          ctx.fillText(nd.title.slice(0, 22), nd.x + r + 3, nd.y + 3.5);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(step);
    };
    step(); // paint an immediate first frame (rAF is paused in background tabs)
    return () => cancelAnimationFrame(rafRef.current);
  }, [activeEdges, model.degree]);

  // Screen → world coordinate.
  const toWorld = useCallback((clientX, clientY) => {
    const cv = canvasRef.current;
    const r = cv.getBoundingClientRect();
    const { scale, tx, ty } = viewRef.current;
    const x = (clientX - r.left - r.width / 2 - tx) / scale;
    const y = (clientY - r.top - r.height / 2 - ty) / scale;
    return { x, y };
  }, []);

  const nodeAt = useCallback((clientX, clientY) => {
    const { x, y } = toWorld(clientX, clientY);
    const { nodes } = simRef.current;
    const deg = model.degree;
    let best = null, bestD = 14;
    for (const nd of nodes) {
      const r = 3.5 + Math.min(deg[nd.id] || 0, 10) * 0.9 + 6;
      const d = Math.hypot(nd.x - x, nd.y - y);
      if (d < r && d < bestD) { best = nd; bestD = d; }
    }
    return best;
  }, [toWorld, model.degree]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const hit = nodeAt(e.clientX, e.clientY);
    if (hit) {
      dragRef.current = { mode: "node", id: hit.id, moved: false, lastX: e.clientX, lastY: e.clientY };
    } else {
      dragRef.current = { mode: "pan", moved: false, lastX: e.clientX, lastY: e.clientY };
    }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) { hoverRef.current = nodeAt(e.clientX, e.clientY)?.id || null; return; }
    const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    d.lastX = e.clientX; d.lastY = e.clientY;
    if (d.mode === "pan") {
      viewRef.current.tx += dx; viewRef.current.ty += dy;
    } else if (d.mode === "node") {
      const nd = simRef.current.byId.get(d.id);
      if (nd) { const w = toWorld(e.clientX, e.clientY); nd.x = w.x; nd.y = w.y; nd.vx = 0; nd.vy = 0; }
    }
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved && d.mode === "node") setSelectedId(d.id);
    else if (d && !d.moved && d.mode === "pan") setSelectedId(null);
  };
  const onDoubleClick = (e) => {
    const hit = nodeAt(e.clientX, e.clientY);
    if (hit) onOpen(model.byId[hit.id]);
  };
  const onWheel = (e) => {
    e.preventDefault();
    const v = viewRef.current;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const cv = canvasRef.current;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2;
    const my = e.clientY - r.top - r.height / 2;
    const ns = Math.max(0.25, Math.min(4, v.scale * factor));
    // zoom around cursor
    v.tx = mx - (mx - v.tx) * (ns / v.scale);
    v.ty = my - (my - v.ty) * (ns / v.scale);
    v.scale = ns;
  };
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const handler = (e) => onWheel(e);
    cv.addEventListener("wheel", handler, { passive: false });
    return () => cv.removeEventListener("wheel", handler);
  }, []);

  // Backlinks / links for the selected note.
  const sel = selectedId ? model.byId[selectedId] : null;
  const panel = useMemo(() => {
    if (!sel) return null;
    const out = [...(model.outLinks.get(sel.id) || [])].map((id) => model.byId[id]).filter(Boolean);
    const linked = [...(model.inLinks.get(sel.id) || [])].map((id) => model.byId[id]).filter(Boolean);
    const unlinked = pages.filter((p) => p.id !== sel.id && model.unlinked.has(`${p.id}~${sel.id}`));
    return { out, linked, unlinked };
  }, [sel, model, pages]);

  const recents = useMemo(
    () => [...pages].sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || "")),
    [pages]
  );

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden bg-[#141516]">
      {/* Graph */}
      <div ref={wrapRef} className="flex-1 min-w-0 relative overflow-hidden">
        <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-200">Memory graph</h1>
          <span className="text-[11px] text-gray-600">{pages.length} notes · {model.edges.filter(e=>e.kind==="link").length} links</span>
        </div>
        <label className="absolute top-3 right-4 z-10 flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={showMentions} onChange={(e) => setShowMentions(e.target.checked)} className="accent-blue-500" />
          Unlinked mentions
        </label>
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        />
        {pages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600 pointer-events-none">No notes yet.</div>
        )}
        <div className="absolute bottom-3 left-4 z-10 text-[10.5px] text-gray-600 leading-relaxed pointer-events-none">
          Drag to pan · scroll to zoom · click a node for backlinks · double-click to open
        </div>
      </div>

      {/* Right pane — Obsidian-style backlinks / note info */}
      <aside className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-white/[0.06] bg-[#1a1b1c] overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {sel && panel ? (
          <>
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 mb-2">
                <ChevronLeft className="h-3 w-3" /> Graph
              </button>
              <div className="flex items-start gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5" style={{ background: colorFor(sel) }} />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-gray-100 truncate">{sel.title || "Untitled"}</p>
                  <p className="text-[10.5px] text-gray-600 mt-0.5">Edited {relTime(sel.updated_date)}</p>
                </div>
              </div>
              <button onClick={() => onOpen(sel)} className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/[0.14] border border-blue-500/40 text-blue-300 text-[12px] font-medium hover:bg-blue-500/25 transition-colors">
                <ArrowUpRight className="h-3.5 w-3.5" /> Open note
              </button>
            </div>
            <LinkGroup title="Links" icon={CornerDownRight} items={panel.out} empty="No outgoing links" onPick={setSelectedId} />
            <LinkGroup title="Linked mentions" icon={Link2} items={panel.linked} empty="No backlinks yet" onPick={setSelectedId} />
            <LinkGroup title="Unlinked mentions" icon={FileText} items={panel.unlinked} empty="None" onPick={setSelectedId} faint />
          </>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">All notes</p>
            </div>
            <div className="p-2 flex flex-col gap-0.5">
              {recents.map((p) => {
                const cfg = ICON_MAP[p.icon] || ICON_MAP.file;
                const Icon = cfg.icon;
                const deg = model.degree[p.id] || 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    onMouseEnter={() => { hoverRef.current = p.id; }}
                    onMouseLeave={() => { if (hoverRef.current === p.id) hoverRef.current = null; }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: colorFor(p) }} />
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                    <span className="flex-1 truncate text-[13px] text-gray-200">{p.title || "Untitled"}</span>
                    {deg > 0 && <span className="text-[10px] text-gray-600 shrink-0">{deg}</span>}
                  </button>
                );
              })}
            </div>
            <div className="px-4 pb-4 pt-1 text-[10.5px] text-gray-600 leading-relaxed">
              Link notes with <span className="text-gray-400">[[Note title]]</span> in their text to connect them here.
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// A labelled group of connected notes in the backlinks panel.
function LinkGroup({ title, icon: Icon, items, empty, onPick, faint = false }) {
  return (
    <div className="px-3 py-3 border-b border-white/[0.04]">
      <div className="flex items-center gap-1.5 mb-1.5 px-1 text-gray-500">
        <Icon className="h-3 w-3" />
        <p className={`text-[10px] uppercase tracking-wider font-semibold ${faint ? "text-gray-600" : ""}`}>{title}</p>
        {items.length > 0 && <span className="text-[10px] text-gray-600">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <p className="px-1 text-[11px] text-gray-600">{empty}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((p) => {
            const cfg = ICON_MAP[p.icon] || ICON_MAP.file;
            const Icon2 = cfg.icon;
            return (
              <button key={p.id} onClick={() => onPick(p.id)} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-left hover:bg-white/[0.04] transition-colors">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: colorFor(p) }} />
                <Icon2 className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                <span className="flex-1 truncate text-[12.5px] text-gray-300">{p.title || "Untitled"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
