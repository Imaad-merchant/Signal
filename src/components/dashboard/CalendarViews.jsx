import React, { useState, useCallback, useRef, useEffect } from "react";

import { format, isSameDay, isSameMonth, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, getMonth, getYear } from "date-fns";
import { CheckCircle2, Circle, Clock, X } from "lucide-react";
import TaskContextMenu from "./TaskContextMenu";
import { base44 } from "@/api/base44Client";

const DEFAULT_CATEGORY_COLORS = {
  work:     { bg: "#4285f4", text: "#fff" },
  personal: { bg: "#a142f4", text: "#fff" },
  health:   { bg: "#0f9d58", text: "#fff" },
  learning: { bg: "#f4b400", text: "#fff" },
  creative: { bg: "#db4437", text: "#fff" },
};
const defaultColor = { bg: "#4285f4", text: "#fff" };

const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function getTasksForDate(tasks, date) {
  const dateStr = format(date, "yyyy-MM-dd");
  return tasks.filter((t) => t.due_date === dateStr);
}

function useContextMenu(onUpdated, categories) {
  const [menu, setMenu] = useState(null);

  const openMenu = useCallback((e, task) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ task, position: { x: e.clientX, y: e.clientY } });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const menuEl = menu ? (
    <TaskContextMenu
      task={menu.task}
      position={menu.position}
      onClose={closeMenu}
      onUpdated={() => { onUpdated(); closeMenu(); }}
      categories={categories}
    />
  ) : null;

  return { openMenu, menuEl };
}

function TaskPill({ task, onContextMenu, onDragStart, onTaskClick, categories = [] }) {
  const categoryMap = Object.fromEntries(categories.map(c => [c.key, { bg: c.color, text: "#fff" }]));
  const c = categoryMap[task.category] || DEFAULT_CATEGORY_COLORS[task.category] || defaultColor;
  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(task); }}
      onContextMenu={(e) => onContextMenu(e, task)}
      onClick={(e) => { e.stopPropagation(); onTaskClick?.(task); }}
      className="text-[11px] font-medium px-1.5 py-0.5 rounded truncate cursor-grab active:cursor-grabbing select-none hover:opacity-80 transition-opacity"
      style={{
        backgroundColor: task.status === "done" ? "#3c3d3f" : c.bg,
        color: task.status === "done" ? "#888" : c.text,
        textDecoration: task.status === "done" ? "line-through" : "none",
      }}
    >
      {task.title}
    </div>
  );
}

function useDragDrop(onUpdated) {
  const draggingTask = useRef(null);
  const [dragOverDate, setDragOverDate] = useState(null);

  const onDragStart = useCallback((task) => {
    draggingTask.current = task;
  }, []);

  const onDragOver = useCallback((e, dateStr) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  }, []);

  const onDrop = useCallback(async (e, dateStr) => {
    e.preventDefault();
    setDragOverDate(null);
    if (!draggingTask.current) return;
    const task = draggingTask.current;
    draggingTask.current = null;
    if (task.due_date === dateStr) return;
    await base44.entities.Task.update(task.id, { due_date: dateStr });
    onUpdated();
  }, [onUpdated]);

  const onDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  return { onDragStart, onDragOver, onDrop, onDragLeave, dragOverDate };
}

// ── DAY OVERFLOW POPOVER ──────────────────────────────────────────────────────
function DayOverflowPopover({ date, tasks, onClose, onTaskClick, onContextMenu, onDragStart, categories }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-[#2d2e30] border border-white/15 rounded-xl shadow-2xl p-3 min-w-[200px] max-w-[260px]"
      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-300">{format(date, "EEE, MMM d")}</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        {tasks.map((task) => (
          <TaskPill key={task.id} task={task} onContextMenu={onContextMenu} onDragStart={onDragStart} onTaskClick={(t) => { onTaskClick?.(t); onClose(); }} categories={categories} />
        ))}
      </div>
    </div>
  );
}

