import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowUpRight, Link2, CornerDownRight, FileText, ChevronLeft, ChevronRight, ChevronDown, MoreVertical, Trash2, Pencil, Check, ArrowUpDown, CheckSquare, X, Sparkles } from "lucide-react";
import { ICON_MAP } from "./NotionSidebar";

const TYPE_COLOR = { whiteboard: "#60a5fa", document: "#34d399", notion: "#c084fc" };
const colorFor = (p) => TYPE_COLOR[p?.type] || "#9ca3af";

// Yours only when explicitly tagged source:"user" (files you make in the
// workspace, or ones you mark as yours). Everything else is Donna's — her
// captures, logs, and imported vault notes.
const isDonna = (p) => p?.source !== "user";

// Auto-category, read from the note's title + content (Donna groups by topic).
const CATEGORIES = [
  { key: "business", label: "Business", color: "#3b82f6", re: /\b(business|startup|revenue|customers?|market(ing)?|sales|pricing|product|launch|growth|founder|gridmail|saas|invoice|clients?|deal|pitch|investor)\b/i },
  { key: "school", label: "School", color: "#f59e0b", re: /\b(class|course|exam|quiz|homework|assignment|professor|lecture|study|grade|semester|university|college|wcjc|econ|unit\s*\d|chapter\s*\d)\b/i },
  { key: "health", label: "Health", color: "#22c55e", re: /\b(gym|workout|run(ning)?|health|sleep|diet|calorie|meditat|stretch|doctor|dentist|exercise|fitness)\b/i },
  { key: "research", label: "Research", color: "#06b6d4", re: /\b(research|paper|analysis|data|experiment|findings?|report|writeup|intel|study of)\b/i },
  { key: "personal", label: "Personal", color: "#a855f7", re: /\b(family|friend|mom|dad|birthday|personal|home|relationship|feel|volunteer|scout|church)\b/i },
  { key: "journal", label: "Journal", color: "#eab308", re: /\b(journal|log|reflect|note to self|diary|today i)\b/i },
];
const OTHER_CAT = { key: "other", label: "Uncategorized", color: "#6b7280" };
const categorize = (p) => {
  const hay = `${p?.title || ""} ${(p?.content || "").replace(/<[^>]+>/g, " ").slice(0, 800)}`;
  return CATEGORIES.find((c) => c.re.test(hay)) || OTHER_CAT;
};
const contentLen = (p) => (p?.content || "").replace(/<[^>]+>/g, "").length;

