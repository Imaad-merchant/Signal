import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Search, ArrowLeft, Loader2, Folder, History, StickyNote, ChevronDown, ChevronUp, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatePresence } from "framer-motion";
import TaskCard from "../components/tasks/TaskCard";
import AddTaskDialog from "../components/tasks/AddTaskDialog";
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

  return (
    <div
      ref={scrollRef}
      data-scroll-container
      className="max-w-3xl mx-auto px-4 py-6 space-y-5"
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
}
