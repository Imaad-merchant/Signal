import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, subDays } from "date-fns";
import { TrendingUp, Clock, CheckSquare, Target, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StatCard from "../components/dashboard/StatCard";
import ProductivityChart from "../components/dashboard/ProductivityChart";
import WeeklyBreakdown from "../components/analytics/WeeklyBreakdown";
import CategoryBreakdown from "../components/analytics/CategoryBreakdown";

export default function Analytics() {
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date"),
  });

  const { data: dailyLogs = [] } = useQuery({
    queryKey: ["dailyLogs"],
    queryFn: () => base44.entities.DailyLog.list("-date", 30),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["focusSessions"],
    queryFn: () => base44.entities.FocusSession.list("-created_date", 100),
  });

  const last7Days = dailyLogs.filter((l) => {
    const logDate = new Date(l.date);
    const weekAgo = subDays(new Date(), 7);
    return logDate >= weekAgo;
  });

  const avgScore = last7Days.length > 0
    ? (last7Days.reduce((s, l) => s + (l.productivity_score || 0), 0) / last7Days.length).toFixed(1)
    : "—";

  const totalFocusWeek = sessions
    .filter((s) => {
      const d = new Date(s.created_date);
      return d >= subDays(new Date(), 7) && s.session_type === "focus";
    })
    .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  const completedWeek = tasks.filter((t) => {
    if (t.status !== "done" || !t.completed_date) return false;
    return new Date(t.completed_date) >= subDays(new Date(), 7);
  }).length;

  const completionRate = tasks.length > 0
    ? Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">Track your productivity patterns</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Avg Score" value={avgScore} subtitle="Last 7 days" icon={TrendingUp} accentColor="amber" />
        <StatCard title="Focus Time" value={`${Math.round(totalFocusWeek / 60)}h`} subtitle="This week" icon={Clock} accentColor="violet" />
        <StatCard title="Completed" value={completedWeek} subtitle="Tasks this week" icon={CheckSquare} accentColor="emerald" />
        <StatCard title="Completion" value={`${completionRate}%`} subtitle="All-time rate" icon={Target} accentColor="sky" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ProductivityChart dailyLogs={dailyLogs} />
        <WeeklyBreakdown focusSessions={sessions} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <CategoryBreakdown tasks={tasks} />
        
        {/* Recent Logs */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Check-ins</h3>
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {dailyLogs.slice(0, 10).map((log) => {
              const moodEmoji = { great: "🔥", good: "😊", okay: "😐", low: "😔", bad: "😩" };
              return (
                <div key={log.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
                  <span className="text-lg">{moodEmoji[log.mood] || "😐"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{format(new Date(log.date), "MMM d, yyyy")}</p>
                    {log.notes && <p className="text-xs text-gray-400 truncate">{log.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-600">{log.productivity_score}/10</p>
                    <p className="text-xs text-gray-400">{log.focus_minutes || 0}m focus</p>
                  </div>
                </div>
              );
            })}
            {dailyLogs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No check-ins yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}