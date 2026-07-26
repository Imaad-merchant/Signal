// Obsidian write-back: pulls notes Donna categorised (SaaS Idea / Marketing /
// Research / Task / Note) and writes them as markdown into the vault, sorted into
// folders, then tells the server they're written. Runs on your Mac.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const BUCKET_FOLDER = {
  "SaaS Idea": "Ideas",
  "Marketing Tactic": "Marketing",
  "Research": "Research",
  "Task": "Tasks",
  "Note": "Notes",
};

function expandHome(p) { return p && p.startsWith("~") ? join(homedir(), p.slice(1)) : p; }
function slug(s) {
  return String(s || "note").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "note";
}

export async function processOutbox({ apiUrl, deviceToken, vaultPath }) {
  if (!vaultPath) return 0;
  const root = expandHome(vaultPath);
  let items;
  try {
    const r = await fetch(`${apiUrl}/api/ingest?job=outbox`, { headers: { Authorization: `Bearer ${deviceToken}` } });
    if (!r.ok) return 0;
    ({ items } = await r.json());
  } catch { return 0; }
  if (!items || !items.length) return 0;

  const done = [];
  for (const it of items) {
    try {
      const folder = join(root, BUCKET_FOLDER[it.bucket] || "Notes");
      await mkdir(folder, { recursive: true });
      const file = join(folder, `${slug(it.title)}-${String(it.id).slice(0, 6)}.md`);
      const body = `# ${it.title}\n\n> ${it.bucket} · saved by Donna\n\n${it.content || ""}\n`;
      await writeFile(file, body, "utf8");
      done.push(it.id);
    } catch { /* skip a file that won't write */ }
  }
  if (done.length) {
    try {
      await fetch(`${apiUrl}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${deviceToken}` },
        body: JSON.stringify({ outbox_done: done }),
      });
    } catch { /* ignore */ }
  }
  return done.length;
}
