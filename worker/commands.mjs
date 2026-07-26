// Agentic orchestration executor (OFF unless orchestration.enabled). Pulls the
// commands Donna queued, runs them in a shell on your Mac, and pushes the output
// back. FULL ACCESS by your choice — so it only runs when you enable it, and every
// command is logged to the console. You own the risk of what you queue by voice.
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";

const pexec = promisify(exec);
function expandHome(p) { return p && p.startsWith("~") ? join(homedir(), p.slice(1)) : p; }

export async function processCommands({ apiUrl, deviceToken, cwd, timeoutMs }) {
  let items;
  try {
    const r = await fetch(`${apiUrl}/api/ingest?job=commands`, { headers: { Authorization: `Bearer ${deviceToken}` } });
    if (!r.ok) return 0;
    ({ items } = await r.json());
  } catch { return 0; }
  if (!items || !items.length) return 0;

  const workdir = expandHome(cwd) || homedir();
  const results = [];
  for (const it of items) {
    console.log(`[worker] ⚙️  running command: ${it.text}`);
    try {
      const { stdout, stderr } = await pexec(it.text, {
        cwd: workdir, timeout: timeoutMs || 120000, maxBuffer: 4 * 1024 * 1024, shell: "/bin/bash",
      });
      results.push({ id: it.id, ok: true, output: (stdout || "") + (stderr ? `\n[stderr]\n${stderr}` : "") });
    } catch (e) {
      results.push({ id: it.id, ok: false, output: `${e.stdout || ""}\n${e.stderr || e.message || "failed"}` });
    }
  }
  if (results.length) {
    try {
      await fetch(`${apiUrl}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${deviceToken}` },
        body: JSON.stringify({ command_results: results }),
      });
    } catch { /* ignore */ }
  }
  return results.length;
}
