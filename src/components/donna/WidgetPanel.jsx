import React from "react";
import { PanelRightClose, PanelRightOpen, SlidersHorizontal } from "lucide-react";
import StatusGrid from "./StatusGrid";
import RecentActions from "./RecentActions";

// The right-hand widget panel on the Donna screen: the status widgets (today,
// open, grades, inbox, …) stacked vertically. Collapsible, and its widgets are
// managed via the dashboard section of Customize (onEdit).
export default function WidgetPanel({ collapsed, onToggleCollapse, onEdit }) {
  if (collapsed) {
    return (
      <div className="hidden md:flex shrink-0 flex-col items-center border-l border-white/[0.06] bg-[#0d0f13]/80 px-1.5 py-3 backdrop-blur-sm">
        <button onClick={onToggleCollapse} title="Show widgets" aria-label="Show widgets" className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200">
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <aside className="relative hidden w-[34%] min-w-[280px] max-w-[400px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0d0f13]/80 backdrop-blur-sm md:flex">
      <div className="flex items-center gap-1 border-b border-white/[0.05] px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Widgets</span>
        <div className="flex-1" />
        <button onClick={onEdit} title="Add or remove widgets" aria-label="Edit widgets" className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <button onClick={onToggleCollapse} title="Collapse panel" aria-label="Collapse panel" className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200">
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <div className="relative flex-1 overflow-y-auto p-3 pt-3">
        <RecentActions />
        <StatusGrid variant="panel" />
      </div>
    </aside>
  );
}
