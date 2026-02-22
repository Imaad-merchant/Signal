import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { CheckSquare, Clock, Flame, TrendingUp } from "lucide-react";
import StatCard from "../components/dashboard/StatCard";
import ProductivityChart from "../components/dashboard/ProductivityChart";
import TodayTaskList from "../components/dashboard/TodayTaskList";
import MoodTracker from "../components/dashboard/MoodTracker";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

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
    queryFn: () => base44.entities.FocusSession.list("-created_date", 50),
  });

  const todayTasks = tasks.filter((t) => {
    if (t.due_date === today) return true;
    if (!t.due_date && t.status !== "done") return true;
    return false;
  });

  const todayLog = dailyLogs.find((l) => l.date === today);

  const completedToday = tasks.filter(
    (t) => t.status === "done" && t.completed_date && format(new Date(t.completed_date), "yyyy-MM-dd") === today
  ).length;

  const todaySessions = sessions.filter(
    (s) => format(new Date(s.created_date), "yyyy-MM-dd") === today && s.session_type === "focus"
  );
  const focusMinutesToday = todaySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  const streak = (() => {
    let count = 0;
    const sortedLogs = [...dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
    for (const log of sortedLogs) {
      if (log.productivity_score >= 5) count++;
      else break;
    }
    return count;
  })();

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["dailyLogs"] });
    queryClient.invalidateQueries({ queryKey: ["focusSessions"] });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}</h1>
        <p className="text-sm text-gray-400 mt-0.5">Here's your productivity snapshot for today</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tasks Done" value={completedToday} subtitle="Completed today" icon={CheckSquare} accentColor="emerald" />
        <StatCard title="Focus Time" value={`${focusMinutesToday}m`} subtitle="Deep work today" icon={Clock} accentColor="violet" />
        <StatCard title="Streak" value={`${streak}d`} subtitle="Productive days" icon={Flame} accentColor="amber" />
        <StatCard title="Score" value={todayLog?.productivity_score || "—"} subtitle="Today's rating" icon={TrendingUp} accentColor="sky" />
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ProductivityChart dailyLogs={dailyLogs} />
          <TodayTaskList tasks={todayTasks} onUpdate={refreshAll} />
        </div>
        <div>
          <MoodTracker todayLog={todayLog} onSave={refreshAll} />
        </div>
      </div>
    </div>
  );
}