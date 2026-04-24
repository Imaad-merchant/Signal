import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Clock, ArrowUpCircle, Calendar, MoreHorizontal, Trash2, Play, ChevronRight, Plus, ListChecks } from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const priorityDot = {
  high: "bg-rose-400",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

const DEFAULT_CAT_COLORS = {
  work: "#4285f4", personal: "#a142f4", health: "#0f9d58",
  learning: "#f4b400", creative: "#db4437",
};

const statusIcons = {
  todo: Circle,
  in_progress: ArrowUpCircle,
  done: CheckCircle2,
};

// ─── Sub-tasks (per-task checklist stored in localStorage) ─────────

function SubTasks({ taskId }) {
  const storageKey = `pulse_subtasks_${taskId}`;
  const [items, setItems] = useState(() => {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const addItem = () => {
    const text = input.trim();
    if (!text) return;
    setItems((prev) => [...prev, { id: Date.now(), text, done: false }]);
    setInput("");
    inputRef.current?.focus();
  };

  const toggle = (id) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  };

  const remove = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  return (
    <div className="mt-2 ml-3.5 space-y-1">
      {items.map((it) => (
        <div key={it.id} className="group/sub flex items-center gap-2 py-0.5">
          <button
            onClick={() => toggle(it.id)}
            className="shrink-0 text-gray-600 hover:text-blue-400 transition-colors"
          >
            {it.done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/80" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
          </button>
          <span className={`flex-1 text-[11.5px] ${it.done ? "line-through text-gray-600" : "text-gray-400"}`}>
            {it.text}
          </span>
          <button
            onClick={() => remove(it.id)}
            className="opacity-0 group-hover/sub:opacity-100 text-gray-700 hover:text-red-400 transition-all"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}

      {/* Add input */}
      <div className="flex items-center gap-2 py-0.5">
        <Plus className="h-3.5 w-3.5 text-gray-700 shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addItem(); }
          }}
          placeholder="Add a to-do..."
          className="flex-1 bg-transparent text-[11.5px] text-gray-400 placeholder-gray-700 focus:outline-none"
        />
      </div>
    </div>
  );
}

export default function TaskCard({ task, onStatusChange, onDelete, onStartFocus, onDescriptionChange, categories = [] }) {
  const catColorMap = Object.fromEntries(categories.map(c => [c.key, c.color]));
  const catColor = catColorMap[task.category] || DEFAULT_CAT_COLORS[task.category] || "#4285f4";
  const StatusIcon = statusIcons[task.status] || Circle;
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(task.description || "");
  const [expanded, setExpanded] = useState(false);
  const descRef = useRef(null);
  const debounceRef = useRef(null);

  // Read sub-task count from localStorage for badge
  const [subCount, setSubCount] = useState({ total: 0, done: 0 });
  useEffect(() => {
    try {
      const s = localStorage.getItem(`pulse_subtasks_${task.id}`);
      const items = s ? JSON.parse(s) : [];
      setSubCount({ total: items.length, done: items.filter((i) => i.done).length });
    } catch {}
  }, [task.id, expanded]);

  useEffect(() => { setDescValue(task.description || ""); }, [task.description]);

  const saveDescription = useCallback((val) => {
    if (onDescriptionChange && val !== (task.description || "")) {
      onDescriptionChange(task, val);
    }
  }, [task, onDescriptionChange]);

  const handleDescChange = (e) => {
    const val = e.target.value;
    setDescValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveDescription(val), 800);
  };

  const closeDesc = () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); saveDescription(descValue); }
    setEditingDesc(false);
  };

  useEffect(() => {
    if (editingDesc && descRef.current) descRef.current.focus();
  }, [editingDesc]);

  const isDone = task.status === "done";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className={`group rounded-lg transition-all ${
        isDone ? "opacity-50 hover:opacity-70" : "hover:bg-white/[0.03]"
      }`}
      style={{ borderLeft: `3px solid ${isDone ? "#333" : catColor}` }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Expand chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="shrink-0 text-gray-700 hover:text-gray-400 transition-colors"
          title={expanded ? "Hide to-dos" : "Show to-dos"}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>

        {/* Status checkbox */}
        <button
          onClick={() => {
            const next = isDone ? "todo" : "done";
            onStatusChange(task, next);
          }}
          className="shrink-0"
        >
          <StatusIcon
            className={`h-[18px] w-[18px] transition-colors ${
              isDone
                ? "text-emerald-500"
                : task.status === "in_progress"
                ? "text-blue-400"
                : "text-gray-600 hover:text-gray-400"
            }`}
          />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Priority dot */}
            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot[task.priority] || priorityDot.medium}`} />
            <p className={`text-[13px] font-medium truncate ${isDone ? "line-through text-gray-500" : "text-gray-200"}`}>
              {task.title}
            </p>
            {/* Sub-task badge */}
            {subCount.total > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[10px] text-gray-600 bg-white/[0.04] hover:bg-white/[0.08] rounded-full px-1.5 py-0.5 transition-colors shrink-0"
              >
                <ListChecks className="h-2.5 w-2.5" />
                {subCount.done}/{subCount.total}
              </button>
            )}
          </div>

          {/* Description / notes */}
          {editingDesc ? (
            <textarea
              ref={descRef}
              value={descValue}
              onChange={handleDescChange}
              onBlur={closeDesc}
              onKeyDown={(e) => { if (e.key === "Escape") closeDesc(); }}
              rows={2}
              placeholder="Add a note..."
              className="w-full mt-1.5 ml-3.5 bg-[#1e1f20] border border-white/10 rounded-md px-2 py-1.5 text-xs text-gray-400 placeholder-gray-600 focus:outline-none focus:border-blue-500/30 resize-none"
            />
          ) : descValue ? (
            <p
              className="text-xs text-gray-500 mt-0.5 ml-3.5 truncate cursor-pointer hover:text-gray-400 transition-colors"
              onClick={() => onDescriptionChange && setEditingDesc(true)}
            >
              {descValue}
            </p>
          ) : (
            <p
              className="text-xs text-gray-700 mt-0.5 ml-3.5 cursor-pointer hover:text-gray-500 transition-colors italic opacity-0 group-hover:opacity-100"
              onClick={() => onDescriptionChange && setEditingDesc(true)}
            >
              Add a note...
            </p>
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 shrink-0">
          {task.estimated_minutes && (
            <span className="flex items-center gap-1 text-[11px] text-gray-600">
              <Clock className="h-3 w-3" />
              {task.estimated_minutes}m
            </span>
          )}
          {task.category && (
            <span className="text-[11px] text-gray-500 capitalize hidden sm:inline">
              {task.category}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {!isDone && (
            <button
              onClick={() => onStartFocus(task)}
              className="p-1.5 rounded-md hover:bg-amber-500/10 text-gray-600 hover:text-amber-400 transition-colors"
              title="Focus"
            >
              <Play className="h-3 w-3" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-md hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-colors">
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 bg-[#2d2e30] border-white/10">
              <DropdownMenuItem onClick={() => onStatusChange(task, "todo")} className="text-gray-300 focus:bg-white/10 text-xs">
                <Circle className="h-3 w-3 mr-2 text-gray-500" /> To Do
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStatusChange(task, "in_progress")} className="text-gray-300 focus:bg-white/10 text-xs">
                <ArrowUpCircle className="h-3 w-3 mr-2 text-blue-400" /> In Progress
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStatusChange(task, "done")} className="text-gray-300 focus:bg-white/10 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-2 text-emerald-400" /> Done
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(task)} className="text-rose-400 focus:bg-white/10 text-xs">
                <Trash2 className="h-3 w-3 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expandable sub-tasks */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-9 pr-3 pb-3 border-t border-white/[0.03]">
              <SubTasks taskId={task.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
