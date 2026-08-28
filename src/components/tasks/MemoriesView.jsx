import React, { useMemo, useState } from "react";
import { Orbit, ArrowUpLeft, CornerDownRight, GitBranch, ArrowUpRight, ChevronLeft } from "lucide-react";
import { ICON_MAP } from "./NotionSidebar";

// Colour a node by its page type (falls back to the icon colour hue).
const TYPE_COLOR = {
  whiteboard: "#60a5fa",
  document: "#34d399",
  notion: "#c084fc",
};
const colorFor = (p) => TYPE_COLOR[p.type] || "#9ca3af";

const relTime = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString();
};

// Lay pages out as a radial tree around a central hub, using the real parent_id
// hierarchy as edges. Returns {nodes, edges, size}.
function useLayout(pages) {
  return useMemo(() => {
    const RING = 150;
    const childrenOf = (id) => pages.filter((p) => p.parent_id === id);
    const roots = pages.filter((p) => !p.parent_id || !pages.some((q) => q.id === p.parent_id));

    let maxDepth = 1;
    const placed = new Map(); // id -> {x,y,depth,page}
    const cx = 0, cy = 0;
    const hub = { id: "__hub", x: cx, y: cy };

    const place = (node, depth, a0, a1) => {
      maxDepth = Math.max(maxDepth, depth);
      const ang = (a0 + a1) / 2;
      const x = cx + depth * RING * Math.cos(ang);
      const y = cy + depth * RING * Math.sin(ang);
      placed.set(node.id, { x, y, depth, page: node });
      const kids = childrenOf(node.id);
      kids.forEach((k, i) => {
        const span = a1 - a0;
        // Widen the wedge a touch so children fan out, but keep within a sane range.
        const w = Math.max(span, 0.5);
        const ka0 = ang - w / 2 + w * (i / kids.length);
        const ka1 = ang - w / 2 + w * ((i + 1) / kids.length);
        place(k, depth + 1, ka0, ka1);
      });
    };

    const n = Math.max(roots.length, 1);
    roots.forEach((r, i) => {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      place(r, 1, a0, a1);
    });

    const edges = [];
    for (const p of pages) {
      const me = placed.get(p.id);
      if (!me) continue;
      if (p.parent_id && placed.has(p.parent_id)) {
        const par = placed.get(p.parent_id);
        edges.push({ x1: par.x, y1: par.y, x2: me.x, y2: me.y, a: p.parent_id, b: p.id });
      } else {
        edges.push({ x1: hub.x, y1: hub.y, x2: me.x, y2: me.y, a: "__hub", b: p.id });
      }
    }

    const R = (maxDepth + 0.6) * RING;
    return {
      hub,
      nodes: [...placed.values()],
      edges,
      viewBox: `${-R} ${-R} ${2 * R} ${2 * R}`,
    };
  }, [pages]);
}

