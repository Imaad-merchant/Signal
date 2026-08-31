import React, { useState } from "react";
import { CalendarDays, Trash2, Loader2 } from "lucide-react";
import { deleteEvents } from "./eventDelete";

// Shown only when the event being deleted repeats (more than one dated event
// shares its title). Lets you delete just this occurrence or the whole series.
export default function RecurringDeleteDialog({ task, series, onDone, onCancel }) {
  const [busy, setBusy] = useState(false);
  const count = series.length;

  const run = async (all) => {
    setBusy(true);
    await deleteEvents(all ? series : [task]);
    setBusy(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60" onMouseDown={busy ? undefined : onCancel}>
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/15 bg-[#2d2e30] p-5 shadow-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-gray-100">This event repeats</h2>
        </div>
        <p className="mb-4 text-xs text-gray-400">
          “{task.title}” has {count} occurrences. What would you like to delete?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(false)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm text-gray-100 hover:bg-white/[0.12] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> This event only
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 text-sm font-medium text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete all {count} events
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="mt-1 rounded-xl px-4 py-2 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
