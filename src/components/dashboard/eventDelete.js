import { base44 } from "@/api/base44Client";

// Deleting calendar events, recurrence-aware. Recurring events sync into the app
// as separate dated tasks that all share the SAME title, so "the series" = every
// dated task with a matching title. We only offer the all-vs-one choice when more
// than one such event exists.

const normTitle = (t) => (t?.title || "").trim().toLowerCase();

// Every dated event that shares this event's title (its recurring series),
// including the event itself. Returns [task] when nothing else matches.
export async function findEventSeries(task) {
  const key = normTitle(task);
  if (!key) return [task];
  const all = await base44.entities.Task.list("-created_date", 500).catch(() => []);
  const series = (Array.isArray(all) ? all : []).filter(
    (t) => t && t.due_date && normTitle(t) === key,
  );
  // Guarantee the target is present even if the list was stale.
  return series.some((t) => t.id === task.id) ? series : [task, ...series];
}

// Delete one event: snapshot it first (so the "Deleted by Donna" panel / Undo can
// restore it), remove the task, then remove its Google Calendar event.
async function deleteOneEvent(task) {
  const snapshot = {
    title: task.title, category: task.category || null, status: task.status || "not_started",
    due_date: task.due_date || null, gcal_id: task.gcal_id || null, notes: task.notes || null,
  };
  try {
    await base44.entities.AgentAction.create({
      action_type: "remove", target: "tasks/" + task.id, payload: { snapshot },
      executed_at: new Date().toISOString(),
      undo_deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
  } catch { /* still delete even if the restore-log write fails */ }
  await base44.entities.Task.delete(task.id);
  if (task.gcal_id) {
    try { await base44.functions.invoke("donna", { route: "gcal-delete", gcalId: task.gcal_id }); }
    catch { /* task is gone from the app regardless */ }
  }
}

// Delete a list of events (one, or the whole series).
export async function deleteEvents(tasks) {
  for (const t of tasks || []) await deleteOneEvent(t);
}
