// Recently picked colors, kept per picker kind ("text", "highlight", "draw").
// Every committed pick is pushed to the front; duplicates move to the front;
// the list is capped at MAX_RECENT so the oldest pick falls off.
// Persisted in localStorage and broadcast so every open picker stays in sync.
import { useSyncExternalStore } from "react";

export const MAX_RECENT = 4;
const PREFIX = "signal_recent_colors_";
const EVENT = "signal:recent-colors";
const cache = new Map();

function normalize(c) {
  if (typeof c !== "string") return null;
  const s = c.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

function load(kind) {
  if (cache.has(kind)) return cache.get(kind);
  let list = [];
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + kind) || "[]");
    if (Array.isArray(raw)) list = raw.map(normalize).filter(Boolean).slice(0, MAX_RECENT);
  } catch { /* ignore */ }
  cache.set(kind, list);
  return list;
}

export function getRecentColors(kind) {
  return load(kind);
}

export function pushRecentColor(kind, color) {
  const c = normalize(color);
  if (!c) return;
  const next = [c, ...load(kind).filter((x) => x !== c)].slice(0, MAX_RECENT);
  cache.set(kind, next);
  try { localStorage.setItem(PREFIX + kind, JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind } }));
}

function subscribe(kind, cb) {
  const onLocal = (e) => { if (!e.detail || e.detail.kind === kind) cb(); };
  const onStorage = (e) => { if (e.key === PREFIX + kind) { cache.delete(kind); cb(); } };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRecentColors(kind) {
  return useSyncExternalStore(
    (cb) => subscribe(kind, cb),
    () => load(kind),
    () => [],
  );
}
