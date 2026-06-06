import React from "react";
import { Pencil, FileText, Layout as LayoutIcon, Network, KanbanSquare, BookOpen, X } from "lucide-react";

const TEMPLATES = [
  {
    type: "whiteboard",
    name: "Blank Whiteboard",
    description: "Infinite canvas with drawing, shapes, text",
    icon: Pencil,
    accent: "from-blue-500/20 to-cyan-500/15 text-blue-400",
    starter: null,
  },
  {
    type: "notion",
    name: "Page with properties",
    description: "Notion-style page with status, dates, priority, and notes",
    icon: LayoutIcon,
    accent: "from-purple-500/20 to-pink-500/15 text-purple-400",
    starter: null,
  },
  {
    type: "document",
    name: "Document",
    description: "Plain text & markdown — ideas, notes, drafts",
    icon: FileText,
    accent: "from-emerald-500/20 to-teal-500/15 text-emerald-400",
    starter: { content: "" },
  },
  {
    type: "whiteboard",
    name: "Mind Map",
    description: "Central node with branches — starter shapes",
    icon: Network,
    accent: "from-amber-500/20 to-orange-500/15 text-amber-400",
    starter: {
      whiteboard: JSON.stringify([
        { id: "mm_1", type: "ellipse", x: 350, y: 200, w: 220, h: 80, color: "#3b82f6", strokeWidth: 3 },
        { id: "mm_2", type: "text", x: 400, y: 220, w: 120, h: 30, text: "Main Idea", color: "#e5e7eb", fontSize: 24 },
        { id: "mm_3", type: "ellipse", x: 100, y: 80, w: 140, h: 50, color: "#10b981", strokeWidth: 2 },
        { id: "mm_4", type: "text", x: 130, y: 95, w: 80, h: 20, text: "Branch A", color: "#e5e7eb", fontSize: 16 },
        { id: "mm_5", type: "ellipse", x: 660, y: 80, w: 140, h: 50, color: "#f59e0b", strokeWidth: 2 },
        { id: "mm_6", type: "text", x: 690, y: 95, w: 80, h: 20, text: "Branch B", color: "#e5e7eb", fontSize: 16 },
        { id: "mm_7", type: "ellipse", x: 100, y: 360, w: 140, h: 50, color: "#ec4899", strokeWidth: 2 },
        { id: "mm_8", type: "text", x: 130, y: 375, w: 80, h: 20, text: "Branch C", color: "#e5e7eb", fontSize: 16 },
        { id: "mm_9", type: "ellipse", x: 660, y: 360, w: 140, h: 50, color: "#8b5cf6", strokeWidth: 2 },
        { id: "mm_10", type: "text", x: 690, y: 375, w: 80, h: 20, text: "Branch D", color: "#e5e7eb", fontSize: 16 },
        { id: "mm_11", type: "line", x1: 240, y1: 105, x2: 380, y2: 220, color: "#666", strokeWidth: 1.5 },
        { id: "mm_12", type: "line", x1: 660, y1: 105, x2: 540, y2: 220, color: "#666", strokeWidth: 1.5 },
        { id: "mm_13", type: "line", x1: 240, y1: 385, x2: 380, y2: 260, color: "#666", strokeWidth: 1.5 },
        { id: "mm_14", type: "line", x1: 660, y1: 385, x2: 540, y2: 260, color: "#666", strokeWidth: 1.5 },
      ]),
    },
  },
  {
    type: "whiteboard",
    name: "Kanban Board",
    description: "Three swim lanes for To Do / Doing / Done",
    icon: KanbanSquare,
    accent: "from-rose-500/20 to-fuchsia-500/15 text-rose-400",
    starter: {
      whiteboard: JSON.stringify([
        { id: "kb_1", type: "rect", x: 50, y: 80, w: 260, h: 480, color: "#3b82f6", strokeWidth: 2 },
        { id: "kb_2", type: "text", x: 70, y: 95, w: 200, h: 30, text: "To Do", color: "#3b82f6", fontSize: 24 },
        { id: "kb_3", type: "rect", x: 340, y: 80, w: 260, h: 480, color: "#f59e0b", strokeWidth: 2 },
        { id: "kb_4", type: "text", x: 360, y: 95, w: 200, h: 30, text: "Doing", color: "#f59e0b", fontSize: 24 },
        { id: "kb_5", type: "rect", x: 630, y: 80, w: 260, h: 480, color: "#10b981", strokeWidth: 2 },
        { id: "kb_6", type: "text", x: 650, y: 95, w: 200, h: 30, text: "Done", color: "#10b981", fontSize: 24 },
      ]),
    },
  },
  {
    type: "document",
    name: "Meeting Notes",
    description: "Pre-formatted notes template",
    icon: BookOpen,
    accent: "from-indigo-500/20 to-violet-500/15 text-indigo-400",
    starter: {
      content: "# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n- \n\n## Discussion\n\n\n## Action items\n- [ ] \n- [ ] \n\n## Decisions\n",
    },
  },
];

export default function TemplatePicker({ open, onClose, onCreate }) {
  if (!open) return null;

  const handlePick = (tpl) => {
    onCreate({
      type: tpl.type,
      title: tpl.name === "Blank Whiteboard" || tpl.name === "Page with properties" || tpl.name === "Document" ? "" : tpl.name,
      icon: tpl.type === "document" ? "file" : tpl.type === "notion" ? "spark" : "folder",
      ...(tpl.starter || {}),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1e1f20] border border-white/[0.1] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Create a new page</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pick a template to start with</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 max-h-[70vh] overflow-y-auto">
          {TEMPLATES.map((tpl, i) => {
            const Icon = tpl.icon;
            return (
              <button
                key={i}
                onClick={() => handlePick(tpl)}
                className="text-left p-4 rounded-xl border border-white/[0.06] bg-[#252628] hover:bg-[#2c2d2f] hover:border-white/[0.15] transition-all group"
              >
                <div className={`inline-flex h-10 w-10 rounded-lg bg-gradient-to-br ${tpl.accent} items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-gray-100 mb-1">{tpl.name}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{tpl.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
