import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, RotateCcw, Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { reverseAgentAction } from "./undo";

// Relative-time label ("2h", "3d").
function ago(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// A 30-day record of everything Donna has deleted, each with one-click Restore.
// So you're never dependent on Google's Trash window — the app keeps its own
// snapshot and re-creates the task (and re-pushes the event to Google) on restore.
export default function DeletedHistory() {
  const [busyId, setBusyId] = useState(null);
  const [doneIds, setDoneIds] = useState(() => new Set());
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["deleted-history"],
    queryFn: () => base44.entities.AgentAction.list("-executed_at", 100).catch(() => []),
    staleTime: 30_000,
  });

  const now = Date.now();
  const deletions = (Array.isArray(data) ? data : []).filter(
    (r) => r && r.action_type === "remove" && !r.undone && r.payload?.snapshot
      && (!r.undo_deadline || new Date(r.undo_deadline).getTime() > now),
  );

  if (!deletions.length) return null;

  const restore = async (rec) => {
    setBusyId(rec.id);
    const { ok } = await reverseAgentAction(rec);
    setBusyId(null);
    if (ok) {
      setDoneIds((prev) => new Set(prev).add(rec.id));
      queryClient.invalidateQueries({ queryKey: ["deleted-history"] });
      queryClient.invalidateQueries({ queryKey: ["recent-actions"] });
      queryClient.invalidateQueries({ queryKey: ["grid"] });
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-rose-400/15 bg-rose-500/[0.04] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
        <Trash2 className="h-3.5 w-3.5 text-rose-300/80" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200/80">Deleted by Donna</span>
        <span className="ml-auto rounded-full bg-white/10 px-1.5 text-[10px] text-gray-400">{deletions.length}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {deletions.slice(0, 12).map((rec) => {
          const s = rec.payload.snapshot || {};
          const restored = doneIds.has(rec.id);
          return (
            <li key={rec.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.04]">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-gray-200">{s.title || "(untitled)"}</div>
                <div className="text-[10px] text-gray-500">
                  {s.due_date ? `${s.due_date} · ` : ""}deleted {ago(rec.executed_at)}
                </div>
              </div>
              {restored ? (
                <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-emerald-300">
                  <Check className="h-3 w-3" /> Restored
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => restore(rec)}
                  disabled={busyId === rec.id}
                  className="flex items-center gap-1 rounded-md border border-rose-400/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                >
                  {busyId === rec.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Restore
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
