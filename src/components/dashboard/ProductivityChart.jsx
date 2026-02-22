import React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";

export default function ProductivityChart({ dailyLogs }) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, "yyyy-MM-dd");
    const log = dailyLogs.find(l => l.date === dateStr);
    return {
      day: format(date, "EEE"),
      date: format(date, "MMM d"),
      score: log?.productivity_score || 0,
      tasks: log?.tasks_completed || 0,
      focus: log?.focus_minutes || 0,
    };
  });

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-gray-100 bg-white/95 backdrop-blur-sm p-3 shadow-lg">
        <p className="text-xs font-medium text-gray-500 mb-1.5">{payload[0]?.payload?.date}</p>
        <div className="space-y-1">
          <p className="text-sm"><span className="font-semibold text-amber-600">{payload[0]?.value}</span> <span className="text-gray-400">score</span></p>
          <p className="text-sm"><span className="font-semibold text-emerald-600">{payload[0]?.payload?.tasks}</span> <span className="text-gray-400">tasks</span></p>
          <p className="text-sm"><span className="font-semibold text-violet-600">{payload[0]?.payload?.focus}m</span> <span className="text-gray-400">focus</span></p>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900">Productivity Trend</h3>
        <p className="text-xs text-gray-400 mt-0.5">Last 7 days</p>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={last7Days}>
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
            />
            <YAxis domain={[0, 10]} hide />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#f59e0b"
              strokeWidth={2.5}
              fill="url(#scoreGradient)"
              dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}