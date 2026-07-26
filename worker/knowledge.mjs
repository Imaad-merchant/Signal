// Local knowledge indexer — reads your plain-text notes (Obsidian vault, folders)
// and returns them so the worker can push them to Donna's `notes` store, which she
// then searches. Read-only; only text files; recent files by default so the sync
// stays small. Configure via the `knowledge` block in the worker config.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";

const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".mdx"]);

function expandHome(p) {
  if (!p) return p;
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

async function walk(dir, out, opts, depth = 0) {
  if (out.length >= opts.maxFiles || depth > opts.maxDepth) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;            // skip dotfiles/.obsidian etc.
    if (out.length >= opts.maxFiles) return;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, out, opts, depth + 1);
    } else if (TEXT_EXT.has(extname(e.name).toLowerCase())) {
      out.push(full);
    }
  }
}

// Returns [{ path, title, folder, modified, content }] for recent text files.
export async function indexKnowledge(cfg = {}) {
  if (!cfg.enabled) return [];
  const opts = {
    maxFiles: cfg.maxFiles ?? 400,
    maxDepth: cfg.maxDepth ?? 6,
    maxChars: cfg.maxChars ?? 4000,
    sinceDays: cfg.sinceDays ?? 45,
  };
  const roots = (cfg.paths || []).map(expandHome).filter(Boolean);
  const cutoff = Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000;

  const files = [];
  for (const r of roots) await walk(r, files, opts);

  const notes = [];
  for (const f of files) {
    try {
      const st = await stat(f);
      if (st.mtimeMs && st.mtimeMs < cutoff) continue; // recent files only
      const raw = await readFile(f, "utf8");
      const rootMatch = roots.find((r) => f.startsWith(r));
      const rel = rootMatch ? f.slice(rootMatch.length).replace(/^[/\\]/, "") : basename(f);
      notes.push({
        path: f,
        title: basename(f).replace(/\.(md|markdown|txt|mdx)$/i, ""),
        folder: rel.split(/[/\\]/).slice(0, -1).join("/") || "",
        modified: st.mtimeMs ? new Date(st.mtimeMs).toISOString() : null,
        content: String(raw).slice(0, opts.maxChars),
      });
    } catch { /* skip unreadable file */ }
  }
  return notes;
}
