import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  format, isSameDay, addMonths, subMonths, addYears, subYears,
  addWeeks, subWeeks, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, isSameMonth
} from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronLeft, ChevronRight, Plus, Minus, ListTodo, CalendarDays, Menu, Calendar, ChevronDown, Settings, CheckSquare, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ImportActivitiesDialog from "../components/dashboard/ImportActivitiesDialog";
import ImportTasksDialog from "../components/dashboard/ImportTasksDialog";
import AIAssistantDialog from "../components/dashboard/AIAssistantDialog";
import AddEventDialog from "../components/dashboard/AddEventDialog";
import AddTaskDialog2 from "../components/dashboard/AddTaskDialog2";
import { MonthlyView, WeeklyView, DailyView, YearlyView } from "../components/dashboard/CalendarViews";

const VIEWS = ["Day", "Week", "Month", "Year"];
const VIEW_MAP = { Day: "Daily", Week: "Weekly", Month: "Monthly", Year: "Yearly" };

const DAY_HEADERS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

function MiniCalendar({ currentMonth, selectedDate, setSelectedDate, onMonthChange }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = [];
  let d = calStart;
  while (d <= calEnd) { calDays.push(d); d = addDays(d, 1); }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-200">{format(currentMonth, "MMMM yyyy")}</span>
        <div className="flex gap-0.5">
          <button onClick={() => onMonthChange(subMonths(currentMonth, 1))} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMonthChange(addMonths(currentMonth, 1))} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS_SHORT.map((h, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-500 py-0.5">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {calDays.map((date, idx) => {
          const inMonth = isSameMonth(date, currentMonth);
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(date)}
              className={`h-6 w-6 mx-auto flex items-center justify-center rounded-full text-[11px] font-medium transition-all
                ${!inMonth ? "opacity-25" : "hover:bg-white/10"}
                ${isSelected && !isToday ? "bg-white/20 text-white" : ""}
                ${isToday ? "bg-blue-500 text-white" : inMonth ? "text-gray-300" : "text-gray-600"}
              `}
            >
              {format(date, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showImport, setShowImport] = useState(false);
  const [showImportTasks, setShowImportTasks] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [view, setView] = useState("Month");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const CATEGORIES = [
    { label: "Work",     color: "#4285f4", key: "work" },
    { label: "Personal", color: "#a142f4", key: "personal" },
    { label: "Health",   color: "#0f9d58", key: "health" },
    { label: "Learning", color: "#f4b400", key: "learning" },
    { label: "Creative", color: "#db4437", key: "creative" },
  ];
  const [enabledCategories, setEnabledCategories] = useState(
    () => Object.fromEntries(CATEGORIES.map(c => [c.key, true]))
  );
  const toggleCategory = (key) => setEnabledCategories(prev => ({ ...prev, [key]: !prev[key] }));

  const internalView = VIEW_MAP[view];

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", user?.email],
    queryFn: () => base44.entities.Task.filter({ created_by: user.email }, "-created_date"),
    enabled: !!user,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const filteredTasks = tasks.filter(t => enabledCategories[t.category ?? "work"] !== false);

  const toggleStatus = async (task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    const data = { status: newStatus };
    if (newStatus === "done") data.completed_date = new Date().toISOString();
    await base44.entities.Task.update(task.id, data);
    refresh();
  };

  const navigatePrev = () => {
    if (view === "Month") setCurrentMonth(subMonths(currentMonth, 1));
    else if (view === "Year") setCurrentMonth(subYears(currentMonth, 1));
    else if (view === "Week") setSelectedDate(d => subWeeks(d, 1));
    else if (view === "Day") setSelectedDate(d => addDays(d, -1));
  };
  const navigateNext = () => {
    if (view === "Month") setCurrentMonth(addMonths(currentMonth, 1));
    else if (view === "Year") setCurrentMonth(addYears(currentMonth, 1));
    else if (view === "Week") setSelectedDate(d => addWeeks(d, 1));
    else if (view === "Day") setSelectedDate(d => addDays(d, 1));
  };
  const navigateToday = () => { setCurrentMonth(new Date()); setSelectedDate(new Date()); };

  const headerLabel = () => {
    if (view === "Year") return format(currentMonth, "yyyy");
    if (view === "Month") return format(currentMonth, "MMMM yyyy");
    if (view === "Week") {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    if (view === "Day") return format(selectedDate, "MMMM d, yyyy");
    return "";
  };

  return (
    <div className="flex h-screen bg-[#1e1f20] text-gray-100 overflow-hidden">

      {/* Left Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 border-r border-white/10 flex flex-col overflow-hidden"
            style={{ width: 240 }}
          >
            {/* Create button */}
            <div className="p-4 pt-5 relative">
              <button
                onClick={() => setCreateMenuOpen(o => !o)}
                className="flex items-center gap-3 w-full px-4 py-3 bg-[#2d2e30] hover:bg-[#3c3d3f] rounded-2xl text-sm font-medium text-gray-200 transition-all shadow-md"
              >
                <Plus className="h-5 w-5 text-gray-300" />
                Create
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 ml-auto transition-transform ${createMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {createMenuOpen && (
                <div className="absolute left-4 right-4 top-full mt-1 bg-[#2d2e30] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <button
                    onClick={() => { setShowAddEvent(true); setCreateMenuOpen(false); }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/10 text-sm text-gray-200 transition-colors"
                  >
                    <CalendarDays className="h-4 w-4 text-blue-400" />
                    New Event
                  </button>
                  <button
                    onClick={() => { setShowAddTask(true); setCreateMenuOpen(false); }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/10 text-sm text-gray-200 transition-colors"
                  >
                    <ListTodo className="h-4 w-4 text-amber-400" />
                    New Task
                  </button>
                </div>
              )}
            </div>

            {/* Mini calendar */}
            <MiniCalendar
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              setSelectedDate={(date) => { setSelectedDate(date); setCurrentMonth(date); }}
              onMonthChange={setCurrentMonth}
            />

            {/* Categories */}
            <div className="px-3 mt-2">
              <div className="flex items-center justify-between py-2 px-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Categories</span>
                <button
                  onClick={() => setShowAddEvent(true)}
                  className="p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                  title="Add event"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-0.5 pl-1">
                {CATEGORIES.map((cat) => {
                  const enabled = enabledCategories[cat.key];
                  return (
                    <div key={cat.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5">
                      <div className="h-3 w-3 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-sm text-gray-300 flex-1">{cat.label}</span>
                      <button
                        onClick={() => toggleCategory(cat.key)}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 relative ${enabled ? "bg-blue-600" : "bg-white/10"}`}
                        title={enabled ? "Hide" : "Show"}
                      >
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${enabled ? "left-4.5 translate-x-0" : "left-0.5"}`} style={{ left: enabled ? "calc(100% - 14px)" : "2px" }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Import */}
            <div className="px-3 mt-4">
              <div className="flex items-center justify-between py-2 px-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Import</span>
              </div>
              <div className="space-y-1 pl-1">
                <button onClick={() => setShowImport(true)} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 w-full text-left">
                  <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-sm text-gray-300">Import Calendar</span>
                </button>
                <button onClick={() => setShowImportTasks(true)} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 w-full text-left">
                  <ListTodo className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-sm text-gray-300">Import Tasks</span>
                </button>
                <button onClick={() => setShowAIAssistant(true)} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 w-full text-left">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-sm text-gray-300">AI Assistant</span>
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 flex-shrink-0 min-w-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 transition-colors flex-shrink-0">
            <Menu className="h-4 w-4" />
          </button>

          <Calendar className="h-5 w-5 text-blue-400 flex-shrink-0" />

          <button onClick={navigateToday} className="px-3 py-1 rounded border border-white/20 text-xs text-gray-300 hover:bg-white/10 transition-colors font-medium flex-shrink-0">
            Today
          </button>
          <button onClick={navigatePrev} className="p-1 rounded-full hover:bg-white/10 text-gray-400 transition-colors flex-shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={navigateNext} className="p-1 rounded-full hover:bg-white/10 text-gray-400 transition-colors flex-shrink-0">
            <ChevronRight className="h-4 w-4" />
          </button>

          <h2 className="text-sm font-medium text-gray-100 truncate min-w-0">{headerLabel()}</h2>

          <div className="ml-auto flex items-center gap-1.5">
            {/* View switcher */}
            <div className="flex items-center bg-[#2d2e30] rounded-lg border border-white/10 overflow-hidden">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-all ${
                    view === v ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/10"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>


            <Link to={createPageUrl("Tasks")} className="p-2 rounded-full hover:bg-white/10 text-gray-400 transition-colors" title="Tasks">
              <CheckSquare className="h-5 w-5" />
            </Link>
            <Link to={createPageUrl("Settings")} className="p-2 rounded-full hover:bg-white/10 text-gray-400 transition-colors" title="Settings">
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Calendar Body */}
        <div className="flex-1 overflow-auto">
          {internalView === "Monthly" && (
            <MonthlyView
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              tasks={filteredTasks}
              onUpdated={refresh}
            />
          )}
          {internalView === "Weekly" && (
            <WeeklyView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              tasks={filteredTasks}
              onUpdated={refresh}
            />
          )}
          {internalView === "Daily" && (
            <DailyView
              selectedDate={selectedDate}
              tasks={filteredTasks}
              toggleStatus={toggleStatus}
              onUpdated={refresh}
            />
          )}
          {internalView === "Yearly" && (
            <YearlyView
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              tasks={filteredTasks}
              dark
            />
          )}
        </div>
      </div>

      <AIAssistantDialog open={showAIAssistant} onOpenChange={setShowAIAssistant} onUpdated={refresh} />
      <ImportActivitiesDialog open={showImport} onOpenChange={setShowImport} onImported={refresh} />
      <ImportTasksDialog open={showImportTasks} onOpenChange={setShowImportTasks} onImported={refresh} />
      <AddEventDialog open={showAddEvent} onOpenChange={setShowAddEvent} defaultDate={format(selectedDate, "yyyy-MM-dd")} onAdded={refresh} />
      <AddTaskDialog2 open={showAddTask} onOpenChange={setShowAddTask} onAdded={refresh} />
    </div>
  );
}