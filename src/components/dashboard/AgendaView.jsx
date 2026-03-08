import React from "react";
import { format, addDays, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { CheckCircle2, Circle, Clock } from "lucide-react";

const defaultColor = { bg: "#4285f4", text: "#fff" };

function getTasksForDate(tasks, date) {
  const dateStr = format(date, "yyyy-MM-dd");
  return tasks.filter((t) => t.due_date === dateStr);
}

export default function AgendaView({ currentMonth, tasks, toggleStatus, onTaskClick, categories = [] }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const days = [];
  let d = monthStart;
  while (d <= monthEnd) { days.push(d); d = addDays(d, 1); }

  const categoryMap = Object.fromEntries(categories.map(c => [c.key, { bg: c.color, text: "#fff" }]));

  const daysWithTasks = days.map(date => ({
    date,
    tasks: getTasksForDate(tasks, date),
  })).filter(({ tasks }) => tasks.length > 0);

  const isToday = (date) => isSameDay(date, new Date());

  return (
    <div className="p-4 space-y-4">
      {daysWithTasks.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <p className="text-sm">No tasks this month</p>
        </div>
      )}
      {daysWithTasks.map(({ date, tasks: dayTasks }) => (
        <div key={date.toISOString()}>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={isToday(date) ? { backgroundColor: "#4285f4", color: "#fff" } : { backgroundColor: "#3c3d3f", color: "#e8eaed" }}
            >
              {format(date, "d")}
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-300">{format(date, "EEEE")}</span>
              {isToday(date) && <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Today</span>}
            </div>
          </div>
          <div className="ml-11 space-y-1.5">
            {dayTasks.map((task) => {
              const c = categoryMap[task.category] || defaultColor;
              return (
                <button
                  key={task.id}
                  onClick={() => onTaskClick ? onTaskClick(task) : toggleStatus?.(task)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 text-left transition-all active:scale-[0.98] bg-[#2d2e30] min-h-[52px]"
                >
                  {task.status === "done"
                    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-400" />
                    : <Circle className="h-5 w-5 text-gray-600 shrink-0" />}
                  <div className="h-3 w-1 rounded-full shrink-0" style={{ backgroundColor: task.status === "done" ? "#555" : c.bg }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-600" : "text-gray-200"}`}>
                      {task.title}
                    </p>
                    {task.description && <p className="text-xs text-gray-500 truncate">{task.description}</p>}
                  </div>
                  {task.estimated_minutes && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      <Clock className="h-3 w-3" />{task.estimated_minutes}m
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}