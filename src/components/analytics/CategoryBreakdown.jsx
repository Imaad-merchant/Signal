import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = {
  work: "#3b82f6",
  personal: "#8b5cf6",
  health: "#22c55e",
  learning: "#f59e0b",
  creative: "#ec4899",
};

export default function CategoryBreakdown({ tasks }) {
  const categoryData = Object.entries(
    tasks.reduce((acc, task) => {
      const cat = task.category || "work";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value, color: COLORS[name] || "#9ca3af" }));

  if (categoryData.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#2d2e30] p-6">
        <h3 className="text-sm font-semibold text-gray-100 mb-4">Tasks by Category</h3>
        <p className="text-sm text-gray-500 text-center py-8">No tasks yet</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-white/10 bg-[#2d2e30]/95 backdrop-blur-sm p-3 shadow-lg">
        <p className="text-xs font-medium capitalize text-gray-300">{payload[0].name}</p>
        <p className="text-sm font-bold text-gray-100">{payload[0].value} tasks</p>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#2d2e30] p-6">
      <h3 className="text-sm font-semibold text-gray-100 mb-4">Tasks by Category</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={3}
              dataKey="value"
            >
              {categoryData.map((entry, index) => (
                <Cell key={index} fill={entry.color} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {categoryData.map((cat) => (
          <div key={cat.name} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
            <span className="text-xs text-gray-400 capitalize">{cat.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}