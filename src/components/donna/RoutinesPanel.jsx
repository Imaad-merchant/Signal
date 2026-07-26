import React from "react";
import { Bell, Volume2, Circle, Type, Trash2, Power } from "lucide-react";
import { DELIVERIES, deliveryLabel, everyLabel } from "./reminders";

const DELIVERY_ICON = { voice: Volume2, orb: Circle, text: Type };

// Editable list of the user's recurring reminders. Tap the delivery chip to cycle
// how Donna delivers it (speak / orb / screen), the power icon to pause/resume,
// and the trash to remove it.
export default function RoutinesPanel({ reminders, onUpdate, onDelete }) {
  if (!reminders || !reminders.length) return null;
  return (
    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        <Bell className="h-3.5 w-3.5" /> Routines
      </div>
      <ul className="flex flex-col gap-2">
        {reminders.map((r) => {
          const Icon = DELIVERY_ICON[r.delivery] || Type;
          const cycle = () => {
            const i = DELIVERIES.indexOf(r.delivery);
            onUpdate(r.id, { delivery: DELIVERIES[(i + 1) % DELIVERIES.length] });
          };
          return (
            <li
              key={r.id}
              className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${r.enabled ? "bg-white/5" : "bg-white/5 opacity-45"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-gray-100">{r.title}</div>
                <div className="text-[11px] text-gray-400">{everyLabel(r.everyMinutes)}</div>
              </div>
              <button
                type="button"
                onClick={cycle}
                title={`Delivery: ${deliveryLabel(r.delivery)} — tap to change`}
                className="flex items-center gap-1 rounded-lg bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/25"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onUpdate(r.id, { enabled: !r.enabled })}
                title={r.enabled ? "Pause" : "Resume"}
                className={`rounded-lg p-1 ${r.enabled ? "text-emerald-300 hover:bg-white/10" : "text-gray-500 hover:bg-white/10"}`}
              >
                <Power className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(r.id)}
                title="Delete"
                className="rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
