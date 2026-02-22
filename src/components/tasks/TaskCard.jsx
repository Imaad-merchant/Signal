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
  high: { color: "bg-rose-50 text-rose-600 border-rose-100", label: "High" },
  medium: { color: "bg-amber-50 text-amber-600 border-amber-100", label: "Medium" },
  low: { color: "bg-emerald-50 text-emerald-600 border-emerald-100", label: "Low" },
};

const categoryConfig = {
  work: "bg-blue-50 text-blue-600",
  personal: "bg-purple-50 text-purple-600",
  health: "bg-green-50 text-green-600",
  learning: "bg-amber-50 text-amber-600",
  creative: "bg-pink-50 text-pink-600",
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
          ? "bg-gray-50/50 border-gray-100 opacity-60"
          : "bg-white border-gray-100 hover:border-gray-200"
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
        <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{task.description}</p>
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
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <Clock className="h-3 w-3" />
              {task.estimated_minutes}m
            </span>
          )}
          {task.due_date && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
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
            className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
            title="Start focus session"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onStatusChange(task, "todo")}>
              <Circle className="h-3.5 w-3.5 mr-2 text-gray-400" /> To Do
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(task, "in_progress")}>
              <ArrowUpCircle className="h-3.5 w-3.5 mr-2 text-blue-500" /> In Progress
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(task, "done")}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Done
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(task)} className="text-rose-600">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}