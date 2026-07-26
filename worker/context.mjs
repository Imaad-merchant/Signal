// Context sensing (macOS): which app is frontmost and for how long → time-blindness
// nudges as native notifications ("coding two hours, drink water"). Also returns the
// active-app state so the worker can push it (for the cross-pollinator later).
import { exec } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(exec);
let currentApp = null;
let sinceMs = 0;
let notified = new Set();

export async function getActiveApp() {
  try {
    const { stdout } = await pexec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      { timeout: 5000 }
    );
    return stdout.trim();
  } catch { return null; }
}

export async function notify(title, message) {
  try {
    const esc = (s) => String(s).replace(/"/g, '\\"');
    await pexec(`osascript -e 'display notification "${esc(message)}" with title "${esc(title)}"'`, { timeout: 5000 });
  } catch { /* ignore */ }
}

// Sample the active app; fire per-rule notifications; return { app, minutes }.
export async function sampleContext(cfg) {
  const app = await getActiveApp();
  const now = Date.now();
  if (app !== currentApp) { currentApp = app; sinceMs = now; notified = new Set(); }
  const minutes = Math.round((now - sinceMs) / 60000);

  for (const rule of cfg.rules || []) {
    if (rule.app && !(app || "").toLowerCase().includes(String(rule.app).toLowerCase())) continue;
    const every = rule.everyMinutes || 120;
    const bucket = Math.floor(minutes / every);
    const key = `${app}:${bucket}`;
    if (minutes >= every && bucket > 0 && !notified.has(key)) {
      notified.add(key);
      await notify("Donna", rule.message || `You've been in ${app} for ${minutes} minutes.`);
    }
  }
  return { app, minutes };
}