const SORTS = [
  { key: "recent", label: "Recently edited", cmp: (a, b) => (b.updated_date || "").localeCompare(a.updated_date || "") },
  { key: "name", label: "Name (A–Z)", cmp: (a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled") },
  { key: "most", label: "Most used", cmp: (a, b) => (b.open_count || 0) - (a.open_count || 0) },
  { key: "least", label: "Least used", cmp: (a, b) => (a.open_count || 0) - (b.open_count || 0) },
  { key: "longest", label: "Longest", cmp: (a, b) => contentLen(b) - contentLen(a) },
  { key: "shortest", label: "Shortest", cmp: (a, b) => contentLen(a) - contentLen(b) },
];

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

export default function MemoriesView({ pages, onOpen, onDelete, onUpdate }) {
  const model = useGraphModel(pages);
  const [showMentions, setShowMentions] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  // Sidebar management: collapse, sort, colour filter, multi-select, row menu.
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [sortKey, setSortKey] = useState("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [colorFilter, setColorFilter] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [rowMenu, setRowMenu] = useState(null); // { page, x, y }
  const sortRef = useRef(null);
  useEffect(() => {
    if (!sortOpen) return;
    const h = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [sortOpen]);

  // Open a memory, bumping its usage counter (drives most/least-used sort).
  const openMemory = useCallback((p) => {
    try { onUpdate?.(p.id, { open_count: (p.open_count || 0) + 1, last_opened: new Date().toISOString() }); } catch { /* ignore */ }
    onOpen(p);
  }, [onOpen, onUpdate]);

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

  // Group memories by author (Donna / You) then by auto-category — Discord-style
  // collapsible, colour-coded sections — sorted and colour-filtered.
  const grouped = useMemo(() => {
    const cmp = (SORTS.find((s) => s.key === sortKey) || SORTS[0]).cmp;
    const meta = pages.map((p) => ({ p, cat: categorize(p), donna: isDonna(p) }));
    const filtered = colorFilter ? meta.filter((m) => m.cat.key === colorFilter) : meta;
    const authors = [
      { key: "donna", label: "Donna's memories", accent: "#67e8f9", items: filtered.filter((m) => m.donna) },
      { key: "you", label: "Your notes", accent: "#93c5fd", items: filtered.filter((m) => !m.donna) },
    ];
    return authors
      .map((a) => {
        const byCat = new Map();
        for (const m of a.items) {
          if (!byCat.has(m.cat.key)) byCat.set(m.cat.key, { cat: m.cat, list: [] });
          byCat.get(m.cat.key).list.push(m.p);
        }
        const cats = [...byCat.values()].sort((x, y) => y.list.length - x.list.length);
        for (const c of cats) c.list.sort(cmp);
        return { ...a, count: a.items.length, cats };
      })
      .filter((a) => a.count > 0);
  }, [pages, sortKey, colorFilter]);

  const availableCats = useMemo(() => {
    const seen = new Map();
    for (const p of pages) { const c = categorize(p); if (!seen.has(c.key)) seen.set(c.key, c); }
    return [...seen.values()];
  }, [pages]);

  const toggleCollapse = (k) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleCheck = (id) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setChecked(new Set()); };
  const massDelete = async () => {
    const ids = [...checked];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} memor${ids.length !== 1 ? "ies" : "y"}? You can restore them from Recently deleted.`)) return;
    for (const id of ids) { const p = model.byId[id]; if (p) await onDelete?.(p); }
    exitSelect();
  };

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
              <button onClick={() => openMemory(sel)} className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/[0.14] border border-blue-500/40 text-blue-300 text-[12px] font-medium hover:bg-blue-500/25 transition-colors">
                <ArrowUpRight className="h-3.5 w-3.5" /> Open note
              </button>
            </div>
            <LinkGroup title="Links" icon={CornerDownRight} items={panel.out} empty="No outgoing links" onPick={setSelectedId} />
            <LinkGroup title="Linked mentions" icon={Link2} items={panel.linked} empty="No backlinks yet" onPick={setSelectedId} />
            <LinkGroup title="Unlinked mentions" icon={FileText} items={panel.unlinked} empty="None" onPick={setSelectedId} faint />
          </>
        ) : (
          <>
            {/* Toolbar: sort + colour filter + select mode */}
            <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-white/[0.05] bg-[#1a1b1c] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Memories</span>
              <div className="flex-1" />
              <div className="relative" ref={sortRef}>
                <button onClick={() => setSortOpen((o) => !o)} title="Sort" className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-1 text-[10.5px] text-gray-400 hover:bg-white/[0.05]">
                  <ArrowUpDown className="h-3 w-3" />
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-white/[0.12] bg-[#2d2e30] py-1 shadow-2xl">
                    <p className="px-3 pb-1 pt-1.5 text-[9px] uppercase tracking-wider text-gray-600">Sort by</p>
                    {SORTS.map((s) => (
                      <button key={s.key} onClick={() => { setSortKey(s.key); setSortOpen(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/[0.05] ${sortKey === s.key ? "text-blue-300" : "text-gray-300"}`}>
                        <Check className={`h-3 w-3 ${sortKey === s.key ? "opacity-100" : "opacity-0"}`} />{s.label}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-white/[0.08]" />
                    <p className="px-3 pb-1 pt-0.5 text-[9px] uppercase tracking-wider text-gray-600">Filter colour</p>
                    <button onClick={() => { setColorFilter(null); setSortOpen(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/[0.05] ${!colorFilter ? "text-blue-300" : "text-gray-300"}`}>
                      <span className="h-2.5 w-2.5 rounded-full border border-white/30" /> All colours
                    </button>
                    {availableCats.map((c) => (
                      <button key={c.key} onClick={() => { setColorFilter(c.key); setSortOpen(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/[0.05] ${colorFilter === c.key ? "text-blue-300" : "text-gray-300"}`}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /> {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => (selectMode ? exitSelect() : setSelectMode(true))} title="Select" className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10.5px] ${selectMode ? "border-blue-500/40 bg-blue-500/[0.14] text-blue-300" : "border-white/10 text-gray-400 hover:bg-white/[0.05]"}`}>
                <CheckSquare className="h-3 w-3" />
              </button>
            </div>

            {selectMode && (
              <div className="flex items-center gap-2 border-b border-blue-500/25 bg-blue-500/[0.08] px-3 py-1.5">
                <span className="text-[11px] text-blue-200">{checked.size} selected</span>
                <div className="flex-1" />
                <button onClick={massDelete} disabled={checked.size === 0} className="flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/25 disabled:opacity-40">
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
                <button onClick={exitSelect} className="rounded p-0.5 text-gray-400 hover:bg-white/[0.06]"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}

            <div className="p-2">
              {grouped.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11px] text-gray-600">No memories.</p>
              ) : (
                grouped.map((author) => {
                  const aCollapsed = collapsed.has(author.key);
                  return (
                    <div key={author.key} className="mb-1.5">
                      {/* Author section header (Discord-style role group) */}
                      <button onClick={() => toggleCollapse(author.key)} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/[0.03]">
                        {aCollapsed ? <ChevronRight className="h-3 w-3 text-gray-600" /> : <ChevronDown className="h-3 w-3 text-gray-600" />}
                        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: author.accent }}>
                          {author.key === "donna" && <Sparkles className="h-3 w-3" />}{author.label}
                        </span>
                        <span className="text-[10px] text-gray-600">{author.count}</span>
                      </button>
                      {!aCollapsed && author.cats.map((c) => {
                        const gk = `${author.key}:${c.cat.key}`;
                        const cCollapsed = collapsed.has(gk);
                        return (
                          <div key={gk} className="ml-2">
                            <button onClick={() => toggleCollapse(gk)} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/[0.03]">
                              {cCollapsed ? <ChevronRight className="h-2.5 w-2.5 text-gray-700" /> : <ChevronDown className="h-2.5 w-2.5 text-gray-700" />}
                              <span className="h-2 w-2 rounded-full" style={{ background: c.cat.color }} />
                              <span className="text-[11px] font-medium text-gray-400">{c.cat.label}</span>
                              <span className="text-[9.5px] text-gray-600">{c.list.length}</span>
                            </button>
                            {!cCollapsed && (
                              <div className="ml-2 flex flex-col">
                                {c.list.map((p) => {
                                  const isChecked = checked.has(p.id);
                                  return (
                                    <div
                                      key={p.id}
                                      onClick={() => (selectMode ? toggleCheck(p.id) : setSelectedId(p.id))}
                                      onMouseEnter={() => { hoverRef.current = p.id; }}
                                      onMouseLeave={() => { if (hoverRef.current === p.id) hoverRef.current = null; }}
                                      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${isChecked ? "bg-blue-500/[0.1]" : "hover:bg-white/[0.04]"}`}
                                    >
                                      {selectMode && (
                                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${isChecked ? "border-blue-500 bg-blue-500" : "border-white/30"}`}>
                                          {isChecked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                        </span>
                                      )}
                                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.cat.color }} />
                                      <span className="flex-1 truncate text-[12.5px] text-gray-300">{p.title || "Untitled"}</span>
                                      {!selectMode && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setRowMenu({ page: p, x: Math.min(r.left, window.innerWidth - 170), y: r.bottom + 4 }); }}
                                          title="More"
                                          className="rounded p-0.5 text-gray-600 opacity-0 hover:bg-white/[0.06] hover:text-gray-200 group-hover:opacity-100"
                                        >
                                          <MoreVertical className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </aside>

      {/* Per-memory actions menu (edit / delete) */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(null); }} />
          <div className="fixed z-50 w-[160px] rounded-xl border border-white/[0.1] bg-[#2a2b2d] py-1 shadow-2xl" style={{ left: rowMenu.x, top: rowMenu.y }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { const p = rowMenu.page; setRowMenu(null); openMemory(p); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-gray-200 hover:bg-white/[0.06]">
              <Pencil className="h-3.5 w-3.5 text-blue-400" /> Edit
            </button>
            <button onClick={() => { const p = rowMenu.page; setRowMenu(null); onUpdate?.(p.id, { source: isDonna(p) ? "user" : "donna" }); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-gray-200 hover:bg-white/[0.06]">
              <ArrowUpRight className="h-3.5 w-3.5 text-cyan-400" /> {isDonna(rowMenu.page) ? "Move to yours" : "Move to Donna's"}
            </button>
            <div className="my-1 h-px bg-white/[0.08]" />
            <button onClick={() => { const p = rowMenu.page; setRowMenu(null); onDelete?.(p); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-rose-300 hover:bg-rose-500/15">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
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
