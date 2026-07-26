import React, { useState } from "react";
import { Eye, EyeOff, ChevronUp, ChevronDown, LayoutGrid } from "lucide-react";
import { ALL_TILES, loadDashCfg, setTileHidden, moveTile, currentOrder } from "./dashboardConfig";

// Edit which status tiles show and their order. Writes straight to the dashboard
// config (which the grid watches), so changes apply live. Donna can drive the same
// config by voice ("hide the grades tile").
export default function CustomizePanel() {
  const [cfg, setCfg] = useState(loadDashCfg);
  const refresh = () => setCfg(loadDashCfg());
  const order = currentOrder(cfg);
  const hidden = new Set(cfg.hidden || []);
  const labelOf = (k) => (ALL_TILES.find((t) => t.key === k) || {}).label || k;

  return (
    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#0e1015]/95 p-3 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        <LayoutGrid className="h-3.5 w-3.5" /> Customize dashboard
      </div>
      <ul className="flex flex-col gap-1.5">
        {order.map((key, idx) => {
          const isHidden = hidden.has(key);
          return (
            <li
              key={key}
              className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${isHidden ? "bg-white/5 opacity-50" : "bg-white/5"}`}
            >
              <span className="min-w-0 flex-1 truncate text-gray-100">{labelOf(key)}</span>
              <button
                type="button"
                onClick={() => { moveTile(key, "up"); refresh(); }}
                disabled={idx === 0}
                className="rounded-lg p-1 text-gray-400 hover:bg-white/10 disabled:opacity-25"
                title="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { moveTile(key, "down"); refresh(); }}
                disabled={idx === order.length - 1}
                className="rounded-lg p-1 text-gray-400 hover:bg-white/10 disabled:opacity-25"
                title="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setTileHidden(key, !isHidden); refresh(); }}
                className={`rounded-lg p-1 ${isHidden ? "text-gray-500 hover:bg-white/10" : "text-cyan-300 hover:bg-white/10"}`}
                title={isHidden ? "Show" : "Hide"}
              >
                {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-center text-[11px] text-gray-500">Or tell Donna: “hide the grades tile”.</p>
    </div>
  );
}
