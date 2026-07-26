// Audio brain-dump parser: watches a folder (e.g. iCloud voice memos) for new audio,
// transcribes it with OpenAI Whisper, and returns the text as "captures" — the worker
// posts them, the server categorises (SaaS / Marketing / Research…) and queues them
// for the vault. Needs an OpenAI key (config.openaiKey). Off unless audio.enabled.
import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";

const AUDIO_EXT = new Set([".m4a", ".mp3", ".wav", ".mp4", ".mpeg", ".mpga", ".webm"]);
const seen = new Set();
function expandHome(p) { return p && p.startsWith("~") ? join(homedir(), p.slice(1)) : p; }

async function transcribe(file, openaiKey) {
  const buf = await readFile(file);
  const form = new FormData();
  form.append("file", new Blob([buf]), basename(file));
  form.append("model", "whisper-1");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!r.ok) throw new Error(`whisper ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  return d.text || "";
}

export async function processAudio(cfg) {
  if (!cfg?.enabled || !cfg.openaiKey) return [];
  const roots = (cfg.paths || []).map(expandHome).filter(Boolean);
  const cutoff = Date.now() - (cfg.sinceHours ?? 48) * 3600000;
  const captures = [];
  for (const root of roots) {
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !AUDIO_EXT.has(extname(e.name).toLowerCase())) continue;
      const full = join(root, e.name);
      if (seen.has(full)) continue;
      try {
        const st = await stat(full);
        if (st.mtimeMs < cutoff) { seen.add(full); continue; }
        const text = await transcribe(full, cfg.openaiKey);
        seen.add(full);
        if (text.trim()) captures.push({ text });
      } catch (err) {
        console.warn("[worker] audio transcribe failed:", err.message);
        seen.add(full);
      }
    }
  }
  return captures;
}
