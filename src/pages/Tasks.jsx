import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Search, ArrowLeft, Loader2, Folder } from "lucide-react";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef(null);
  const todayRef = useRef(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(null);

  // Read folders from localStorage
  const [categoryFolders, setCategoryFolders] = useState(() => {
    try { const s = localStorage.getItem("pulse_category_folders"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  // Re-read folders when window regains focus (in case Dashboard changed them)
  useEffect(() => {
    const handler = () => {
      try { const s = localStorage.getItem("pulse_category_folders"); setCategoryFolders(s ? JSON.parse(s) : []); } catch {}
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, []);

  // Reset on tab re-tap
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
    // Optimistic update
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
    // Optimistic update
    queryClient.setQueryData(["tasks", user?.email], (old = []) =>
      old.map(t => t.id === task.id ? { ...t, description: newDescription } : t)
    );
    await base44.entities.Task.update(task.id, { description: newDescription });
  };

  // Get category keys for selected folder
  const activeFolderCatKeys = folderFilter !== "all" && categoryFolders[folderFilter]
    ? categoryFolders[folderFilter].categoryKeys
    : null;

  const filtered = tasks.filter((t) => {
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false;
    // Folder filter overrides category filter
    if (activeFolderCatKeys) {
      if (!activeFolderCatKeys.includes(t.category ?? "work")) return false;
    } else if (categoryFilter !== "all" && t.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  // When a folder is selected, sort by due_date ascending and group by date
  const isFolderView = folderFilter !== "all";
  const sortedFiltered = isFolderView
    ? [...filtered].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      })
    : filtered;

  // Group tasks by date when in folder view
  const groupedByDate = isFolderView
    ? sortedFiltered.reduce((groups, task) => {
        const key = task.due_date || "no-date";
        if (!groups[key]) groups[key] = [];
        groups[key].push(task);
        return groups;
      }, {})
    : null;

  // Auto-scroll to today when folder is selected
  useEffect(() => {
    if (isFolderView && todayRef.current) {
      setTimeout(() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, [folderFilter]);

  const pullProgress = Math.min(pullY / PULL_THRESHOLD, 1);
  const showPullIndicator = pullY > 8 || refreshing;

  return (
    <div
      ref={scrollRef}
      data-scroll-container
      className="max-w-4xl mx-auto space-y-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {showPullIndicator && (
        <div className="flex justify-center -mb-4 transition-all" style={{ height: refreshing ? PULL_THRESHOLD : pullY }}>
          <Loader2 className={`h-5 w-5 text-blue-400 self-center ${refreshing ? "animate-spin" : ""}`} style={{ opacity: pullProgress }} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
          <h1 className="text-2xl font-bold text-gray-100">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tasks.length} total · {tasks.filter(t => t.status === "done").length} completed</p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl bg-[#2d2e30] border-white/10 text-gray-200 placeholder-gray-500"
          />
        </div>
        <Select value={folderFilter} onValueChange={(v) => { setFolderFilter(v); if (v !== "all") setCategoryFilter("all"); }}>
          <SelectTrigger className="w-36 rounded-xl bg-[#2d2e30] border-white/10 text-gray-200">
            <div className="flex items-center gap-2">
              <Folder className="h-3.5 w-3.5 text-blue-400" />
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
          <SelectTrigger className="w-40 rounded-xl bg-[#2d2e30] border-white/10 text-gray-200"><SelectValue /></SelectTrigger>
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

      {/* Task List */}
      <div className="space-y-2">
        {isLoading && (
          <div className="text-center py-12 text-gray-500 text-sm">Loading tasks...</div>
        )}

        {/* Folder view: grouped by date */}
        {isFolderView && groupedByDate && !isLoading && (
          <div className="space-y-4">
            {Object.entries(groupedByDate).map(([dateKey, dateTasks]) => {
              const isNoDate = dateKey === "no-date";
              const dateObj = !isNoDate ? parseISO(dateKey) : null;
              const isTodayDate = dateObj && isToday(dateObj);
              return (
                <div key={dateKey} ref={isTodayDate ? todayRef : undefined}>
                  <div className={`sticky top-0 z-10 flex items-center gap-2 py-2 px-1 mb-1 ${isTodayDate ? "bg-blue-600/10" : "bg-[#1e1f20]"}`}>
                    <div className={`h-2 w-2 rounded-full ${isTodayDate ? "bg-blue-500" : "bg-gray-600"}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isTodayDate ? "text-blue-400" : "text-gray-500"}`}>
                      {isNoDate ? "No Date" : format(dateObj, "EEEE, MMMM d, yyyy")}
                      {isTodayDate && <span className="ml-2 text-blue-300 normal-case tracking-normal font-medium">Today</span>}
                    </span>
                    <span className="text-[10px] text-gray-600 ml-auto">{dateTasks.length} task{dateTasks.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {dateTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
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

        {/* Regular view: flat list */}
        {!isFolderView && !isLoading && (
          <AnimatePresence>
            {sortedFiltered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDescriptionChange={handleDescriptionChange}
                onStartFocus={(t) => {
                  window.location.href = createPageUrl("Focus") + `?taskId=${t.id}&taskTitle=${encodeURIComponent(t.title)}`;
                }}
              />
            ))}
          </AnimatePresence>
        )}

        {!isLoading && sortedFiltered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">{isFolderView ? "No tasks in this folder" : "No tasks found"}</p>
            <Button variant="ghost" onClick={() => setShowAdd(true)} className="mt-2 text-blue-400 hover:text-blue-300">
              Create your first task
            </Button>
          </div>
        )}
      </div>

      <AddTaskDialog open={showAdd} onOpenChange={setShowAdd} onCreated={refresh} />
    </div>
  );
}