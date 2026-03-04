import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  format, isSameDay, addMonths, subMonths, addYears, subYears,
  addWeeks, subWeeks, startOfWeek, endOfWeek, startOfMonth, endOfMonth
} from "date-fns";
import { ChevronLeft, ChevronRight, Upload, CheckCircle2, Circle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ImportActivitiesDialog from "../components/dashboard/ImportActivitiesDialog";
import { MonthlyView, WeeklyView, DailyView, YearlyView } from "../components/dashboard/CalendarViews";

const VIEWS = ["Daily", "Weekly", "Monthly", "Yearly"];

const categoryColors = {
  work: "bg-blue-100 text-blue-700",
  personal: "bg-purple-100 text-purple-700",
  health: "bg-green-100 text-green-700",
  learning: "bg-amber-100 text-amber-700",
  creative: "bg-pink-100 text-pink-700",
};
const priorityDots = { high: "bg-rose-500", medium: "bg-amber-400", low: "bg-emerald-500" };

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showImport, setShowImport] = useState(false);
  const [view, setView] = useState("Monthly");

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const toggleStatus = async (task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    const data = { status: newStatus };
    if (newStatus === "done") data.completed_date = new Date().toISOString();
    await base44.entities.Task.update(task.id, data);
    refresh();
  };

  // Navigation helpers per view
  const navigatePrev = () => {
    if (view === "Monthly") setCurrentMonth(subMonths(currentMonth, 1));
    else if (view === "Yearly") setCurrentMonth(subYears(currentMonth, 1));
    else if (view === "Weekly") setSelectedDate(d => subWeeks(d, 1));
    // Daily handled inside DailyView
  };
  const navigateNext = () => {
    if (view === "Monthly") setCurrentMonth(addMonths(currentMonth, 1));
    else if (view === "Yearly") setCurrentMonth(addYears(currentMonth, 1));
    else if (view === "Weekly") setSelectedDate(d => addWeeks(d, 1));
  };
  const navigateToday = () => { setCurrentMonth(new Date()); setSelectedDate(new Date()); };

  // Header label per view
  const headerLabel = () => {
    if (view === "Yearly") return format(currentMonth, "yyyy");
    if (view === "Monthly") return format(currentMonth, "MMMM yyyy");
    if (view === "Weekly") {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    if (view === "Daily") return format(selectedDate, "MMMM d, yyyy");
    return "";
  };

  // Tasks filtered based on current view
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const selectedTasks = (() => {
    if (view === "Daily") {
      return tasks.filter((t) => {
        if (t.due_date === selectedDateStr) return true;
        if (!t.due_date && isSameDay(selectedDate, new Date())) return true;
        return false;
      });
    }
    if (view === "Weekly") {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return tasks.filter((t) => {
        if (!t.due_date) return isSameDay(new Date(), selectedDate) || (new Date() >= ws && new Date() <= we);
        const d = new Date(t.due_date + "T00:00:00");
        return d >= ws && d <= we;
      });
    }
    if (view === "Monthly") {
      const ms = startOfMonth(currentMonth);
      const me = endOfMonth(currentMonth);
      return tasks.filter((t) => {
        if (!t.due_date) return isSameDay(new Date(), selectedDate);
        const d = new Date(t.due_date + "T00:00:00");
        return d >= ms && d <= me;
      });
    }
    if (view === "Yearly") {
      const year = currentMonth.getFullYear();
      return tasks.filter((t) => {
        if (!t.due_date) return false;
        return new Date(t.due_date + "T00:00:00").getFullYear() === year;
      });
    }
    return [];
  })();

  const showNavArrows = view !== "Daily"; // Daily has its own nav inside

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* View switcher */}
        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                view === v ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-amber-300 hover:text-amber-600 transition-all shadow-sm"
        >
          <Upload className="h-3.5 w-3.5" />
          Import Activities
        </button>
      </div>

      <ImportActivitiesDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImported={refresh}
      />

      {/* Calendar Card */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">{headerLabel()}</h2>
          <div className="flex gap-1">
            {showNavArrows && (
              <button onClick={navigatePrev} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={navigateToday}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Today
            </button>
            {showNavArrows && (
              <button onClick={navigateNext} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* View Body */}
        {view === "Monthly" && (
          <MonthlyView
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            tasks={tasks}
          />
        )}
        {view === "Weekly" && (
          <WeeklyView
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            tasks={tasks}
          />
        )}
        {view === "Daily" && (
          <DailyView
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            tasks={tasks}
            toggleStatus={toggleStatus}
          />
        )}
        {view === "Yearly" && (
          <YearlyView
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            tasks={tasks}
          />
        )}
      </div>

      {/* Tasks panel — hidden for Daily since it's inline */}
      {view !== "Daily" && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            {view === "Weekly"
              ? `Week of ${format(startOfWeek(selectedDate, { weekStartsOn: 0 }), "MMM d")}`
              : view === "Monthly"
              ? format(currentMonth, "MMMM yyyy")
              : view === "Yearly"
              ? `${currentMonth.getFullYear()} Tasks`
              : isSameDay(selectedDate, new Date()) ? "Today" : format(selectedDate, "EEEE, MMMM d")}
          </h3>
          <p className="text-xs text-gray-400 mb-5">
            {selectedTasks.filter(t => t.status === "done").length}/{selectedTasks.length} tasks completed
          </p>
          <div className="space-y-2">
            <AnimatePresence>
              {selectedTasks.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No tasks for this day</p>
              )}
              {selectedTasks.map((task) => (
                <motion.button
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => toggleStatus(task)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:shadow-sm ${
                    task.status === "done" ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-100 hover:border-gray-200"
                  }`}
                >
                  {task.status === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.estimated_minutes && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3.5 w-3.5" />{task.estimated_minutes}m
                      </span>
                    )}
                    <div className={`h-2 w-2 rounded-full ${priorityDots[task.priority] || priorityDots.medium}`} />
                    {task.category && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${categoryColors[task.category] || ""}`}>
                        {task.category}
                      </span>
                    )}
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}