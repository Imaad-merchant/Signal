import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Search, ArrowLeft, Loader2, Folder, History, StickyNote, ChevronDown, ChevronUp, Check, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatePresence } from "framer-motion";
import TaskCard from "../components/tasks/TaskCard";
import AddTaskDialog from "../components/tasks/AddTaskDialog";
import NotionSidebar from "../components/tasks/NotionSidebar";
import NotionPageView from "../components/tasks/NotionPageView";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, isSameDay, isToday, parseISO } from "date-fns";

const PULL_THRESHOLD = 70;

export default function Tasks() {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [showPastTasks, setShowPastTasks] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef(null);
  const todayRef = useRef(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(null);

  // Notepad (stored in localStorage for simplicity and speed)
  const [notepadOpen, setNotepadOpen] = useState(() => localStorage.getItem("pulse_notepad_open") === "true");
  const [notepadText, setNotepadText] = useState(() => localStorage.getItem("pulse_notepad_text") || "");
  const [notepadSaved, setNotepadSaved] = useState(false);
  const notepadDebounce = useRef(null);

  const handleNotepadChange = (e) => {
    const text = e.target.value;
    setNotepadText(text);
    setNotepadSaved(false);
    if (notepadDebounce.current) clearTimeout(notepadDebounce.current);
    notepadDebounce.current = setTimeout(() => {
      localStorage.setItem("pulse_notepad_text", text);
      setNotepadSaved(true);
      setTimeout(() => setNotepadSaved(false), 2000);
    }, 500);
  };

  const toggleNotepad = () => {
    const next = !notepadOpen;
    setNotepadOpen(next);
    localStorage.setItem("pulse_notepad_open", String(next));
  };

  const [categoryFolders, setCategoryFolders] = useState(() => {
    try { const s = localStorage.getItem("pulse_category_folders"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  useEffect(() => {
    const handler = () => {
      try { const s = localStorage.getItem("pulse_category_folders"); setCategoryFolders(s ? JSON.parse(s) : []); } catch {}
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.page === "Tasks") {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        setSearch("");
        setStatusFilter("all");
        setPriorityFilter("all");
        setCategoryFilter("all");
      }
    };
    window.addEventListener("tab-reset", handler);
    return () => window.removeEventListener("tab-reset", handler);
  }, []);

  const handleTouchStart = (e) => {
    if (scrollRef.current?.scrollTop === 0) touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e) => {
    if (touchStartY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setPullY(Math.min(delta * 0.45, PULL_THRESHOLD + 20));
  };
  const handleTouchEnd = async () => {
    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(PULL_THRESHOLD);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setRefreshing(false);
    }
    setPullY(0);
    touchStartY.current = null;
  };

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", user?.email],
    queryFn: () => base44.entities.Task.filter({ created_by: user.email }, "-created_date"),
    enabled: !!user,
  });

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["categories", user?.email],
    queryFn: () => base44.entities.Category.list(),
    enabled: !!user,
  });

  // ─── Notion-style Pages ────────────────────────────────────────────
  const { data: pages = [] } = useQuery({
    queryKey: ["pages", user?.email],
    queryFn: () => base44.entities.Page.list("-updated_date"),
    enabled: !!user,
  });

  const [view, setView] = useState("home"); // "home" or "page"
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("pulse_notion_sidebar") !== "false");

  // AI Organizer state
  const [aiAutoOrganize, setAiAutoOrganize] = useState(() => localStorage.getItem("pulse_ai_auto_organize") === "true");
  const [aiOrganizing, setAiOrganizing] = useState(false);
  const [aiUndoStack, setAiUndoStack] = useState([]); // stack of { actions: [{pageId, prevParentId}], createdFolderIds: [] }
  const aiAutoTimer = useRef(null);
  const aiLastRunHash = useRef("");
  const [aiBanner, setAiBanner] = useState(null); // { reasoning, count }

  useEffect(() => {
    localStorage.setItem("pulse_notion_sidebar", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem("pulse_ai_auto_organize", String(aiAutoOrganize));
  }, [aiAutoOrganize]);

  const refreshPages = () => queryClient.invalidateQueries({ queryKey: ["pages"] });

  const handleCreatePage = async (parentId = null, section = "private") => {
    const newPage = await base44.entities.Page.create({
      title: "",
      icon: "file",
      parent_id: parentId || null,
      section,
      status: "not_started",
      content: "",
    });
    refreshPages();
    setSelectedPageId(newPage.id);
    setView("page");
  };

  const handleUpdatePage = async (patch) => {
    if (!selectedPageId) return;
    queryClient.setQueryData(["pages", user?.email], (old = []) =>
      old.map(p => p.id === selectedPageId ? { ...p, ...patch, updated_date: new Date().toISOString() } : p)
    );
    await base44.entities.Page.update(selectedPageId, patch);
  };

  // Generic version for sidebar actions (rename, move, change icon)
  const handleUpdatePageById = async (pageId, patch) => {
    if (!pageId) return;
    queryClient.setQueryData(["pages", user?.email], (old = []) =>
      old.map(p => p.id === pageId ? { ...p, ...patch, updated_date: new Date().toISOString() } : p)
    );
    try { await base44.entities.Page.update(pageId, patch); } catch (e) { console.error(e); }
  };

  const handleDeletePage = async (page) => {
    if (!confirm(`Delete "${page.title || 'Untitled'}"?`)) return;
    // Also delete sub-pages
    const toDelete = [page.id];
    const walk = (parentId) => {
      pages.filter(p => p.parent_id === parentId).forEach(child => { toDelete.push(child.id); walk(child.id); });
    };
    walk(page.id);
    await Promise.all(toDelete.map(id => base44.entities.Page.delete(id)));
    if (selectedPageId === page.id) { setSelectedPageId(null); setView("home"); }
    refreshPages();
  };

  const selectedPage = pages.find(p => p.id === selectedPageId);

  // ─── AI Organizer ─────────────────────────────────────────────────
  const runAIOrganize = useCallback(async () => {
    if (aiOrganizing || pages.length < 2) return;
    setAiOrganizing(true);
    try {
      const res = await base44.functions.invoke("organizePages", { pages });
      const result = res.data || {};
      const actions = result.actions || [];
      if (actions.length === 0) {
        setAiBanner({ reasoning: result.reasoning || "Nothing to reorganize", count: 0 });
        setTimeout(() => setAiBanner(null), 3500);
        return;
      }

      // Process create_folder actions first; map tempId → real id
      const tempToReal = {};
      const createdFolderIds = [];
      for (const act of actions) {
        if (act.action === "create_folder" && act.tempId) {
          const newFolder = await base44.entities.Page.create({
            title: act.title || "New Folder",
            icon: act.icon || "folder",
            parent_id: null,
            section: "private",
            status: "not_started",
            content: "",
          });
          tempToReal[act.tempId] = newFolder.id;
          createdFolderIds.push(newFolder.id);
        }
      }

      // Capture previous parents for undo, then apply set_parent
      const reverseActions = [];
      for (const act of actions) {
        if (act.action === "set_parent" && act.pageId) {
          const page = pages.find(p => p.id === act.pageId);
          if (!page) continue;
          const newParentId = act.newParentId && tempToReal[act.newParentId] ? tempToReal[act.newParentId] : (act.newParentId || null);
          if (page.parent_id === newParentId) continue;
          reverseActions.push({ pageId: page.id, prevParentId: page.parent_id || null });
          await base44.entities.Page.update(page.id, { parent_id: newParentId });
        }
      }

      if (reverseActions.length > 0 || createdFolderIds.length > 0) {
        setAiUndoStack(prev => [...prev, { actions: reverseActions, createdFolderIds }].slice(-10));
      }

      refreshPages();
      setAiBanner({ reasoning: result.reasoning || "Pages reorganized", count: reverseActions.length + createdFolderIds.length });
      setTimeout(() => setAiBanner(null), 5000);
    } catch (err) {
      console.error("AI organize failed:", err);
      setAiBanner({ reasoning: "AI organize failed", count: 0 });
      setTimeout(() => setAiBanner(null), 3000);
    } finally {
      setAiOrganizing(false);
    }
  }, [pages, aiOrganizing]);

  const undoAIOrganize = useCallback(async () => {
    if (aiUndoStack.length === 0) return;
    const last = aiUndoStack[aiUndoStack.length - 1];
    setAiUndoStack(prev => prev.slice(0, -1));
    // Revert parent assignments
    for (const { pageId, prevParentId } of last.actions) {
      try { await base44.entities.Page.update(pageId, { parent_id: prevParentId }); } catch {}
    }
    // Delete folders the AI created
    for (const folderId of last.createdFolderIds) {
      try { await base44.entities.Page.delete(folderId); } catch {}
    }
    refreshPages();
    setAiBanner({ reasoning: "Undid last AI organization", count: last.actions.length });
    setTimeout(() => setAiBanner(null), 3000);
  }, [aiUndoStack]);

  // Auto-organize debouncer when toggle is on
  useEffect(() => {
    if (!aiAutoOrganize || pages.length < 2) return;
    const hash = pages.map(p => `${p.id}:${p.title}:${p.parent_id || ""}`).sort().join("|");
    if (hash === aiLastRunHash.current) return;
    if (aiAutoTimer.current) clearTimeout(aiAutoTimer.current);
    aiAutoTimer.current = setTimeout(() => {
      aiLastRunHash.current = hash;
      runAIOrganize();
    }, 8000); // wait 8s of no changes before auto-organize
    return () => { if (aiAutoTimer.current) clearTimeout(aiAutoTimer.current); };
  }, [aiAutoOrganize, pages, runAIOrganize]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const handleStatusChange = async (task, newStatus) => {
    queryClient.setQueryData(["tasks", user?.email], (old = []) =>
      old.map(t => t.id === task.id ? { ...t, status: newStatus, completed_date: newStatus === "done" ? new Date().toISOString() : t.completed_date } : t)
    );
    const data = { status: newStatus };
    if (newStatus === "done") data.completed_date = new Date().toISOString();
    await base44.entities.Task.update(task.id, data);
    refresh();
  };

  const handleDelete = async (task) => {
    await base44.entities.Task.delete(task.id);
    refresh();
  };

  const handleDescriptionChange = async (task, newDescription) => {
    queryClient.setQueryData(["tasks", user?.email], (old = []) =>
      old.map(t => t.id === task.id ? { ...t, description: newDescription } : t)
    );
    await base44.entities.Task.update(task.id, { description: newDescription });
  };

  const activeFolderCatKeys = folderFilter !== "all" && categoryFolders[folderFilter]
    ? categoryFolders[folderFilter].categoryKeys
    : null;

  const filtered = tasks.filter((t) => {
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeFolderCatKeys) {
      if (!activeFolderCatKeys.includes(t.category ?? "work")) return false;
    } else if (categoryFilter !== "all" && t.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const sortedFiltered = [...filtered]
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

  const pastTasks = sortedFiltered.filter(t => t.due_date && t.due_date < todayStr);
  const currentTasks = sortedFiltered.filter(t => !t.due_date || t.due_date >= todayStr);
  const displayTasks = showPastTasks ? sortedFiltered : currentTasks;

  const groupedByDate = displayTasks.reduce((groups, task) => {
    const key = task.due_date || "no-date";
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
    return groups;
  }, {});

  const pullProgress = Math.min(pullY / PULL_THRESHOLD, 1);
  const showPullIndicator = pullY > 8 || refreshing;

  // The Home view content (existing Tasks UI)
  const homeContent = (
    <div
      ref={scrollRef}
      data-scroll-container
      className="max-w-3xl mx-auto px-4 py-6 space-y-5 w-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh */}
      {showPullIndicator && (
        <div className="flex justify-center -mb-4 transition-all" style={{ height: refreshing ? PULL_THRESHOLD : pullY }}>
          <Loader2 className={`h-5 w-5 text-blue-400 self-center ${refreshing ? "animate-spin" : ""}`} style={{ opacity: pullProgress }} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg hover:bg-white/5 text-gray-500 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Tasks</h1>
            <p className="text-xs text-gray-600">{displayTasks.length} upcoming{pastTasks.length > 0 ? ` · ${pastTasks.length} past` : ""}</p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg gap-1.5 h-8 text-xs px-3">
          <Plus className="h-3.5 w-3.5" /> New
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg bg-[#2a2b2d] border-white/5 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500/30"
          />
        </div>
        <div className="flex gap-2">
          <Select value={folderFilter} onValueChange={(v) => { setFolderFilter(v); if (v !== "all") setCategoryFilter("all"); }}>
            <SelectTrigger className="h-8 rounded-lg bg-[#2a2b2d] border-white/5 text-xs text-gray-300 flex-1">
              <div className="flex items-center gap-1.5">
                <Folder className="h-3 w-3 text-blue-400" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Folders</SelectItem>
              {categoryFolders.map((f, i) => (
                <SelectItem key={i} value={String(i)}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); if (v !== "all") setFolderFilter("all"); }}>
            <SelectTrigger className="h-8 rounded-lg bg-[#2a2b2d] border-white/5 text-xs text-gray-300 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {dbCategories.length > 0
                ? dbCategories.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)
                : <>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="health">Health</SelectItem>
                    <SelectItem value="learning">Learning</SelectItem>
                    <SelectItem value="creative">Creative</SelectItem>
                  </>
              }
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notepad */}
      <div className="rounded-lg border border-white/5 bg-[#2a2b2d] overflow-hidden">
        <button
          onClick={toggleNotepad}
          className="flex items-center justify-between w-full px-3 py-2 hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            <StickyNote className="h-3.5 w-3.5 text-amber-400/70" />
            <span className="text-xs font-medium text-gray-400">Notes</span>
            {notepadSaved && <span className="text-[10px] text-emerald-500">Saved</span>}
          </div>
          {notepadOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-600" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-600" />}
        </button>
        {notepadOpen && (
          <div className="px-3 pb-3">
            <textarea
              value={notepadText}
              onChange={handleNotepadChange}
              placeholder="Jot something down..."
              rows={4}
              className="w-full bg-[#1e1f20] border border-white/5 rounded-md px-3 py-2 text-xs text-gray-300 placeholder-gray-700 focus:outline-none focus:border-white/10 resize-y min-h-[80px]"
            />
          </div>
        )}
      </div>

      {/* Past tasks toggle */}
      {pastTasks.length > 0 && (
        <button
          onClick={() => setShowPastTasks(!showPastTasks)}
          className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          <History className="h-3 w-3" />
          {showPastTasks ? "Hide past" : `${pastTasks.length} past`}
        </button>
      )}

      {/* Task List */}
      <div>
        {isLoading && (
          <div className="text-center py-16 text-gray-600 text-xs">Loading...</div>
        )}

        {!isLoading && Object.keys(groupedByDate).length > 0 && (
          <div className="space-y-1">
            {Object.entries(groupedByDate).map(([dateKey, dateTasks]) => {
              const isNoDate = dateKey === "no-date";
              const dateObj = !isNoDate ? parseISO(dateKey) : null;
              const isTodayDate = dateObj && isToday(dateObj);
              return (
                <div key={dateKey} ref={isTodayDate ? todayRef : undefined}>
                  <div className={`sticky top-0 z-10 flex items-center gap-2 py-2 px-1 mt-3 first:mt-0 ${isTodayDate ? "bg-[#1e1f20]/95 backdrop-blur-sm" : "bg-[#1e1f20]"}`}>
                    {isTodayDate && <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
                    <span className={`text-[11px] font-medium tracking-wide ${isTodayDate ? "text-blue-400" : "text-gray-600"}`}>
                      {isNoDate ? "No Date" : isTodayDate ? `Today, ${format(dateObj, "MMM d")}` : format(dateObj, "EEE, MMM d")}
                    </span>
                    <div className="flex-1 h-px bg-white/5 ml-2" />
                    <span className="text-[10px] text-gray-700">{dateTasks.length}</span>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-[#2a2b2d]/50 divide-y divide-white/[0.03]">
                    <AnimatePresence>
                      {dateTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          categories={dbCategories}
                          onStatusChange={handleStatusChange}
                          onDelete={handleDelete}
                          onDescriptionChange={handleDescriptionChange}
                          onStartFocus={(t) => {
                            window.location.href = createPageUrl("Focus") + `?taskId=${t.id}&taskTitle=${encodeURIComponent(t.title)}`;
                          }}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && displayTasks.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-600 text-xs">No upcoming tasks</p>
            {pastTasks.length > 0 && !showPastTasks && (
              <button onClick={() => setShowPastTasks(true)} className="text-blue-500 text-xs mt-2 hover:text-blue-400">
                Show {pastTasks.length} past
              </button>
            )}
            <div className="mt-3">
              <Button variant="ghost" onClick={() => setShowAdd(true)} size="sm" className="text-blue-500 hover:text-blue-400 text-xs h-8">
                Create a task
              </Button>
            </div>
          </div>
        )}
      </div>

      <AddTaskDialog open={showAdd} onOpenChange={setShowAdd} onCreated={refresh} />
    </div>
  );

  return (
    <div className="flex h-screen bg-[#1e1f20] overflow-hidden">
      {/* Notion-style Sidebar */}
      {sidebarOpen && (
        <NotionSidebar
          pages={pages}
          user={user}
          view={view}
          selectedPageId={selectedPageId}
          onSelectHome={() => { setView("home"); setSelectedPageId(null); }}
          onSelectPage={(p) => { setSelectedPageId(p.id); setView("page"); }}
          onCreatePage={handleCreatePage}
          onDeletePage={handleDeletePage}
          onUpdatePage={handleUpdatePageById}
          aiAutoOrganize={aiAutoOrganize}
          onToggleAutoOrganize={setAiAutoOrganize}
          onOrganizeNow={runAIOrganize}
          onUndoAI={undoAIOrganize}
          canUndoAI={aiUndoStack.length > 0}
          aiOrganizing={aiOrganizing}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar with sidebar toggle */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded hover:bg-white/[0.05] text-gray-500 transition-colors"
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          {view === "page" && selectedPage && (
            <div className="flex items-center gap-1.5 text-[12.5px] text-gray-500">
              <span className="text-gray-700">/</span>
              <span className="truncate">{selectedPage.title || "Untitled"}</span>
            </div>
          )}
          <div className="flex-1" />
          {aiBanner && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-[11.5px] text-purple-300">
              {aiOrganizing && <Loader2 className="h-3 w-3 animate-spin" />}
              <span className="truncate max-w-md">{aiBanner.reasoning}</span>
              {aiBanner.count > 0 && (
                <span className="bg-purple-500/20 px-1.5 py-0.5 rounded text-[10px]">{aiBanner.count} change{aiBanner.count !== 1 ? "s" : ""}</span>
              )}
            </div>
          )}
        </div>

        {/* Body — Home tasks view OR Notion page */}
        <div className="flex-1 overflow-y-auto">
          {view === "page" && selectedPage ? (
            <NotionPageView
              key={selectedPage.id}
              page={selectedPage}
              onUpdate={handleUpdatePage}
              onDelete={() => handleDeletePage(selectedPage)}
            />
          ) : (
            homeContent
          )}
        </div>
      </div>
    </div>
  );
}
