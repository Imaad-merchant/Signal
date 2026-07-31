// The Library — everything Donna (and Chat) has ever written down, in one tree.
//
// Two top-level folders, mirroring how you actually think about this stuff:
//   Logs & Notes — logs you dictate, thoughts you capture, docs you import,
//                  and the memories Donna keeps about you.
//   Chats        — saved conversations, so a chat isn't lost when you reload.
//
// Everything is backed by collections that already exist (pages / notes /
// memory), so this adds no Firestore rules and no new server surface. A chat
// session is just a Page with category "Chat" — same collection, same rules.
import { base44 } from "@/api/base44Client";
import { LOG_CATEGORY } from "./logs";

export const CHAT_CATEGORY = "Chat";

// A uniform shape so the sidebar and the editor don't care where a doc came from.
// `kind` decides which entity we write back to; `editable` gates the editor.
function toDoc({ id, title, content, kind, editable, updated, subtitle }) {
  return {
    key: `${kind}:${id}`,
    id,
    kind,
    title: (title || "").trim() || "Untitled",
    content: content || "",
    editable: !!editable,
    updated: updated || "",
    subtitle: subtitle || "",
  };
}

const byNewest = (a, b) => String(b.updated || "").localeCompare(String(a.updated || ""));

// Memories are free-form across the app — take whichever text field is present.
function memoryText(m) {
  return m.content || m.text || m.summary || m.note || m.value || "";
}

// Pull every source in parallel; a failing source degrades to empty rather than
// taking the whole sidebar down with it.
export async function loadLibrary() {
  const [pages, notes, memories] = await Promise.all([
    base44.entities.Page.list("-updated_date", 500).catch(() => []),
    base44.entities.Note.list("-updated_date", 300).catch(() => []),
    base44.entities.Memory.list("-created_date", 200).catch(() => []),
  ]);

  const safe = (v) => (Array.isArray(v) ? v : []);

  const logs = [];
  const thoughts = [];
  const chats = [];

  for (const p of safe(pages)) {
    // Whiteboards live in the docs workspace but aren't readable prose — skip them.
    if (p.type && p.type !== "document") continue;
    const doc = toDoc({
      id: p.id,
      title: p.title,
      content: p.content,
      kind: "page",
      editable: true,
      updated: p.updated_date || p.created_date,
    });
    if (p.category === CHAT_CATEGORY) chats.push(doc);
    else if (p.category === LOG_CATEGORY) logs.push(doc);
    else thoughts.push(doc);
  }

  const imported = safe(notes).map((n) =>
    toDoc({
      id: n.id,
      title: n.title,
      content: n.content,
      kind: "note",
      editable: true,
      updated: n.updated_date || n.created_date,
      subtitle: n.folder || "",
    })
  );

  // Memories are Donna's own record of you — readable here, but edited through
  // conversation rather than typed over, so they stay read-only.
  const mems = safe(memories).map((m) =>
    toDoc({
      id: m.id,
      title: m.title || m.key || (memoryText(m).slice(0, 60) || "Memory"),
      content: memoryText(m),
      kind: "memory",
      editable: false,
      updated: m.updated_date || m.created_date,
    })
  );

  [logs, thoughts, chats, imported, mems].forEach((a) => a.sort(byNewest));

  return {
    folders: [
      {
        id: "logs",
        label: "Logs & Notes",
        groups: [
          { id: "logs-logs", label: "Logs", docs: logs },
          { id: "logs-thoughts", label: "Thoughts & Notes", docs: thoughts },
          { id: "logs-imported", label: "Imported", docs: imported },
          { id: "logs-memories", label: "Memories", docs: mems },
        ],
      },
      {
        id: "chats",
        label: "Chats",
        groups: [{ id: "chats-all", label: "Saved chats", docs: chats }],
      },
    ],
    counts: {
      logs: logs.length + thoughts.length + imported.length + mems.length,
      chats: chats.length,
    },
  };
}

// Write an edited document back to whichever collection it came from.
export async function saveDoc(doc, { title, content }) {
  const patch = {};
  if (typeof title === "string") patch.title = title;
  if (typeof content === "string") patch.content = content;
  if (doc.kind === "page") return base44.entities.Page.update(doc.id, patch);
  if (doc.kind === "note") return base44.entities.Note.update(doc.id, patch);
  throw new Error("This document is read-only.");
}

// ---- chat sessions ----------------------------------------------------------

// Render a transcript as readable markdown so a saved chat is a real document
// you can reopen, edit and search — not an opaque blob.
export function transcriptToMarkdown(turns) {
  return (turns || [])
    .map((t) => `**${t.who === "you" ? "You" : "Donna"}:** ${t.text}`)
    .join("\n\n");
}

function titleFromTurns(turns) {
  const first = (turns || []).find((t) => t.who === "you" && (t.text || "").trim());
  const raw = (first ? first.text : "").trim().replace(/\s+/g, " ");
  if (!raw) return "Chat";
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

// Persist a conversation. Pass the id returned last time to keep updating the
// same document instead of littering the folder with one Page per message.
export async function saveChatSession(turns, existingId) {
  if (!turns || turns.length === 0) return null;
  const content = transcriptToMarkdown(turns);
  if (existingId) {
    await base44.entities.Page.update(existingId, { content }).catch(() => null);
    return existingId;
  }
  const page = await base44.entities.Page.create({
    title: titleFromTurns(turns),
    type: "document",
    category: CHAT_CATEGORY,
    content,
    parent_id: null,
    section: "private",
    status: "not_started",
  }).catch(() => null);
  return page ? page.id : null;
}
