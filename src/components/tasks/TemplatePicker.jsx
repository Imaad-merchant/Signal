import React from "react";
import { Pencil, FileText, X, Sparkles, LayoutDashboard } from "lucide-react";

const TEMPLATES = [
  {
    type: "document",
    name: "Document",
    description: "Rich-text editor for notes, drafts, and ideas — with formatting, tables, lists, and AI assistance.",
    icon: FileText,
    accent: "from-emerald-500/20 to-teal-500/15 text-emerald-400",
    starter: { content: "" },
  },
  {
    type: "whiteboard",
    name: "Canvas",
    description: "Infinite whiteboard for shapes, text, and diagrams — with AI to generate visuals from prompts.",
    icon: Pencil,
    accent: "from-blue-500/20 to-cyan-500/15 text-blue-400",
    starter: null,
  },
  {
    type: "dashboard",
    name: "Dashboard",
    description: "Drop in your transcript and degree requirements, then ask about credits, GPA and what is still missing.",
    icon: LayoutDashboard,
    accent: "from-violet-500/20 to-fuchsia-500/15 text-violet-400",
    starter: { dashboard: "" },
  },
];

// Page icon per template type — the sidebar/PDF views key off `icon`, not `type`.
const ICON_FOR_TYPE = { document: "file", dashboard: "grad", whiteboard: "folder" };

export default function TemplatePicker({ open, onClose, onCreate }) {
  if (!open) return null;

  const handlePick = (tpl) => {
    onCreate({
      type: tpl.type,
      title: "",
      icon: ICON_FOR_TYPE[tpl.type] || "folder",
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
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-100">Create a new page</h2>
              <p className="text-xs text-gray-500 mt-0.5">Notes, canvas, or a live tracker — all work alongside AI</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          {TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.type}
                onClick={() => handlePick(tpl)}
                className="text-left p-4 rounded-xl border border-white/[0.06] bg-[#252628] hover:bg-[#2c2d2f] hover:border-white/[0.18] transition-all group"
              >
                <div className={`inline-flex h-11 w-11 rounded-xl bg-gradient-to-br ${tpl.accent} items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-[15px] font-semibold text-gray-100 mb-1.5">{tpl.name}</p>
                <p className="text-[12px] text-gray-500 leading-relaxed">{tpl.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
