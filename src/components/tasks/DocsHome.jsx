import React, { useMemo, useState, useRef, useEffect } from "react";
import { Plus, FileText, Folder as FolderIcon, MoreVertical, Pin, PinOff, Trash2, Download, CheckSquare, ArrowUpDown, X, Check } from "lucide-react";
import { ICON_MAP } from "./NotionSidebar";

// Relative "edited X ago" label.
function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString();
}

const typeLabel = (t) => (t === "notion" ? "Page" : t === "document" ? "Document" : "Whiteboard");
const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Download a page as a PDF (its title + text content). Documents/notes carry HTML
// content; whiteboards have no text, so the PDF is just the title.
async function exportPageToPdf(page) {
  const { jsPDF } = await import("jspdf");
  const title = page.title || "Untitled";
  const contentHtml = page.type === "whiteboard" ? "" : (page.content || "");
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-9999px;top:0;width:620px;background:#fff;color:#111;padding:8px 4px;font-family:Inter,Arial,sans-serif";
  holder.innerHTML =
    `<h1 style="font-size:22px;margin:0 0 12px;color:#111">${escapeHtml(title)}</h1>` +
    `<div style="font-size:13px;line-height:1.6;color:#222">${contentHtml || "<p style='color:#666'>(No text content)</p>"}</div>`;
  holder.querySelectorAll("*").forEach((el) => { el.style.color = "#111"; el.style.background = "transparent"; });
  document.body.appendChild(holder);
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    await new Promise((resolve) => {
      doc.html(holder, { x: 32, y: 32, width: 531, windowWidth: 620, callback: (d) => { d.save(`${title}.pdf`); resolve(); } });
    });
  } finally {
    document.body.removeChild(holder);
  }
}

// ── Create-new preview cards (Document / Whiteboard) ───────────────────────────
function DocPreview() {
  return (
    <svg viewBox="0 0 120 80" className="w-full h-full">
      <rect x="20" y="4" width="80" height="72" rx="5" fill="#f8fafc" />
      <rect x="30" y="14" width="42" height="7" rx="2" fill="#3b82f6" />
      <rect x="30" y="30" width="60" height="3.5" rx="1.75" fill="#cbd5e1" />
      <rect x="30" y="39" width="60" height="3.5" rx="1.75" fill="#cbd5e1" />
      <rect x="30" y="48" width="46" height="3.5" rx="1.75" fill="#cbd5e1" />
      <rect x="30" y="60" width="34" height="3.5" rx="1.75" fill="#e2e8f0" />
    </svg>
  );
}
function WhiteboardPreview() {
  return (
    <svg viewBox="0 0 120 80" className="w-full h-full">
      <rect x="8" y="4" width="104" height="72" rx="5" fill="#1f2937" />
      <rect x="22" y="20" width="30" height="20" rx="3" fill="none" stroke="#60a5fa" strokeWidth="2" />
      <circle cx="84" cy="32" r="12" fill="none" stroke="#34d399" strokeWidth="2" />
      <line x1="52" y1="30" x2="72" y2="32" stroke="#9ca3af" strokeWidth="1.5" />
      <rect x="34" y="50" width="26" height="18" rx="2" fill="#fbbf24" opacity="0.85" />
      <rect x="70" y="52" width="26" height="14" rx="2" fill="#f472b6" opacity="0.7" />
    </svg>
  );
}

