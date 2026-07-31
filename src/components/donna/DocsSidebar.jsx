// The left rail: your folders, expanding in place.
//
// Folders open inside the rail rather than in a panel over the orb — clicking
// "Logs & Notes" pushes its groups down the list, clicking a group pushes its
// documents down again. Only picking an actual document changes the main screen.
import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, FileText, Brain, RefreshCw, PanelLeftClose, MessageSquare } from "lucide-react";

const groupIcon = (id) => (id === "logs-memories" ? Brain : FileText);

export default function DocsSidebar({ library, activeKey, onOpen, onRefresh, onCollapse, loading }) {
  // Logs open by default — it's the folder you'll live in.
  const [openFolders, setOpenFolders] = useState(() => new Set(["logs"]));
  const [openGroups, setOpenGroups] = useState(() => new Set(["logs-logs"]));

  const toggle = (set, setter) => (id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };
  const toggleFolder = toggle(openFolders, setOpenFolders);
  const toggleGroup = toggle(openGroups, setOpenGroups);

  const folders = (library && library.folders) || [];

  return (
    <aside className="z-20 flex h-full w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0b0d12]/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Library</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
            title="Refresh"
            aria-label="Refresh library"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
            title="Hide sidebar"
            aria-label="Hide sidebar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto pb-4">
        {folders.map((folder) => {
          const open = openFolders.has(folder.id);
          const total = folder.groups.reduce((n, g) => n + g.docs.length, 0);
          const FolderIcon = open ? FolderOpen : Folder;
          return (
            <div key={folder.id} className="px-2">
              <button
                type="button"
                onClick={() => toggleFolder(folder.id)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-gray-200 transition-colors hover:bg-white/[0.05]"
              >
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${open ? "rotate-90" : ""}`} />
                <FolderIcon className={`h-4 w-4 shrink-0 ${folder.id === "chats" ? "text-blue-300/80" : "text-cyan-300/80"}`} />
                <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-gray-600">{total}</span>
              </button>

              {open && (
                <div className="mb-1 ml-3 border-l border-white/[0.06] pl-1.5">
                  {folder.groups.map((group) => {
                    const gOpen = openGroups.has(group.id);
                    const GroupIcon = groupIcon(group.id);
                    return (
                      <div key={group.id}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] text-gray-400 transition-colors hover:bg-white/[0.04] hover:text-gray-200"
                        >
                          <ChevronRight className={`h-3 w-3 shrink-0 text-gray-600 transition-transform ${gOpen ? "rotate-90" : ""}`} />
                          <span className="min-w-0 flex-1 truncate">{group.label}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-gray-600">{group.docs.length}</span>
                        </button>

                        {gOpen && (
                          <ul className="ml-2 border-l border-white/[0.05] pl-1">
                            {group.docs.length === 0 && (
                              <li className="px-2 py-1 text-[11px] italic text-gray-600">empty</li>
                            )}
                            {group.docs.map((doc) => {
                              const active = doc.key === activeKey;
                              const Icon = folder.id === "chats" ? MessageSquare : GroupIcon;
                              return (
                                <li key={doc.key}>
                                  <button
                                    type="button"
                                    onClick={() => onOpen(doc)}
                                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] transition-colors ${
                                      active
                                        ? "bg-cyan-500/15 text-cyan-100"
                                        : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                                    }`}
                                    title={doc.title}
                                  >
                                    <Icon className="h-3 w-3 shrink-0 opacity-70" />
                                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
