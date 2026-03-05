import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Circle, Clock, Tag } from "lucide-react";

const categoryColors = {
  work: { bg: "#4285f4", text: "#fff" },
  personal: { bg: "#a142f4", text: "#fff" },
  health: { bg: "#0f9d58", text: "#fff" },
  learning: { bg: "#f4b400", text: "#fff" },
  creative: { bg: "#db4437", text: "#fff" },
};

export default function TaskDetailModal({ task, open, onOpenChange }) {
  if (!task) return null;

  const categoryColor = categoryColors[task.category] || { bg: "#4285f4", text: "#fff" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#2d2e30] border-white/10 text-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {task.status === "done" ? (
              <CheckCircle2 className="h-5 w-5" style={{ color: "#4285f4" }} />
            ) : (
              <Circle className="h-5 w-5 text-gray-600" />
            )}
            {task.title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {task.description && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-300">{task.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Category</p>
              <div
                className="inline-block px-3 py-1 rounded-lg text-sm font-medium"
                style={{ backgroundColor: categoryColor.bg, color: categoryColor.text }}
              >
                {task.category}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Priority</p>
              <p className="text-sm capitalize text-gray-300">{task.priority}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <p className="text-sm capitalize text-gray-300">{task.status}</p>
            </div>

            {task.due_date && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Due Date</p>
                <p className="text-sm text-gray-300">{task.due_date}</p>
              </div>
            )}
          </div>

          {task.estimated_minutes && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="h-4 w-4" />
              {task.estimated_minutes} minutes estimated
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}