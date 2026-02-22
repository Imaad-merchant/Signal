import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Clock, Flame } from "lucide-react";
import { base44 } from "@/api/base44Client";

const priorityDots = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

export default function TodayTaskList({ tasks, onUpdate }) {
  const toggleStatus = async (task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    const data = { status: newStatus };
    if (newStatus === "done") {
      data.completed_date = new Date().toISOString();
    }
    await base44.entities.Task.update(task.id, data);
    onUpdate();
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
  });

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Today's Tasks</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {tasks.filter(t => t.status === "done").length}/{tasks.length} completed
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
          <Flame className="h-3 w-3" />
          <span className="font-medium">{tasks.filter(t => t.priority === "high" && t.status !== "done").length} urgent</span>
        </div>
      </div>

      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        <AnimatePresence>
          {sortedTasks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No tasks for today</p>
          )}
          {sortedTasks.map((task) => (
            <motion.button
              key={task.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              onClick={() => toggleStatus(task)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left hover:bg-gray-50 group ${
                task.status === "done" ? "opacity-50" : ""
              }`}
            >
              {task.status === "done" ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4.5 w-4.5 text-gray-300 group-hover:text-gray-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${task.status === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
                  {task.title}
                </p>
              </div>
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDots[task.priority] || priorityDots.medium}`} />
              {task.estimated_minutes && (
                <span className="text-xs text-gray-400 flex items-center gap-0.5 shrink-0">
                  <Clock className="h-3 w-3" />
                  {task.estimated_minutes}m
                </span>
              )}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}