#!/usr/bin/env node
// Signal local worker — the hybrid, outbound-only bridge.
//
// Runs on YOUR machine (launchd / systemd / pm2) and pushes things the cloud can't
// see into your Signal app over authenticated HTTPS:
//   - local telemetry (host, uptime, memory, load) → a live "this machine" doc
//   - (opt-in) scraped UH grades → the grades the status grid reads
// It only ever makes OUTBOUND requests, so there's no inbound port, no cert, and
// no browser mixed-content problem. Secrets come from an encrypted local config.
import os from "node:os";
import { loadConfig } from "./lib/config.mjs";
import { scrapeGrades } from "./uh-grades.mjs";
import { indexKnowledge } from "./knowledge.mjs";
import { processOutbox } from "./outbox.mjs";
import { processCommands } from "./commands.mjs";
import { sampleContext } from "./context.mjs";
import { processAudio } from "./audio.mjs";

const cfg = loadConfig();
const API = (cfg.apiUrl || "").replace(/\/$/, "");
if (!API || !cfg.deviceToken) {
  console.error("Config needs apiUrl and deviceToken. See config.example.json.");
  process.exit(1);
}

const INTERVAL_MS = Math.max(60_000, (cfg.intervalSeconds || 300) * 1000);

function collectTelemetry() {
  const mem = { total: os.totalmem(), free: os.freemem() };
  return {
    host: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    uptime_s: Math.round(os.uptime()),
    load_1m: os.loadavg()[0],
    mem_used_pct: Math.round((1 - mem.free / mem.total) * 100),
    cpus: os.cpus().length,
    sampled_at: new Date().toISOString(),
  };
}

async function post(payload) {
  const res = await fetch(`${API}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.deviceToken}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ingest ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

// Optionally nudge the Google poller more often than the daily Vercel cron.
// (Same /api/ingest endpoint; the CRON_SECRET bearer selects the poll path.)
async function kickGoogleCron() {
  if (!cfg.cronSecret) return;
  try {
    await fetch(`${API}/api/ingest`, { headers: { Authorization: `Bearer ${cfg.cronSecret}` } });
  } catch (err) {
    console.warn("[worker] google cron kick failed:", err.message);
  }
}

async function tick() {
  try {
    const payload = { telemetry: collectTelemetry() };

    // Local knowledge index (Obsidian vault / folders) FIRST — so the vault stays
    // fresh promptly and isn't blocked behind the (slow, Playwright) grades scrape.
    if (cfg.knowledge?.enabled) {
      const everyMs = (cfg.knowledge.intervalMinutes ?? 20) * 60000;
      if (Date.now() - lastIndexAt >= everyMs) {
        try {
          const notes = await indexKnowledge(cfg.knowledge);
          if (notes.length) payload.notes = notes;
          lastIndexAt = Date.now();
          console.log(`[worker] indexed ${notes.length} note(s)`);
        } catch (err) {
          console.warn("[worker] knowledge index failed:", err.message);
        }
      }
    }

    // Opt-in grades scrape (local-only; disabled unless cfg.uh.enabled).
    try {
      const grades = await scrapeGrades(cfg.uh);
      if (grades.length) payload.grades = grades;
    } catch (err) {
      console.warn("[worker] grades step failed:", err.message);
    }

    // Active-app context → time-blindness notifications (macOS).
    if (cfg.context?.enabled) {
      try {
        const active = await sampleContext(cfg.context);
        if (active?.app) payload.active = { app: active.app, minutes: active.minutes };
      } catch (err) { console.warn("[worker] context failed:", err.message); }
    }

    // Audio brain-dumps → Whisper → captures (server categorises + files them).
    if (cfg.audio?.enabled) {
      try {
        const caps = await processAudio({ ...cfg.audio, openaiKey: cfg.openaiKey });
        if (caps.length) payload.capture = caps;
      } catch (err) { console.warn("[worker] audio failed:", err.message); }
    }

    const out = await post(payload);
    console.log(`[worker] pushed @ ${new Date().toLocaleTimeString()} → ${out}`);
    await kickGoogleCron();

    // Write Donna's categorised notes into the Obsidian vault.
    if (cfg.knowledge?.vaultPath) {
      try {
        const n = await processOutbox({ apiUrl: API, deviceToken: cfg.deviceToken, vaultPath: cfg.knowledge.vaultPath });
        if (n) console.log(`[worker] wrote ${n} note(s) to the vault`);
      } catch (err) { console.warn("[worker] outbox failed:", err.message); }
    }

    // Run any voice-queued commands (OFF unless orchestration.enabled).
    if (cfg.orchestration?.enabled) {
      try {
        const n = await processCommands({ apiUrl: API, deviceToken: cfg.deviceToken, cwd: cfg.orchestration.cwd, timeoutMs: (cfg.orchestration.timeoutSeconds || 120) * 1000 });
        if (n) console.log(`[worker] ran ${n} command(s)`);
      } catch (err) { console.warn("[worker] commands failed:", err.message); }
    }
  } catch (err) {
    console.error("[worker] tick error:", err.message);
  }
}

let lastIndexAt = 0;
console.log(`[worker] starting — posting to ${API} every ${INTERVAL_MS / 1000}s`);
tick();
const timer = setInterval(tick, INTERVAL_MS);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { clearInterval(timer); console.log("\n[worker] stopped."); process.exit(0); });
}
