import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ImportActivitiesDialog from "../components/dashboard/ImportActivitiesDialog";

const priorityDots = { high: "bg-rose-500", medium: "bg-amber-400", low: "bg-emerald-500" };
const categoryColors = {
  work: "bg-blue-100 text-blue-700",
  personal: "bg-purple-100 text-purple-700",
  health: "bg-green-100 text-green-700",
  learning: "bg-amber-100 text-amber-700",
  creative: "bg-pink-100 text-pink-700",
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showImport, setShowImport] = useState(false);

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

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const calDays = [];
  let day = calStart;
  while (day <= calEnd) {
    calDays.push(day);
    day = addDays(day, 1);
  }

  // Tasks for a given date
  const getTasksForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return tasks.filter((t) => t.due_date === dateStr);
  };

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const selectedTasks = tasks.filter((t) => {
    if (t.due_date === selectedDateStr) return true;
    if (!t.due_date && isSameDay(selectedDate, new Date())) return true;
    return false;
  });

  const isToday = (date) => isSameDay(date, new Date());

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex justify-end">
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
          <h2 className="text-xl font-bold text-gray-900">{format(currentMonth, "MMMM yyyy")}</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {calDays.map((date, idx) => {
            const dayTasks = getTasksForDate(date);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isSelected = isSameDay(date, selectedDate);
            const todayFlag = isToday(date);

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(date)}
                className={`min-h-[90px] p-2 border-b border-r border-gray-50 text-left transition-all ${
                  isSelected ? "bg-amber-50" : todayFlag ? "bg-amber-50/40" : "hover:bg-gray-50"
                } ${!isCurrentMonth ? "opacity-40" : ""}`}
              >
                <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium mb-1.5 ${
                  todayFlag
                    ? "bg-amber-500 text-white"
                    : isSelected
                    ? "bg-gray-900 text-white"
                    : "text-gray-700"
                }`}>
                  {format(date, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${
                        task.status === "done"
                          ? "bg-gray-100 text-gray-400 line-through"
                          : categoryColors[task.category] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {task.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-gray-400 px-1">+{dayTasks.length - 3} more</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tasks for Selected Date */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          {isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE, MMMM d")}
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
                  task.status === "done"
                    ? "bg-gray-50 border-gray-100 opacity-60"
                    : "bg-white border-gray-100 hover:border-gray-200"
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
    </div>
  );
}