// A labelled group of connected memories in the focused-memory panel.
function ConnGroup({ title, icon: Icon, items, empty, onPick, onOpen }) {
  return (
    <div className="px-3 py-3 border-b border-white/[0.04]">
      <div className="flex items-center gap-1.5 mb-1.5 px-1 text-gray-500">
        <Icon className="h-3 w-3" />
        <p className="text-[10px] uppercase tracking-wider font-semibold">{title}</p>
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
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                onDoubleClick={() => onOpen(p)}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-left hover:bg-white/[0.04] transition-colors"
              >
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

export default function MemoriesView({ pages, onOpen }) {
  const [hovered, setHovered] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const { hub, nodes, edges, viewBox } = useLayout(pages);
  const recents = useMemo(
    () => [...pages].sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || "")),
    [pages]
  );

  const byId = useMemo(() => Object.fromEntries(pages.map((p) => [p.id, p])), [pages]);
  const focused = focusedId ? byId[focusedId] : null;

  // Local graph of the focused memory: its parent, its children (backlinks that
  // point up to it), and its siblings — all derived from the real hierarchy.
  const local = useMemo(() => {
    if (!focused) return null;
    const parent = focused.parent_id ? byId[focused.parent_id] : null;
    const children = pages.filter((p) => p.parent_id === focused.id);
    const siblings = pages.filter(
      (p) => p.id !== focused.id && (p.parent_id || null) === (focused.parent_id || null)
    );
    const neighborIds = new Set([
      focused.id,
      ...(parent ? [parent.id] : []),
      ...children.map((c) => c.id),
      ...siblings.map((s) => s.id),
    ]);
    return { parent, children, siblings, neighborIds };
  }, [focused, pages, byId]);

  // Node ids to keep bright when a memory is focused (itself + direct neighbours).
  const brightIds = local?.neighborIds;
  const isBright = (id) => !focused || (brightIds && brightIds.has(id));

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden bg-[#171819]">
      {/* Mind map */}
      <div className="flex-1 min-w-0 relative overflow-hidden">
        <div className="absolute top-4 left-5 z-10 flex items-center gap-2 text-gray-300">
          <Orbit className="h-4 w-4 text-cyan-300" />
          <h1 className="text-sm font-semibold">Memories</h1>
          {focused ? (
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <ChevronLeft className="h-3 w-3" />
              <span className="text-gray-300 truncate max-w-[200px]">{focused.title || "Untitled"}</span>
            </span>
          ) : (
            <span className="text-[11px] text-gray-600">{pages.length} node{pages.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        {pages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-600">No memories yet.</div>
        ) : (
          <svg viewBox={viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet" onClick={() => setFocusedId(null)}>
            {edges.map((e, i) => {
              const on = !focused || (isBright(e.a) && isBright(e.b));
              return (
                <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={on ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)"} strokeWidth={1.2} />
              );
            })}
            {/* Hub */}
            <g>
              <circle cx={hub.x} cy={hub.y} r={22} fill="rgba(103,232,249,0.12)" stroke="rgba(103,232,249,0.5)" strokeWidth={1.5} />
              <text x={hub.x} y={hub.y + 4} textAnchor="middle" fontSize={11} fontWeight="600" fill="#a5f3fc">Donna</text>
            </g>
            {nodes.map(({ x, y, page }) => {
              const c = colorFor(page);
              const active = hovered === page.id || focusedId === page.id;
              const bright = isBright(page.id);
              return (
                <g
                  key={page.id}
                  style={{ cursor: "pointer", opacity: bright ? 1 : 0.25 }}
                  onMouseEnter={() => setHovered(page.id)}
                  onMouseLeave={() => setHovered((h) => (h === page.id ? null : h))}
                  onClick={(e) => { e.stopPropagation(); focusedId === page.id ? onOpen(page) : setFocusedId(page.id); }}
                >
                  <circle cx={x} cy={y} r={active ? 9 : 6} fill={c} fillOpacity={active ? 1 : 0.85} stroke={active ? "#fff" : "none"} strokeWidth={active ? 1.5 : 0} />
                  <text x={x + 11} y={y + 4} fontSize={11} fill={active ? "#f3f4f6" : "#9ca3af"}>
                    {(page.title || "Untitled").slice(0, 26)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Right panel — the focused memory's connections, or the full list */}
      <aside className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-white/[0.06] bg-[#1c1d1e] overflow-y-auto">
        {focused && local ? (
          <div className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <button onClick={() => setFocusedId(null)} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 mb-2">
                <ChevronLeft className="h-3 w-3" /> All memories
              </button>
              <div className="flex items-start gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5" style={{ background: colorFor(focused) }} />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-gray-100 truncate">{focused.title || "Untitled"}</p>
                  <p className="text-[10.5px] text-gray-600 mt-0.5">Edited {relTime(focused.updated_date)}</p>
                </div>
              </div>
              <button
                onClick={() => onOpen(focused)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/[0.14] border border-blue-500/40 text-blue-300 text-[12px] font-medium hover:bg-blue-500/25 transition-colors"
              >
                <ArrowUpRight className="h-3.5 w-3.5" /> Open
              </button>
            </div>

            <ConnGroup title="In folder" icon={ArrowUpLeft} items={local.parent ? [local.parent] : []} empty="Top level" onPick={setFocusedId} onOpen={onOpen} />
            <ConnGroup title="Backlinks" icon={CornerDownRight} items={local.children} empty="Nothing links here yet" onPick={setFocusedId} onOpen={onOpen} />
            <ConnGroup title="Related" icon={GitBranch} items={local.siblings} empty="No related memories" onPick={setFocusedId} onOpen={onOpen} />
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">All memories</p>
            </div>
            <div className="p-2 flex flex-col gap-0.5 pb-[calc(4rem+env(safe-area-inset-bottom))]">
              {recents.map((p) => {
                const cfg = ICON_MAP[p.icon] || ICON_MAP.file;
                const Icon = cfg.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => setFocusedId(p.id)}
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered((h) => (h === p.id ? null : h))}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      hovered === p.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: colorFor(p) }} />
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                    <span className="flex-1 truncate text-[13px] text-gray-200">{p.title || "Untitled"}</span>
                    <span className="text-[10px] text-gray-600 shrink-0">{relTime(p.updated_date)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
