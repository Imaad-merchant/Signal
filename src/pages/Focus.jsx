import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import FocusTimer from "../components/focus/FocusTimer";
import { Clock, Zap, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function Focus() {
  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get("taskId");
  const taskTitle = urlParams.get("taskTitle");

  const initialTask = taskId ? { id: taskId, title: decodeURIComponent(taskTitle || "") } : null;
  const [activeTask, setActiveTask] = useState(initialTask);
  const [showComplete, setShowComplete] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ["focusSessions"],
    queryFn: () => base44.entities.FocusSession.list("-created_date", 20),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.filter({ status: "in_progress" }, "-created_date", 10),
  });

  const todaySessions = sessions.filter(
    (s) => format(new Date(s.created_date), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") && s.session_type === "focus"
  );
  const totalFocusToday = todaySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  const handleComplete = () => {
    setShowComplete(true);
    queryClient.invalidateQueries({ queryKey: ["focusSessions"] });
    setTimeout(() => {
      setShowComplete(false);
      setActiveTask(null);
    }, 2500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center pr-9">
          <h1 className="text-2xl font-bold text-gray-900">Focus Mode</h1>
          <p className="text-sm text-gray-400 mt-0.5">Deep work, no distractions</p>
        </div>
      </div>

      {showComplete ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center py-20"
        >
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-gray-900">Session Complete!</h2>
          <p className="text-sm text-gray-400 mt-1">Great focus. Keep it going.</p>
        </motion.div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-8">
          <FocusTimer
            task={activeTask}
            onComplete={handleComplete}
            onCancel={() => setActiveTask(null)}
          />
        </div>
      )}

      {/* Quick select task */}
      {!activeTask && !showComplete && tasks.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-xs font-medium text-gray-500 mb-3">Or pick a task to focus on:</p>
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTask(t)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors"
              >
                <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-sm text-gray-700 truncate">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Today's sessions */}
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Today's Sessions</h3>
          <span className="text-xs text-amber-600 font-medium">{totalFocusToday}m total</span>
        </div>
        <div className="space-y-2">
          {todaySessions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No sessions yet today</p>
          )}
          {todaySessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm text-gray-700 flex-1 truncate">{s.task_title || "Free focus"}</span>
              <span className="text-xs font-medium text-gray-500">{s.duration_minutes}m</span>
              <span className="text-xs text-gray-400">{format(new Date(s.created_date), "h:mm a")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}