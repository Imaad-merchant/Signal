// Shared helpers for the Jarvis daily check-in loop.
// All time logic is anchored to America/Chicago per the product spec.

const LS_KEY = "pulse_jarvis_last_checkin";

// Compute the Chicago hour, slot ("morning" | "evening") and date key (YYYY-MM-DD).
export function getChicagoParts(date = new Date()) {
  let hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
  // Some runtimes emit "24" for midnight — normalize to 0.
  if (!Number.isFinite(hour) || hour === 24) hour = 0;

  // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const slot = hour < 15 ? "morning" : "evening";
  return { hour, slot, dateKey };
}

// A stable identifier for a single slot on a single day, e.g. "2026-07-25_morning".
export function slotKeyOf(dateKey, slot) {
  return `${dateKey}_${slot}`;
}

// Shift a YYYY-MM-DD key by whole days (UTC math; DST-agnostic, fine for keying).
function shiftDateKey(key, deltaDays) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// Daily-briefing slots, anchored to the clock: the MORNING run-through is due from
// 6am, the EVENING run-through from 6pm (America/Chicago). Times before 6am belong
// to the previous night's evening slot (so it isn't re-shown, and the 6pm slot is
// still fresh later that day).
export function getBriefingParts(date = new Date()) {
  const { hour, dateKey } = getChicagoParts(date);
  if (hour >= 6 && hour < 18) return { hour, slot: "morning", slotDate: dateKey };
  const slotDate = hour < 6 ? shiftDateKey(dateKey, -1) : dateKey;
  return { hour, slot: "evening", slotDate };
}

export function briefingSlotKey(parts) {
  return `${parts.slotDate}_${parts.slot}`;
}

// localStorage read/write are wrapped so a disabled/quota'd store never throws.
export function getStoredCheckinKey() {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export function setStoredCheckinKey(value) {
  try {
    localStorage.setItem(LS_KEY, value);
  } catch {
    /* ignore — non-fatal */
  }
}

// The Firebase shim wraps function responses as { data: <payload> }. Unwrap defensively
// so callers work whether they receive the wrapped or raw shape.
export function unwrap(res) {
  if (res && typeof res === "object" && "data" in res) return res.data ?? {};
  return res ?? {};
}
