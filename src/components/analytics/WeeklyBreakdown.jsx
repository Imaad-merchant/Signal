import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, subDays, startOfWeek, addDays } from "date-fns";

export default function WeeklyBreakdown({ focusSessions }) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = format(date, "yyyy-MM-dd");
    const daySessions = focusSessions.filter((s) => {
      const sessionDate = format(new Date(s.created_date), "yyyy-MM-dd");
      return sessionDate === dateStr && s.session_type === "focus";
    });
    const totalMinutes = daySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
    return {
      day: format(date, "EEE"),
      minutes: totalMinutes,
      hours: (totalMinutes / 60).toFixed(1),
      isToday,
    };
  });

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-gray-100 bg-white/95 backdrop-blur-sm p-3 shadow-lg">
        <p className="text-xs font-medium text-gray-500">{payload[0]?.payload?.day}</p>
        <p className="text-sm font-bold text-gray-900 mt-0.5">{payload[0]?.value}m focused</p>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#2d2e30] p-6">
      <h3 className="text-sm font-semibold text-gray-100 mb-1">Weekly Focus</h3>
      <p className="text-xs text-gray-500 mb-5">Minutes focused per day this week</p>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekDays} barCategoryGap="25%">
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
              {weekDays.map((entry, index) => (
                <Cell key={index} fill={entry.isToday ? "#f59e0b" : "#e5e7eb"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}