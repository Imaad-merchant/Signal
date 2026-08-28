import React, { useMemo, useState } from "react";
import { Plus, FileText, Clock, Folder as FolderIcon, Upload, List, LayoutGrid, MoreVertical, ChevronDown } from "lucide-react";
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

// Big "Suggested for you" card.
function BigCard({ page, onOpen }) {
  const cfg = ICON_MAP[page.icon] || ICON_MAP.file;
  const Icon = cfg.icon;
  return (
    <button
      onClick={() => onOpen(page)}
      className="group text-left rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] p-4 transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-9 w-9 rounded-lg bg-white/[0.04] flex items-center justify-center">
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{typeLabel(page.type)}</span>
      </div>
      <h3 className="text-sm font-medium text-gray-100 truncate group-hover:text-white">{page.title || "Untitled"}</h3>
      <p className="text-[11px] text-gray-500 mt-1">Edited {relTime(page.updated_date)}</p>
    </button>
  );
}

// Folder card (a page that contains sub-pages).
function FolderCard({ page, count, onOpen }) {
  const cfg = ICON_MAP[page.icon] || ICON_MAP.folder;
  const Icon = cfg.icon;
  return (
    <button
      onClick={() => onOpen(page)}
      className="group flex items-center gap-3 text-left rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] p-3 transition-colors"
    >
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

// A decorative filter chip (visual parity with the design; not yet wired to a filter).
function FilterChip({ label, active = false }) {
  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11.5px] transition-colors ${
        active
          ? "bg-blue-500/[0.14] border-blue-500/40 text-blue-300"
          : "border-white/10 text-gray-400 hover:bg-white/[0.04]"
      }`}
    >
      {label}
      <ChevronDown className="h-3 w-3" />
    </button>
  );
}

// Workspace browser — the first thing you see when opening the workspace.
// Drive-style: suggested cards, folders, and a files table.
export default function DocsHome({ pages, user, onOpen, onCreate, onImport }) {
  const [layout, setLayout] = useState("list"); // "list" (table) | "grid"

  const recents = useMemo(
    () => [...pages].sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || "")),
    [pages]
  );
  // Folders = root pages that contain sub-pages; files = root pages that don't.
  const childCount = useMemo(() => {
    const counts = {};
    for (const p of pages) if (p.parent_id) counts[p.parent_id] = (counts[p.parent_id] || 0) + 1;
    return counts;
  }, [pages]);
  const rootPages = useMemo(() => recents.filter((p) => !p.parent_id), [recents]);
  const folders = useMemo(() => rootPages.filter((p) => childCount[p.id] > 0), [rootPages, childCount]);
  const files = useMemo(() => rootPages.filter((p) => !childCount[p.id]), [rootPages, childCount]);
  const suggested = recents.slice(0, 3);

  const ownerName = user?.name || user?.email?.split("@")[0] || "Me";
  const ownerInitial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="h-full overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="max-w-5xl mx-auto px-6 py-7">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-[22px] leading-[30px] font-semibold text-gray-100 truncate">My workspace</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onImport || onCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 text-[12.5px] font-medium hover:bg-white/[0.04] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <div className="flex items-center bg-[#2a2b2d] rounded-lg border border-white/[0.05] overflow-hidden">
              <button
                onClick={() => setLayout("list")}
                title="List view"
                className={`px-2.5 py-1.5 ${layout === "list" ? "bg-white/[0.06] text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setLayout("grid")}
                title="Grid view"
                className={`px-2.5 py-1.5 ${layout === "grid" ? "bg-white/[0.06] text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mb-7">
          <FilterChip label="Type" />
          <FilterChip label="Owner" />
          <FilterChip label="Modified this week" active />
        </div>

        {pages.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-14 w-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
              <FileText className="h-6 w-6 text-gray-500" />
            </div>
            <h2 className="text-lg font-medium text-gray-200">Create your first document</h2>
            <p className="text-sm text-gray-500 mt-1 mb-5">Whiteboards, notes, and docs all live here.</p>
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
            >
              <Plus className="h-4 w-4" /> New document
            </button>
          </div>
        ) : (
          <>
            {/* Suggested for you */}
            {suggested.length > 0 && (
              <section className="mb-7">
                <div className="flex items-center gap-2 mb-3 text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider">Suggested for you</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {suggested.map((p) => (
                    <BigCard key={p.id} page={p} onOpen={onOpen} />
                  ))}
                </div>
              </section>
            )}

            {/* Folders */}
            {folders.length > 0 && (
              <section className="mb-7">
                <div className="flex items-center gap-2 mb-3 text-gray-400">
                  <FolderIcon className="h-3.5 w-3.5" />
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider">Folders</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {folders.map((p) => (
                    <FolderCard key={p.id} page={p} count={childCount[p.id] || 0} onOpen={onOpen} />
                  ))}
                </div>
              </section>
            )}

            {/* Files */}
            <section>
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                <FileText className="h-3.5 w-3.5" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider">Files</h2>
              </div>

              {layout === "list" ? (
                <div className="rounded-xl border border-white/[0.05] overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_150px_34px] md:grid-cols-[1fr_130px_150px_34px] gap-3 items-center px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.05]">
                    <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">Name</span>
                    <span className="hidden md:block text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">Owner</span>
                    <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">Last modified</span>
                    <span />
                  </div>
                  {files.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-gray-600">No files yet — create one with New.</div>
                  ) : (
                    files.map((p) => {
                      const cfg = ICON_MAP[p.icon] || ICON_MAP.file;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={p.id}
                          onClick={() => onOpen(p)}
                          className="grid grid-cols-[1fr_150px_34px] md:grid-cols-[1fr_130px_150px_34px] gap-3 items-center px-4 py-2.5 border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-colors last:border-b-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                            <span className="text-[13px] text-gray-200 truncate">{p.title || "Untitled"}</span>
                            <span className="text-[9.5px] text-gray-500 bg-white/[0.05] rounded px-1.5 py-0.5 shrink-0 hidden sm:inline">{typeLabel(p.type)}</span>
                          </div>
                          <div className="hidden md:flex items-center gap-2 min-w-0">
                            <span className="h-5 w-5 rounded-full bg-blue-500/25 text-blue-200 text-[9px] font-bold flex items-center justify-center shrink-0">{ownerInitial}</span>
                            <span className="text-[12px] text-gray-400 truncate">{ownerName}</span>
                          </div>
                          <span className="text-[12px] text-gray-400">{relTime(p.updated_date)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpen(p); }}
                            title="More actions"
                            className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.05] justify-self-end"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {files.map((p) => {
                    const cfg = ICON_MAP[p.icon] || ICON_MAP.file;
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onOpen(p)}
                        className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.04] hover:border-white/[0.1] transition-colors text-left"
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                        <span className="flex-1 truncate text-[13px] text-gray-200 group-hover:text-white">{p.title || "Untitled"}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">{relTime(p.updated_date)}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={onCreate}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-white/[0.12] text-gray-500 hover:text-gray-300 hover:border-white/[0.2] hover:bg-white/[0.02] transition-colors"
                  >
                    <Plus className="h-4 w-4" /> New document
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
