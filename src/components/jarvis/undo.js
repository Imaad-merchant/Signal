import { base44 } from "@/api/base44Client";

// Map a Firestore collection name (as stored in AgentAction.target) back to the
// entity handler that can delete it. Keep in sync with applyActions in Jarvis.jsx.
const COLLECTION_TO_ENTITY = {
  commitments: "Commitment",
  memory: "Memory",
  insights: "Insight",
  pages: "Page",
  grades: "Grade",
};

// Reverse a single logged action: delete the thing it created, then mark the log
// undone (kept for audit rather than deleted). AgentAction.target looks like
// "commitments/<id>". Returns { ok } or { ok:false, error }.
export async function reverseAgentAction(rec) {
  if (!rec || rec.undone) return { ok: false, error: "Already undone" };
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
