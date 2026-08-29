import { base44 } from "@/api/base44Client";

// Map a Firestore collection name (as stored in AgentAction.target) back to the
// entity handler that can delete it. Keep in sync with applyActions in Jarvis.jsx.
const COLLECTION_TO_ENTITY = {
  commitments: "Commitment",
  memory: "Memory",
  insights: "Insight",
  pages: "Page",
  grades: "Grade",
  tasks: "Task",
};

// Reverse a single logged action: delete the thing it created, then mark the log
// undone (kept for audit rather than deleted). AgentAction.target looks like
// "commitments/<id>". Returns { ok } or { ok:false, error }.
// Re-create a Task from a snapshot we captured before deleting it, and re-push it
// to Google Calendar if it had a date. Used to undo a deletion.
async function restoreTaskFromSnapshot(s) {
  if (!s) return { ok: false, error: "Nothing to restore" };
  const created = await base44.entities.Task.create({
    title: s.title || "(restored)",
    category: s.category || null,
    status: s.status || "not_started",
    ...(s.due_date ? { due_date: s.due_date } : {}),
    ...(s.notes ? { notes: s.notes } : {}),
  });
  if (s.due_date) {
    // Re-add to Google Calendar so the event comes back on the calendar too.
    try {
      const r = await base44.functions.invoke("donna", { route: "gcal-push", title: s.title, date: s.due_date, gcalId: null });
      const gid = (r && r.data ? r.data : r || {}).gcalId;
      if (gid && created?.id) await base44.entities.Task.update(created.id, { gcal_id: gid }).catch(() => {});
    } catch { /* the task is back either way; calendar re-push is best-effort */ }
  }
  return { ok: true, recreatedId: created?.id };
}

export async function reverseAgentAction(rec) {
  if (!rec || rec.undone) return { ok: false, error: "Already undone" };

  // Deletion undo: bring the deleted item back from its snapshot (in-memory record
  // pushed by applyActions, or an agent_actions doc whose payload carries it).
  if (rec.kind === "delete" && rec.snapshot) {
    try { return await restoreTaskFromSnapshot(rec.snapshot); }
    catch (err) { return { ok: false, error: err?.message || "Restore failed" }; }
  }
  if (rec.action_type === "remove" && rec.payload && rec.payload.snapshot) {
    try {
      const out = await restoreTaskFromSnapshot(rec.payload.snapshot);
      await base44.entities.AgentAction.update(rec.id, { undone: true, undone_at: new Date().toISOString() }).catch(() => {});
      return out;
    } catch (err) { return { ok: false, error: err?.message || "Restore failed" }; }
  }

  // Log-entry undo: restore the document's previous content (or delete a log this
  // entry just created), rather than deleting the whole log.
  if (rec.kind === "log") {
    try {
      if (rec.created) await base44.entities.Page.delete(rec.pageId);
      else await base44.entities.Page.update(rec.pageId, { content: rec.prevContent || "" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || "Undo failed" };
    }
  }

  const deadline = rec.undo_deadline ? new Date(rec.undo_deadline).getTime() : Infinity;
  if (Number.isFinite(deadline) && deadline < Date.now()) {
    return { ok: false, error: "Undo window has passed" };
  }

  const target = typeof rec.target === "string" ? rec.target : "";
  const slash = target.indexOf("/");
  const collection = slash > -1 ? target.slice(0, slash) : "";
  const id = slash > -1 ? target.slice(slash + 1) : "";
  const entityName = COLLECTION_TO_ENTITY[collection];

  try {
    // Delete the created entity when we can resolve it; if we can't, still mark the
    // log undone so it stops offering an undo it can't perform.
    if (entityName && id && base44.entities[entityName]) {
      await base44.entities[entityName].delete(id);
    }
    await base44.entities.AgentAction.update(rec.id, {
      undone: true,
      undone_at: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "Undo failed" };
  }
}

// Reverse several actions; returns the count successfully undone.
export async function reverseMany(recs) {
  let n = 0;
  for (const rec of recs || []) {
    const { ok } = await reverseAgentAction(rec);
    if (ok) n++;
  }
  return n;
}
