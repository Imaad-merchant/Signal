import React from "react";
import { format, isSameDay, isSameMonth, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, getMonth, getYear } from "date-fns";
import { CheckCircle2, Circle, Clock } from "lucide-react";

const priorityDots = { high: "bg-rose-500", medium: "bg-amber-400", low: "bg-emerald-500" };
const categoryColors = {
  work: "bg-blue-100 text-blue-700",
  personal: "bg-purple-100 text-purple-700",
  health: "bg-green-100 text-green-700",
  learning: "bg-amber-100 text-amber-700",
  creative: "bg-pink-100 text-pink-700",
};

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const accent = () => localStorage.getItem("pulse_secondary") || "#f59e0b";

function getTasksForDate(tasks, date) {
  const dateStr = format(date, "yyyy-MM-dd");
  return tasks.filter((t) => t.due_date === dateStr);
}

// ── MONTHLY VIEW ──────────────────────────────────────────────────────────────
export function MonthlyView({ currentMonth, selectedDate, setSelectedDate, tasks }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const accentColor = accent();

  const calDays = [];
  let day = calStart;
  while (day <= calEnd) { calDays.push(day); day = addDays(day, 1); }

  return (
    <>
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {calDays.map((date, idx) => {
          const dayTasks = getTasksForDate(tasks, date);
          const isCurrentMonth = isSameMonth(date, currentMonth);
          const isSelected = isSameDay(date, selectedDate);
          const todayFlag = isSameDay(date, new Date());
          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(date)}
              className={`min-h-[90px] p-2 border-b border-r border-gray-50 text-left transition-all hover:bg-white/60 ${!isCurrentMonth ? "opacity-40" : ""}`}
              style={isSelected ? { backgroundColor: accentColor + "18" } : todayFlag ? { backgroundColor: accentColor + "10" } : {}}
            >
              <div
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium mb-1.5"
                style={todayFlag ? { backgroundColor: accentColor, color: "#fff" } : isSelected ? { backgroundColor: "#111827", color: "#fff" } : { color: "#374151" }}
              >{format(date, "d")}</div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${
                    task.status === "done" ? "bg-gray-100 text-gray-400 line-through" : categoryColors[task.category] || "bg-gray-100 text-gray-600"
                  }`}>{task.title}</div>
                ))}
                {dayTasks.length > 3 && <div className="text-[10px] text-gray-400 px-1">+{dayTasks.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── WEEKLY VIEW ───────────────────────────────────────────────────────────────
export function WeeklyView({ currentMonth, selectedDate, setSelectedDate, tasks }) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {weekDays.map((date) => {
          const todayFlag = isSameDay(date, new Date());
          const isSelected = isSameDay(date, selectedDate);
          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelectedDate(date)}
              className={`py-3 flex flex-col items-center gap-1 transition-all hover:bg-gray-50 ${isSelected ? "bg-amber-50" : ""}`}
            >
              <span className="text-xs font-semibold text-gray-400 uppercase">{format(date, "EEE")}</span>
              <span className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-bold ${
                todayFlag ? "bg-amber-500 text-white" : isSelected ? "bg-gray-900 text-white" : "text-gray-700"
              }`}>{format(date, "d")}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 divide-x divide-gray-50">
        {weekDays.map((date) => {
          const dayTasks = getTasksForDate(tasks, date);
          const isSelected = isSameDay(date, selectedDate);
          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelectedDate(date)}
              className={`min-h-[160px] p-2 text-left align-top transition-all hover:bg-gray-50 ${isSelected ? "bg-amber-50" : ""}`}
            >
              <div className="space-y-1">
                {dayTasks.length === 0 && <p className="text-[10px] text-gray-300 text-center mt-4">—</p>}
                {dayTasks.map((task) => (
                  <div key={task.id} className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${
                    task.status === "done" ? "bg-gray-100 text-gray-400 line-through" : categoryColors[task.category] || "bg-gray-100 text-gray-600"
                  }`}>{task.title}</div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── DAILY VIEW ────────────────────────────────────────────────────────────────
export function DailyView({ selectedDate, setSelectedDate, tasks, toggleStatus }) {
  const dayTasks = getTasksForDate(tasks, selectedDate);
  const todayFlag = isSameDay(selectedDate, new Date());

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">◀</button>
        <div className="flex-1 text-center">
          <p className={`text-2xl font-bold ${todayFlag ? "text-amber-500" : "text-gray-900"}`}>{format(selectedDate, "EEEE")}</p>
          <p className="text-sm text-gray-400">{format(selectedDate, "MMMM d, yyyy")}</p>
        </div>
        <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">▶</button>
      </div>
      <div className="space-y-2">
        {dayTasks.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No tasks for this day</p>}
        {dayTasks.map((task) => (
          <button
            key={task.id}
            onClick={() => toggleStatus(task)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:shadow-sm ${
              task.status === "done" ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-100 hover:border-gray-200"
            }`}
          >
            {task.status === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /> : <Circle className="h-5 w-5 text-gray-300 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>{task.title}</p>
              {task.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {task.estimated_minutes && (
                <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="h-3.5 w-3.5" />{task.estimated_minutes}m</span>
              )}
              <div className={`h-2 w-2 rounded-full ${priorityDots[task.priority] || priorityDots.medium}`} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── YEARLY VIEW ───────────────────────────────────────────────────────────────
export function YearlyView({ currentMonth, selectedDate, setSelectedDate, tasks }) {
  const year = getYear(currentMonth);
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
      {months.map((monthDate) => {
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const mCalStart = startOfWeek(mStart, { weekStartsOn: 0 });
        const mCalEnd = endOfWeek(mEnd, { weekStartsOn: 0 });
        const mDays = [];
        let d = mCalStart;
        while (d <= mCalEnd) { mDays.push(d); d = addDays(d, 1); }
        const isCurrentDisplayMonth = getMonth(monthDate) === getMonth(currentMonth);

        return (
          <div key={monthDate.toISOString()} className={`rounded-xl border p-3 ${isCurrentDisplayMonth ? "border-amber-200 bg-amber-50/30" : "border-gray-100 bg-white"}`}>
            <p className="text-xs font-bold text-gray-700 mb-2 text-center">{format(monthDate, "MMM")}</p>
            <div className="grid grid-cols-7 mb-1">
              {["S","M","T","W","T","F","S"].map((h, i) => (
                <div key={i} className="text-center text-[8px] text-gray-300 font-semibold">{h}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {mDays.map((date, idx) => {
                const dayTasks = getTasksForDate(tasks, date);
                const inMonth = isSameMonth(date, monthDate);
                const isSelected = isSameDay(date, selectedDate);
                const todayFlag = isSameDay(date, new Date());
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(date)}
                    className={`relative flex flex-col items-center justify-center h-5 w-full rounded text-[9px] font-medium transition-all ${
                      !inMonth ? "opacity-20" : ""
                    } ${todayFlag ? "bg-amber-500 text-white" : isSelected ? "bg-gray-900 text-white" : "hover:bg-gray-100 text-gray-700"}`}
                  >
                    {format(date, "d")}
                    {dayTasks.length > 0 && inMonth && !isSelected && !todayFlag && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}