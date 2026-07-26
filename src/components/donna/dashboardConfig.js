// User customisation of the /cowork status tiles: which are hidden and their
// order. Stored per-device. Both the grid and the customise panel read/write it,
// and a "donna-dash-change" event lets the grid re-render live after a change
// (including changes Donna makes by voice).

const KEY = "donna_dashboard";

// The full set of tiles, in their default order. Keys must match StatusGrid.
export const ALL_TILES = [
  { key: "today", label: "Today" },
  { key: "commitments", label: "Open" },
  { key: "signal", label: "Latest" },
  { key: "grades", label: "Grades" },
  { key: "google", label: "Inbox" },
  { key: "machine", label: "Machine" },
];

export function loadDashCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      hidden: Array.isArray(c.hidden) ? c.hidden : [],
      order: Array.isArray(c.order) ? c.order : [],
    };
  } catch {
    return { hidden: [], order: [] };
  }
}

export function saveDashCfg(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ hidden: cfg.hidden || [], order: cfg.order || [] }));
    window.dispatchEvent(new Event("donna-dash-change"));
  } catch { /* ignore */ }
}

// Apply hidden + order to a tiles array (built fresh each render by StatusGrid).
export function applyDashCfg(tiles, cfg) {
  const hidden = new Set(cfg.hidden || []);
  const order = cfg.order || [];
  const byKey = new Map(tiles.map((t) => [t.key, t]));
  const ordered = [];
  for (const k of order) { if (byKey.has(k)) { ordered.push(byKey.get(k)); byKey.delete(k); } }
  for (const t of tiles) { if (byKey.has(t.key)) ordered.push(t); }
  return ordered.filter((t) => !hidden.has(t.key));
}

// Resolve a spoken label ("grades", "the inbox tile") to a tile key.
export function resolveTileKey(text) {
  const q = (text || "").toLowerCase();
  const hit = ALL_TILES.find((t) => q.includes(t.label.toLowerCase()) || q.includes(t.key));
  if (hit) return hit.key;
  if (/\b(email|inbox|mail)\b/.test(q)) return "google";
  if (/\b(task|todo|to-do)\b/.test(q)) return "today";
  if (/\b(grade|gpa)\b/.test(q)) return "grades";
  if (/\b(machine|computer|worker|host)\b/.test(q)) return "machine";
  return null;
}

export function setTileHidden(key, hidden) {
  const c = loadDashCfg();
  const s = new Set(c.hidden);
  if (hidden) s.add(key); else s.delete(key);
  saveDashCfg({ ...c, hidden: [...s] });
}

// Current visible order (config order first, then any remaining defaults).
export function currentOrder(cfg) {
  const order = (cfg.order || []).filter((k) => ALL_TILES.some((t) => t.key === k));
  for (const t of ALL_TILES) if (!order.includes(t.key)) order.push(t.key);
  return order;
}

export function moveTile(key, dir) {
  const cfg = loadDashCfg();
  const order = currentOrder(cfg);
  const i = order.indexOf(key);
  const j = i + (dir === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  saveDashCfg({ ...cfg, order });
}