// ── MONTHLY VIEW ──────────────────────────────────────────────────────────────
export function MonthlyView({ currentMonth, selectedDate, setSelectedDate, tasks, onUpdated, categories = [], onTaskClick, onAddEvent }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const calDays = [];
  let day = calStart;
  while (day <= calEnd) { calDays.push(day); day = addDays(day, 1); }

  const { openMenu, menuEl } = useContextMenu(onUpdated, categories);
  const { onDragStart, onDragOver, onDrop, onDragLeave, dragOverDate } = useDragDrop(onUpdated);
  const [overflowDay, setOverflowDay] = useState(null);
  const [dayContextMenu, setDayContextMenu] = useState(null); // { x, y, date }

  return (
    <>
      {menuEl}
      {/* Day right-click context menu */}
      {dayContextMenu && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setDayContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setDayContextMenu(null); }} />
          <div
            className="fixed z-[101] bg-[#2d2e30] border border-white/15 rounded-xl shadow-2xl py-1 min-w-[160px]"
            style={{
              left: Math.min(dayContextMenu.x, window.innerWidth - 200),
              top: Math.min(dayContextMenu.y, window.innerHeight - 60),
            }}
          >
            <button
              onClick={() => {
                onAddEvent?.(format(dayContextMenu.date, "yyyy-MM-dd"));
                setDayContextMenu(null);
              }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-gray-200 hover:bg-white/10 transition-colors"
            >
              <span className="text-blue-400">+</span>
              New Event on {format(dayContextMenu.date, "MMM d")}
            </button>
          </div>
        </>
      )}
      <div className="h-full flex flex-col relative">
        <div className="grid grid-cols-7 border-b border-white/10">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-500 tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(${calDays.length / 7}, minmax(100px, 1fr))` }}>
          {calDays.map((date, idx) => {
            const dayTasks = getTasksForDate(tasks, date);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isSelected = isSameDay(date, selectedDate);
            const todayFlag = isSameDay(date, new Date());
            const dateStr = format(date, "yyyy-MM-dd");
            const isDragOver = dragOverDate === dateStr;
            return (
              <div
                key={idx}
                onClick={() => setSelectedDate(date)}
                onContextMenu={(e) => {
                  // Only show day menu if not right-clicking on a task pill
                  if (e.target.closest('[draggable="true"]')) return;
                  e.preventDefault();
                  setDayContextMenu({ x: e.clientX, y: e.clientY, date });
                }}
                onDragOver={(e) => onDragOver(e, dateStr)}
                onDrop={(e) => onDrop(e, dateStr)}
                onDragLeave={onDragLeave}
                className={`p-1.5 border-b border-r border-white/10 cursor-pointer transition-colors ${!isCurrentMonth ? "opacity-40" : ""} ${isDragOver ? "bg-blue-500/20 border-blue-400/40" : "hover:bg-white/5"}`}
              >
                <div className="flex justify-end mb-1">
                  <span
                    className="h-7 w-7 flex items-center justify-center rounded-full text-sm font-medium"
                    style={
                      todayFlag
                        ? { backgroundColor: "#4285f4", color: "#fff" }
                        : isSelected
                        ? { backgroundColor: "#3c3d3f", color: "#fff" }
                        : { color: "#e8eaed" }
                    }
                  >
                    {format(date, "d")}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 6).map((task) => (
                    <TaskPill key={task.id} task={task} onContextMenu={openMenu} onDragStart={onDragStart} onTaskClick={onTaskClick} categories={categories} />
                  ))}
                  {dayTasks.length > 6 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setOverflowDay({ date, tasks: dayTasks }); }}
                      className="text-[10px] text-blue-400 hover:text-blue-300 px-1 transition-colors"
                    >
                      +{dayTasks.length - 6} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {overflowDay && (
        <DayOverflowPopover
          date={overflowDay.date}
          tasks={overflowDay.tasks}
          onClose={() => setOverflowDay(null)}
          onTaskClick={onTaskClick}
          onContextMenu={openMenu}
          onDragStart={onDragStart}
          categories={categories}
        />
      )}
    </>
  );
}

// ── WEEKLY VIEW ───────────────────────────────────────────────────────────────
export function WeeklyView({ selectedDate, setSelectedDate, tasks, onUpdated, categories = [], onTaskClick }) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const { openMenu, menuEl } = useContextMenu(onUpdated, categories);
  const { onDragStart, onDragOver, onDrop, onDragLeave, dragOverDate } = useDragDrop(onUpdated);

  return (
    <>
      {menuEl}
      <div className="h-full flex flex-col">
        <div className="grid grid-cols-7 border-b border-white/10">
          {weekDays.map((date) => {
            const todayFlag = isSameDay(date, new Date());
            const isSelected = isSameDay(date, selectedDate);
            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className="py-3 flex flex-col items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-500 tracking-wider">{format(date, "EEE").toUpperCase()}</span>
                <span
                  className="h-9 w-9 flex items-center justify-center rounded-full text-base font-medium"
                  style={
                    todayFlag
                      ? { backgroundColor: "#4285f4", color: "#fff" }
                      : isSelected
                      ? { backgroundColor: "#3c3d3f", color: "#fff" }
                      : { color: "#e8eaed" }
                  }
                >
                  {format(date, "d")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-7 divide-x divide-white/10 flex-1">
          {weekDays.map((date) => {
            const dayTasks = getTasksForDate(tasks, date);
            const isSelected = isSameDay(date, selectedDate);
            const dateStr = format(date, "yyyy-MM-dd");
            const isDragOver = dragOverDate === dateStr;
            return (
              <div
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                onDragOver={(e) => onDragOver(e, dateStr)}
                onDrop={(e) => onDrop(e, dateStr)}
                onDragLeave={onDragLeave}
                className={`p-2 min-h-[300px] cursor-pointer transition-colors ${isDragOver ? "bg-blue-500/20" : isSelected ? "bg-white/5" : "hover:bg-white/5"}`}
              >
                <div className="space-y-1">
                  {dayTasks.length === 0 && <p className="text-[10px] text-gray-600 text-center mt-6">—</p>}
                  {dayTasks.map((task) => (
                    <TaskPill key={task.id} task={task} onContextMenu={openMenu} onDragStart={onDragStart} onTaskClick={onTaskClick} categories={categories} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── DAILY VIEW ────────────────────────────────────────────────────────────────
export function DailyView({ selectedDate, tasks, toggleStatus, onUpdated, categories = [] }) {
  const dayTasks = getTasksForDate(tasks, selectedDate);
  const todayFlag = isSameDay(selectedDate, new Date());
  const { openMenu, menuEl } = useContextMenu(onUpdated, categories);

  return (
    <>
      {menuEl}
      <div className="p-8 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl font-thin text-gray-200 mb-1">{format(selectedDate, "d")}</div>
          <div className="text-lg font-medium text-gray-300">{format(selectedDate, "EEEE")}</div>
          <div className="text-sm text-gray-500">{format(selectedDate, "MMMM yyyy")}</div>
          {todayFlag && <div className="mt-2 inline-block px-3 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#4285f4" + "33", color: "#4285f4" }}>Today</div>}
        </div>
        <div className="space-y-2">
          {dayTasks.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              <p className="text-sm">No tasks for this day</p>
            </div>
          )}
          {dayTasks.map((task) => {
            const categoryMap = Object.fromEntries(categories.map(c => [c.key, { bg: c.color, text: "#fff" }]));
            const c = categoryMap[task.category] || DEFAULT_CATEGORY_COLORS[task.category] || defaultColor;
            return (
              <button
                key={task.id}
                onClick={() => toggleStatus(task)}
                onContextMenu={(e) => openMenu(e, task)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 text-left transition-all hover:bg-white/5 bg-[#2d2e30]"
              >
                {task.status === "done"
                  ? <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#4285f4" }} />
                  : <Circle className="h-5 w-5 text-gray-600 shrink-0" />}
                <div className="h-3 w-1 rounded-full shrink-0" style={{ backgroundColor: task.status === "done" ? "#555" : c.bg }} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-600" : "text-gray-200"}`}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>
                  )}
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
    </>
  );
}

