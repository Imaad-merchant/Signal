import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, ArrowUpCircle, Calendar, MoreHorizontal, Trash2, Play } from "lucide-react";
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

export default function TaskCard({ task, onStatusChange, onDelete, onStartFocus, onDescriptionChange, categories = [] }) {
  const catColorMap = Object.fromEntries(categories.map(c => [c.key, c.color]));
  const catColor = catColorMap[task.category] || DEFAULT_CAT_COLORS[task.category] || "#4285f4";
  const StatusIcon = statusIcons[task.status] || Circle;
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(task.description || "");
  const descRef = useRef(null);
  const debounceRef = useRef(null);

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
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
        isDone
          ? "opacity-50 hover:opacity-70"
          : "hover:bg-white/[0.03]"
      }`}
      style={{ borderLeft: `3px solid ${isDone ? "#333" : catColor}` }}
    >
      {/* Status checkbox */}
      <button
        onClick={() => {
          const next = isDone ? "todo" : "done";
          onStatusChange(task, next);
        }}
        className="shrink-0 mt-0.5"
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
    </motion.div>
  );
}