function CreateCard({ preview, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-blue-500/40 transition-colors overflow-hidden"
    >
      <div className="h-28 bg-[#111214] flex items-center justify-center px-6 py-4 border-b border-white/[0.05]">
        <div className="w-28 h-20 group-hover:scale-105 transition-transform">{preview}</div>
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <Plus className="h-4 w-4 text-blue-400" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-100">{title}</p>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function FolderCard({ page, count, onOpen }) {
  const cfg = ICON_MAP[page.icon] || ICON_MAP.folder;
  const Icon = cfg.icon;
  return (
    <button onClick={() => onOpen(page)} className="group flex items-center gap-3 text-left rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] p-3 transition-colors">
      <div className="h-9 w-9 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
        <Icon className={`h-4 w-4 ${cfg.color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-100 truncate group-hover:text-white">{page.title || "Untitled"}</p>
        <p className="text-[10.5px] text-gray-500 mt-0.5">{count} item{count !== 1 ? "s" : ""}</p>
      </div>
    </button>
  );
}

const SORTS = [
  { key: "modified", label: "Last modified" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
];

export default function DocsHome({ pages, user, onOpen, onCreate, onDelete, onUpdate }) {
  const [sortKey, setSortKey] = useState("modified");
  const [sortOpen, setSortOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [menu, setMenu] = useState(null); // { page, x, y }
  const sortRef = useRef(null);

  useEffect(() => {
    if (!sortOpen) return;
    const h = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [sortOpen]);

  const childCount = useMemo(() => {
    const counts = {};
    for (const p of pages) if (p.parent_id) counts[p.parent_id] = (counts[p.parent_id] || 0) + 1;
    return counts;
  }, [pages]);
  const rootPages = useMemo(() => pages.filter((p) => !p.parent_id), [pages]);
  const folders = useMemo(() => rootPages.filter((p) => childCount[p.id] > 0), [rootPages, childCount]);

  const files = useMemo(() => {
    const list = rootPages.filter((p) => !childCount[p.id]);
    const cmp = {
      modified: (a, b) => (b.updated_date || "").localeCompare(a.updated_date || ""),
      name: (a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled"),
      type: (a, b) => typeLabel(a.type).localeCompare(typeLabel(b.type)) || (a.title || "").localeCompare(b.title || ""),
    }[sortKey];
    // Pinned always first, then the chosen sort.
    return list.sort((a, b) => (!!b.pinned - !!a.pinned) || cmp(a, b));
  }, [rootPages, childCount, sortKey]);

  const ownerName = user?.name || user?.email?.split("@")[0] || "Me";
  const ownerInitial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const massDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} file${ids.length !== 1 ? "s" : ""}? You can restore them from Recently deleted.`)) return;
    for (const id of ids) { const p = files.find((f) => f.id === id); if (p) await onDelete?.(p); }
    exitSelect();
  };
  const rowClick = (p) => { if (selectMode) toggleSelect(p.id); else onOpen(p); };

  return (
    <div className="h-full overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="max-w-5xl mx-auto px-6 py-7">
        {/* Header */}
        <h1 className="text-[22px] leading-[30px] font-semibold text-gray-100 mb-6">My workspace</h1>

        {/* Create new */}
        <section className="mb-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Create new</h2>
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <CreateCard preview={<DocPreview />} title="Document" subtitle="Rich-text notes" onClick={() => onCreate("document")} />
            <CreateCard preview={<WhiteboardPreview />} title="Whiteboard" subtitle="Freeform canvas" onClick={() => onCreate("whiteboard")} />
          </div>
        </section>

        {/* Folders */}
        {folders.length > 0 && (
          <section className="mb-7">
            <div className="flex items-center gap-2 mb-3 text-gray-400">
              <FolderIcon className="h-3.5 w-3.5" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider">Folders</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {folders.map((p) => <FolderCard key={p.id} page={p} count={childCount[p.id] || 0} onOpen={onOpen} />)}
            </div>
          </section>
        )}

        {/* Files */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-3.5 w-3.5 text-gray-400" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Files</h2>
            <div className="flex-1" />
            {/* Sort */}
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-gray-300 text-[11.5px] hover:bg-white/[0.05] transition-colors"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {SORTS.find((s) => s.key === sortKey).label}
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[150px] z-50">
                  {SORTS.map((s) => (
                    <button key={s.key} onClick={() => { setSortKey(s.key); setSortOpen(false); }} className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] ${sortKey === s.key ? "text-blue-300" : "text-gray-300"}`}>
                      <Check className={`h-3 w-3 ${sortKey === s.key ? "opacity-100" : "opacity-0"}`} />
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Select mode */}
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11.5px] transition-colors ${selectMode ? "bg-blue-500/[0.14] border-blue-500/40 text-blue-300" : "border-white/10 text-gray-300 hover:bg-white/[0.05]"}`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectMode ? "Done" : "Select"}
            </button>
          </div>

          {/* Bulk action bar */}
          {selectMode && (
            <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-lg bg-blue-500/[0.08] border border-blue-500/25">
              <span className="text-[12px] text-blue-200">{selected.size} selected</span>
              <div className="flex-1" />
              <button onClick={massDelete} disabled={selected.size === 0} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-300 text-[11.5px] hover:bg-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button onClick={exitSelect} className="p-1 rounded-md text-gray-400 hover:bg-white/[0.06]"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <div className="rounded-xl border border-white/[0.05] overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_150px_34px] md:grid-cols-[1fr_130px_150px_34px] gap-3 items-center px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.05]">
              <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">Name</span>
              <span className="hidden md:block text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">Owner</span>
              <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">Last modified</span>
              <span />
            </div>
            {files.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-gray-600">No files yet — create one above.</div>
            ) : (
              files.map((p) => {
                const cfg = ICON_MAP[p.icon] || ICON_MAP.file;
                const Icon = cfg.icon;
                const isSel = selected.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => rowClick(p)}
                    className={`grid grid-cols-[1fr_150px_34px] md:grid-cols-[1fr_130px_150px_34px] gap-3 items-center px-4 py-2.5 border-b border-white/[0.03] cursor-pointer transition-colors last:border-b-0 ${isSel ? "bg-blue-500/[0.08]" : "hover:bg-white/[0.03]"}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {selectMode && (
                        <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSel ? "bg-blue-500 border-blue-500" : "border-white/30"}`}>
                          {isSel && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </span>
                      )}
                      <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                      <span className="text-[13px] text-gray-200 truncate">{p.title || "Untitled"}</span>
                      {p.pinned && <Pin className="h-3 w-3 text-amber-400 shrink-0" />}
                      <span className="text-[9.5px] text-gray-500 bg-white/[0.05] rounded px-1.5 py-0.5 shrink-0 hidden sm:inline">{typeLabel(p.type)}</span>
                    </div>
                    <div className="hidden md:flex items-center gap-2 min-w-0">
                      <span className="h-5 w-5 rounded-full bg-blue-500/25 text-blue-200 text-[9px] font-bold flex items-center justify-center shrink-0">{ownerInitial}</span>
                      <span className="text-[12px] text-gray-400 truncate">{ownerName}</span>
                    </div>
                    <span className="text-[12px] text-gray-400">{relTime(p.updated_date)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ page: p, x: Math.min(r.left, window.innerWidth - 190), y: r.bottom + 4 }); }}
                      title="More actions"
                      className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] justify-self-end"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Per-file actions menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="fixed z-50 w-[180px] bg-[#2a2b2d] border border-white/[0.1] rounded-xl shadow-2xl py-1" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { onUpdate?.(menu.page.id, { pinned: !menu.page.pinned }); setMenu(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-gray-200 hover:bg-white/[0.06]"
            >
              {menu.page.pinned ? <PinOff className="h-4 w-4 text-gray-400" /> : <Pin className="h-4 w-4 text-amber-400" />}
              {menu.page.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={() => { const p = menu.page; setMenu(null); exportPageToPdf(p).catch(() => alert("Could not export PDF.")); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-gray-200 hover:bg-white/[0.06]"
            >
              <Download className="h-4 w-4 text-blue-400" /> Share (Download PDF)
            </button>
            <div className="h-px bg-white/[0.08] my-1" />
            <button
              onClick={() => { const p = menu.page; setMenu(null); onDelete?.(p); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-rose-300 hover:bg-rose-500/15"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
