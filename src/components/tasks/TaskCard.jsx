import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, ArrowUpCircle, Calendar, MoreHorizontal, Trash2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const priorityConfig = {
  high: { color: "bg-rose-500/15 text-rose-400 border-rose-500/20", label: "High" },
  medium: { color: "bg-amber-500/15 text-amber-400 border-amber-500/20", label: "Medium" },
  low: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", label: "Low" },
};

const categoryConfig = {
  work: "bg-blue-500/15 text-blue-400",
  personal: "bg-purple-500/15 text-purple-400",
  health: "bg-green-500/15 text-green-400",
  learning: "bg-amber-500/15 text-amber-400",
  creative: "bg-pink-500/15 text-pink-400",
};

const statusIcons = {
  todo: Circle,
  in_progress: ArrowUpCircle,
  done: CheckCircle2,
};

export default function TaskCard({ task, onStatusChange, onDelete, onStartFocus }) {
  const StatusIcon = statusIcons[task.status] || Circle;
  const priority = priorityConfig[task.priority] || priorityConfig.medium;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`group flex items-start gap-3 p-4 rounded-xl border transition-all hover:shadow-sm ${
        task.status === "done"
          ? "bg-[#2d2e30]/50 border-white/5 opacity-60"
          : "bg-[#2d2e30] border-white/10 hover:border-white/20"
      }`}
    >
      <button
        onClick={() => {
          const next = task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
          onStatusChange(task, next);
        }}
        className="mt-0.5 shrink-0"
      >
        <StatusIcon
          className={`h-5 w-5 transition-colors ${
            task.status === "done"
              ? "text-emerald-500"
              : task.status === "in_progress"
              ? "text-blue-500"
              : "text-gray-300 hover:text-gray-400"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-500" : "text-gray-100"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 border ${priority.color}`}>
            {priority.label}
          </Badge>
          {task.category && (
            <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${categoryConfig[task.category]}`}>
              {task.category}
            </Badge>
          )}
          {task.estimated_minutes && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
              <Clock className="h-3 w-3" />
              {task.estimated_minutes}m
            </span>
          )}
          {task.due_date && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
              <Calendar className="h-3 w-3" />
              {format(new Date(task.due_date), "MMM d")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.status !== "done" && (
          <button
            onClick={() => onStartFocus(task)}
            className="p-1.5 rounded-lg hover:bg-amber-500/20 text-gray-400 hover:text-amber-400 transition-colors"
            title="Start focus session"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 transition-colors">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36 bg-[#2d2e30] border-white/10">
            <DropdownMenuItem onClick={() => onStatusChange(task, "todo")} className="text-gray-200 focus:bg-white/10 focus:text-gray-100">
              <Circle className="h-3.5 w-3.5 mr-2 text-gray-400" /> To Do
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(task, "in_progress")} className="text-gray-200 focus:bg-white/10 focus:text-gray-100">
              <ArrowUpCircle className="h-3.5 w-3.5 mr-2 text-blue-400" /> In Progress
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(task, "done")} className="text-gray-200 focus:bg-white/10 focus:text-gray-100">
              <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-400" /> Done
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(task)} className="text-rose-400 focus:bg-white/10 focus:text-rose-300">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}