// ── YEARLY VIEW ───────────────────────────────────────────────────────────────
export function YearlyView({ currentMonth, selectedDate, setSelectedDate, tasks }) {
  const year = getYear(currentMonth);
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
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
          <div
            key={monthDate.toISOString()}
            className="rounded-xl p-3 border transition-all"
            style={{
              backgroundColor: isCurrentDisplayMonth ? "#2d2e30" : "#252627",
              borderColor: isCurrentDisplayMonth ? "#4285f4" : "rgba(255,255,255,0.08)",
            }}
          >
            <p className="text-xs font-bold text-gray-300 mb-2 text-center">{format(monthDate, "MMMM")}</p>
            <div className="grid grid-cols-7 mb-1">
              {["S","M","T","W","T","F","S"].map((h, i) => (
                <div key={i} className="text-center text-[8px] text-gray-600 font-semibold">{h}</div>
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
                    className={`relative flex flex-col items-center justify-center h-5 w-full rounded text-[9px] font-medium transition-all ${!inMonth ? "opacity-20" : "hover:bg-white/10"}`}
                    style={
                      todayFlag
                        ? { backgroundColor: "#4285f4", color: "#fff" }
                        : isSelected
                        ? { backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }
                        : { color: "#bdc1c6" }
                    }
                  >
                    {format(date, "d")}
                    {dayTasks.length > 0 && inMonth && !isSelected && !todayFlag && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full" style={{ backgroundColor: "#4285f4" }} />
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