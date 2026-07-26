import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { reverseAgentAction } from "./undo";

// Relative-time label ("2h", "3d").
function ago(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const LABEL = { remind: "Reminder", log: "Logged", monitor: "Metric", write: "Note", grade: "Grade" };

// One-line description of what an action created, from its payload.
function summarize(rec) {
  const p = rec.payload || {};
  if (rec.action_type === "remind") return p.text || "reminder";
  if (rec.action_type === "log") return p.text || "note";
  if (rec.action_type === "monitor") return p.metric + (p.value != null ? `: ${p.value}` : "");
  if (rec.action_type === "write") return p.title || "document";
  if (rec.action_type === "grade") return `${p.score ?? ""} ${p.course || p.assignment || ""}`.trim();
  return rec.action_type || "action";
}

export default function RecentActions() {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["recent-actions"],
    queryFn: () => base44.entities.AgentAction.list("-executed_at", 20).catch(() => []),
    staleTime: 30_000,
  });

  const now = Date.now();
  const undoable = (Array.isArray(data) ? data : [])
    .filter((r) => r && !r.undone && (!r.undo_deadline || new Date(r.undo_deadline).getTime() > now))
    .slice(0, 6);

  if (!undoable.length) return null;

  const undo = async (rec) => {
    setBusyId(rec.id);
    await reverseAgentAction(rec);
    setBusyId(null);
    queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
    queryClient.invalidateQueries({ queryKey: ["grid"] });
  };

  return (
    <div className="absolute top-4 right-4 z-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-gray-300 hover:text-white hover:border-white/25 transition-colors"
        title="Recent actions you can undo"
      >
        <History className="h-3.5 w-3.5" />
        Recent
        <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px]">{undoable.length}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(80vw,20rem)] rounded-xl border border-white/10 bg-[#0d0f14]/95 backdrop-blur-md p-2 shadow-2xl">
          <div className="flex items-center justify-between px-1.5 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Undo within 24h</span>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-200" aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {undoable.map((rec) => (
              <li key={rec.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.04]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-500">
                    {LABEL[rec.action_type] || rec.action_type}
                    <span className="text-gray-600">· {ago(rec.executed_at)}</span>
                  </div>
                  <div className="truncate text-xs text-gray-200">{summarize(rec)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => undo(rec)}
                  disabled={busyId === rec.id}
                  className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-white/25 transition-colors disabled:opacity-50"
                >
                  {busyId === rec.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
