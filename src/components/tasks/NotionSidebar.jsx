import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronRight, ChevronDown, Plus, Home, Search, FileText, MoreHorizontal, Trash2, GraduationCap, Briefcase, Heart, Sparkles, Calendar as CalendarIcon, Star, Folder, FolderOpen, Wand2, Undo2, Pencil, Palette, CornerUpLeft } from "lucide-react";

const ICON_OPTIONS = [
  { key: "file", icon: FileText, color: "text-gray-400" },
  { key: "grad", icon: GraduationCap, color: "text-blue-400" },
  { key: "brief", icon: Briefcase, color: "text-amber-400" },
  { key: "heart", icon: Heart, color: "text-rose-400" },
  { key: "spark", icon: Sparkles, color: "text-purple-400" },
  { key: "cal", icon: CalendarIcon, color: "text-emerald-400" },
  { key: "star", icon: Star, color: "text-yellow-400" },
  { key: "folder", icon: Folder, color: "text-orange-400" },
];

export const ICON_MAP = Object.fromEntries(ICON_OPTIONS.map(o => [o.key, o]));

// Right-click context menu (positioned absolutely at cursor)
function PageContextMenu({ position, page, onClose, onSelect, onRename, onChangeIcon, onMoveToRoot, onDelete }) {
  const ref = useRef(null);
  const [iconSubOpen, setIconSubOpen] = useState(false);
  const [adjustedPos, setAdjustedPos] = useState(position);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 8;
    let x = position.x;
    let y = position.y;
    if (x + rect.width + pad > window.innerWidth) x = Math.max(pad, window.innerWidth - rect.width - pad);
    if (y + rect.height + pad > window.innerHeight) y = Math.max(pad, window.innerHeight - rect.height - pad);
    setAdjustedPos({ x, y });
  }, [position, iconSubOpen]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const style = { position: "fixed", top: adjustedPos.y, left: adjustedPos.x, zIndex: 9999 };

  return (
    <div ref={ref} style={style} className="w-48 bg-[#2d2e30] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden text-sm">
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <p className="text-[11px] text-gray-500 truncate">{page.title || "Untitled"}</p>
      </div>

      {iconSubOpen ? (
        <div className="p-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Pick an icon</p>
          <div className="grid grid-cols-4 gap-1">
            {Object.entries(ICON_MAP).map(([key, cfg]) => {
              const I = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => { onChangeIcon(key); onClose(); }}
                  className={`p-1.5 rounded-md hover:bg-white/[0.06] ${page.icon === key ? "bg-white/[0.08]" : ""}`}
                  title={key}
                >
                  <I className={`h-4 w-4 ${cfg.color} mx-auto`} />
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setIconSubOpen(false)}
            className="w-full mt-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-300 text-left"
          >
            ← Back
          </button>
        </div>
      ) : (
        <div className="p-1">
          <button
            onClick={() => { onSelect(); onClose(); }}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md hover:bg-white/[0.05] text-gray-300 text-xs"
          >
            <FileText className="h-3.5 w-3.5 text-gray-500" /> Open
          </button>
          <button
            onClick={() => { onRename(); onClose(); }}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md hover:bg-white/[0.05] text-gray-300 text-xs"
          >
            <Pencil className="h-3.5 w-3.5 text-gray-500" /> Rename
          </button>
          <button
            onClick={() => setIconSubOpen(true)}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md hover:bg-white/[0.05] text-gray-300 text-xs"
          >
            <Palette className="h-3.5 w-3.5 text-gray-500" /> Change icon
          </button>
          {page.parent_id && (
            <button
              onClick={() => { onMoveToRoot(); onClose(); }}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md hover:bg-white/[0.05] text-gray-300 text-xs"
            >
              <CornerUpLeft className="h-3.5 w-3.5 text-gray-500" /> Move to root
            </button>
          )}
          <div className="border-t border-white/[0.06] my-1" />
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md hover:bg-red-500/15 text-rose-400 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function PageNode({ page, allPages, depth, selectedId, onSelect, onCreate, onDelete, onRename, onChangeIcon, onUpdate, onOpenContextMenu, draggingId, setDraggingId, onMove, dragOverId, setDragOverId }) {
  const children = useMemo(() => allPages.filter(p => p.parent_id === page.id), [allPages, page.id]);
  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(`pulse_page_expanded_${page.id}`) === "true"; } catch { return false; }
  });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(page.title || "");

  const toggleExpand = (e) => {
    e.stopPropagation();
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(`pulse_page_expanded_${page.id}`, String(next)); } catch {}
  };

  const startRename = () => {
    setRenameValue(page.title || "");
    setRenaming(true);
  };

  const commitRename = () => {
    setRenaming(false);
    const v = renameValue.trim();
    if (v !== (page.title || "")) onUpdate(page.id, { title: v });
  };

  // Drag handlers
  const handleDragStart = (e) => {
    e.stopPropagation();
    setDraggingId(page.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", page.id);
  };
  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggingId && draggingId !== page.id) {
      // prevent dropping onto a descendant
      let cur = page;
      let safe = true;
      const all = allPages;
      const visited = new Set();
      while (cur?.parent_id && !visited.has(cur.id)) {
        visited.add(cur.id);
        if (cur.parent_id === draggingId) { safe = false; break; }
        cur = all.find(p => p.id === cur.parent_id);
      }
      if (safe) setDragOverId(page.id);
    }
  };
  const handleDragLeave = (e) => {
    e.stopPropagation();
    if (dragOverId === page.id) setDragOverId(null);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    if (draggingId && draggingId !== page.id) {
      // also prevent descendant drop
      let cur = page;
      let safe = true;
      const visited = new Set();
      while (cur?.parent_id && !visited.has(cur.id)) {
        visited.add(cur.id);
        if (cur.parent_id === draggingId) { safe = false; break; }
        cur = allPages.find(p => p.id === cur.parent_id);
      }
      if (safe) {
        onMove(draggingId, page.id);
        if (!expanded) {
          setExpanded(true);
          try { localStorage.setItem(`pulse_page_expanded_${page.id}`, "true"); } catch {}
        }
      }
    }
    setDraggingId(null);
  };

  // If this page has sub-pages, show it as a folder
  let Icon, iconColor;
  if (hasChildren) {
    Icon = expanded ? FolderOpen : Folder;
    iconColor = "text-amber-400/80";
  } else {
    const iconCfg = ICON_MAP[page.icon] || ICON_MAP.file;
    Icon = iconCfg.icon;
    iconColor = iconCfg.color;
  }

  const isSelected = selectedId === page.id;
  const isDragOver = dragOverId === page.id;
  const isDragging = draggingId === page.id;

  return (
    <div className="relative">
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !renaming && onSelect(page)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenContextMenu(page, { x: e.clientX, y: e.clientY }, { startRename });
        }}
        className={`group flex items-center gap-1 pr-1 rounded-md cursor-pointer transition-colors ${
          isDragOver ? "bg-blue-500/20 ring-1 ring-blue-500/40" : isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
        } ${isDragging ? "opacity-40" : ""}`}
        style={{ paddingLeft: `${4 + depth * 12}px` }}
      >
        <button
          onClick={toggleExpand}
          className={`shrink-0 p-0.5 rounded hover:bg-white/[0.08] transition-colors ${hasChildren ? "text-gray-500" : "opacity-0 pointer-events-none"}`}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { setRenameValue(page.title || ""); setRenaming(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-[#1e1f20] border border-white/[0.12] rounded px-1 py-0.5 text-[12.5px] text-gray-200 focus:outline-none focus:border-blue-500/40"
          />
        ) : (
          <span className={`flex-1 text-[13px] truncate py-1 ${hasChildren ? "text-gray-200 font-medium" : "text-gray-300"}`}>
            {page.title || "Untitled"}
          </span>
        )}
        {hasChildren && !renaming && (
          <span className="text-[10px] text-gray-600 mr-1">{children.length}</span>
        )}
        {!renaming && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onOpenContextMenu(page, { x: rect.right, y: rect.bottom }, { startRename });
              }}
              className="p-0.5 rounded hover:bg-white/[0.08] text-gray-500"
              title="More"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCreate(page.id); }}
              className="p-0.5 rounded hover:bg-white/[0.08] text-gray-500"
              title="Add sub-page"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {children.map(child => (
            <PageNode
              key={child.id}
              page={child}
              allPages={allPages}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreate={onCreate}
              onDelete={onDelete}
              onRename={onRename}
              onChangeIcon={onChangeIcon}
              onUpdate={onUpdate}
              onOpenContextMenu={onOpenContextMenu}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              onMove={onMove}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NotionSidebar({
  pages,
  user,
  view,
  onSelectHome,
  onSelectPage,
  onCreatePage,
  onDeletePage,
  onUpdatePage,
  selectedPageId,
  aiAutoOrganize,
  onToggleAutoOrganize,
  onOrganizeNow,
  onUndoAI,
  canUndoAI,
  aiOrganizing,
}) {
  const rootPages = useMemo(() => pages.filter(p => !p.parent_id), [pages]);
  const recents = useMemo(() => {
    const sorted = [...pages].sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || ""));
    return sorted;
  }, [pages]);

  const [recentsExpanded, setRecentsExpanded] = useState(false);
  const visibleRecents = recentsExpanded ? recents.slice(0, 15) : recents.slice(0, 3);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Drag state
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [rootDragOver, setRootDragOver] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState(null); // { page, position, startRename }

  const openContextMenu = (page, position, helpers) => {
    setCtxMenu({ page, position, startRename: helpers?.startRename });
  };
  const closeContextMenu = () => setCtxMenu(null);

  const handleMove = (draggedId, newParentId) => {
    if (draggedId === newParentId) return;
    onUpdatePage(draggedId, { parent_id: newParentId });
  };

  const handleDropRoot = (e) => {
    e.preventDefault();
    setRootDragOver(false);
    if (draggingId) {
      onUpdatePage(draggingId, { parent_id: null });
    }
    setDraggingId(null);
  };

  const filteredSearch = searchQuery
    ? pages.filter(p => (p.title || "").toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : [];

  const isHome = view === "home";

  return (
    <div className="w-60 bg-[#1c1d1e] border-r border-white/[0.06] flex flex-col h-full shrink-0">
      {/* Workspace header */}
      <div className="px-3 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center gap-1.5 text-[13px] text-gray-300">
          <div className="h-4 w-4 rounded bg-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-300">
            {(user?.name || user?.email || "U")[0].toUpperCase()}
          </div>
          <span className="font-medium truncate flex-1">{user?.name || "Workspace"}</span>
        </div>
      </div>

      {/* Top actions */}
      <div className="px-2 py-2 space-y-0.5">
        <button
          onClick={onSelectHome}
          className={`flex items-center gap-2 w-full px-2 py-1 rounded-md text-[13px] transition-colors ${
            isHome ? "bg-white/[0.06] text-gray-100" : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
          }`}
        >
          <Home className="h-3.5 w-3.5" />
          Home
        </button>
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-[13px] text-gray-400 hover:bg-white/[0.03] hover:text-gray-200 transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
      </div>

      {/* Search input */}
      {searchOpen && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pages..."
            className="w-full bg-[#2a2b2d] border border-white/[0.06] rounded-md px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/[0.15]"
          />
          {filteredSearch.length > 0 && (
            <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
              {filteredSearch.map(p => {
                const iconCfg = ICON_MAP[p.icon] || ICON_MAP.file;
                const Icon = iconCfg.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => { onSelectPage(p); setSearchOpen(false); setSearchQuery(""); }}
                    className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-[12px] text-gray-300 hover:bg-white/[0.05]"
                  >
                    <Icon className={`h-3 w-3 ${iconCfg.color}`} />
                    <span className="truncate">{p.title || "Untitled"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI Organizer Banner */}
      <div className="mx-2 mb-2 rounded-lg border border-purple-500/15 bg-purple-500/[0.05] px-2 py-1.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <Wand2 className="h-3 w-3 text-purple-400" />
            <span className="text-[11px] font-medium text-purple-300">AI Organizer</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer" title="Auto-organize on changes">
            <input
              type="checkbox"
              checked={!!aiAutoOrganize}
              onChange={(e) => onToggleAutoOrganize(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-6 h-3.5 bg-gray-700 peer-checked:bg-purple-500 rounded-full peer-checked:after:translate-x-2.5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all" />
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOrganizeNow}
            disabled={aiOrganizing || pages.length < 2}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10.5px] font-medium bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="h-2.5 w-2.5" />
            {aiOrganizing ? "Organizing..." : "Organize now"}
          </button>
          <button
            onClick={onUndoAI}
            disabled={!canUndoAI}
            className="px-2 py-1 rounded text-[10.5px] font-medium bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Undo last AI organization"
          >
            <Undo2 className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto px-2 py-1 space-y-3"
        onDragOver={(e) => {
          e.preventDefault();
          if (draggingId) {
            const page = pages.find(p => p.id === draggingId);
            if (page?.parent_id) setRootDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setRootDragOver(false);
        }}
        onDrop={handleDropRoot}
      >
        {/* Recents */}
        {recents.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2 py-1">Recents</p>
            <div className="space-y-0.5">
              {visibleRecents.map(p => {
                const iconCfg = ICON_MAP[p.icon] || ICON_MAP.file;
                const Icon = iconCfg.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectPage(p)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openContextMenu(p, { x: e.clientX, y: e.clientY });
                    }}
                    className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-[12.5px] transition-colors text-left ${
                      selectedPageId === p.id ? "bg-white/[0.06] text-gray-100" : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${iconCfg.color}`} />
                    <span className="truncate">{p.title || "Untitled"}</span>
                  </button>
                );
              })}
              {recents.length > 3 && (
                <button
                  onClick={() => setRecentsExpanded(!recentsExpanded)}
                  className="flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-[11px] text-gray-600 hover:text-gray-400 hover:bg-white/[0.03] transition-colors"
                >
                  {recentsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {recentsExpanded ? "Show less" : `Show ${Math.min(recents.length - 3, 12)} more`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Private section */}
        <div className={rootDragOver ? "rounded-md ring-1 ring-blue-500/30 bg-blue-500/[0.04] -mx-1 px-1" : ""}>
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Private</p>
            <button
              onClick={() => onCreatePage(null, "private")}
              className="p-0.5 rounded hover:bg-white/[0.05] text-gray-500"
              title="New page"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {rootPages.length === 0 ? (
            <button
              onClick={() => onCreatePage(null, "private")}
              className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-[12.5px] text-gray-600 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add a page
            </button>
          ) : (
            rootPages.map(p => (
              <PageNode
                key={p.id}
                page={p}
                allPages={pages}
                depth={0}
                selectedId={selectedPageId}
                onSelect={onSelectPage}
                onCreate={onCreatePage}
                onDelete={onDeletePage}
                onUpdate={onUpdatePage}
                onOpenContextMenu={openContextMenu}
                draggingId={draggingId}
                setDraggingId={setDraggingId}
                onMove={handleMove}
                dragOverId={dragOverId}
                setDragOverId={setDragOverId}
              />
            ))
          )}
        </div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <PageContextMenu
          page={ctxMenu.page}
          position={ctxMenu.position}
          onClose={closeContextMenu}
          onSelect={() => onSelectPage(ctxMenu.page)}
          onRename={() => ctxMenu.startRename?.()}
          onChangeIcon={(iconKey) => onUpdatePage(ctxMenu.page.id, { icon: iconKey })}
          onMoveToRoot={() => onUpdatePage(ctxMenu.page.id, { parent_id: null })}
          onDelete={() => onDeletePage(ctxMenu.page)}
        />
      )}
    </div>
  );
}
