import React, { useMemo } from "react";
import { Plus, FileText, Clock, LayoutGrid } from "lucide-react";
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

function RowCard({ page, onOpen }) {
  const cfg = ICON_MAP[page.icon] || ICON_MAP.file;
  const Icon = cfg.icon;
  return (
    <button
      onClick={() => onOpen(page)}
      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.04] hover:border-white/[0.1] transition-colors text-left"
    >
      <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
      <span className="flex-1 truncate text-[13px] text-gray-200 group-hover:text-white">{page.title || "Untitled"}</span>
      <span className="text-[10px] text-gray-600 shrink-0">{relTime(page.updated_date)}</span>
    </button>
  );
}

// Documents landing — the first thing you see when opening the workspace.
// Surfaces recently-edited docs to continue, plus a clear "New document" path.
export default function DocsHome({ pages, user, onOpen, onCreate }) {
  const recents = useMemo(
    () => [...pages].sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || "")),
    [pages]
  );
  const top = recents.slice(0, 3);
  const greeting = user?.name ? `Welcome back, ${user.name.split(" ")[0]}` : "Your workspace";

  return (
    <div className="h-full overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-100 truncate">{greeting}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {pages.length} document{pages.length !== 1 ? "s" : ""} in your workspace
            </p>
          </div>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-600/20 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" /> New document
          </button>
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
            {/* Continue where you left off */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider">Continue where you left off</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {top.map((p) => (
                  <BigCard key={p.id} page={p} onOpen={onOpen} />
                ))}
              </div>
            </section>

            {/* All documents */}
            <section>
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                <LayoutGrid className="h-3.5 w-3.5" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider">All documents</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {recents.map((p) => (
                  <RowCard key={p.id} page={p} onOpen={onOpen} />
                ))}
                <button
                  onClick={onCreate}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-white/[0.12] text-gray-500 hover:text-gray-300 hover:border-white/[0.2] hover:bg-white/[0.02] transition-colors"
                >
                  <Plus className="h-4 w-4" /> New document
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
