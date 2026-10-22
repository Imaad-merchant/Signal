import { base44 } from "@/api/base44Client";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const unwrap = (r) => (r && r.data) || r || {};

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Opened from the Home Screen (installed), not a browser tab. iPhone only allows
// Web Push for installed web apps.
export function isInstalled() {
  if (typeof window === "undefined") return false;
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

// Server side: are the push keys set, and how many of this user's devices are on?
export async function serverPushStatus() {
  try {
    return unwrap(await base44.functions.invoke("donna", { route: "push-status" }));
  } catch {
    return { ready: false, publicKey: null, devices: 0, error: "Couldn't reach the server." };
  }
}

// This device: permission + whether it currently holds a push subscription.
export async function devicePushState() {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    subscribed = !!(reg && (await reg.pushManager.getSubscription()));
  } catch { /* ignore */ }
  return { supported: true, permission: Notification.permission, subscribed };
}

// Ask for permission, subscribe, and hand the subscription to the server.
// Must be called from a tap (iOS only prompts inside a user gesture).
// Returns { ok, reason }.
export async function enablePush() {
  if (!pushSupported()) {
    return { ok: false, reason: isIOS() && !isInstalled()
      ? "On iPhone, add Signal to your Home Screen and open it from there first."
      : "This browser can't do notifications." };
  }
  try {
    // Prompt first, before any network wait, so the request stays inside the tap.
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "Notifications were blocked — allow them for Signal in your phone's Settings." };
    let vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapid) vapid = (await serverPushStatus()).publicKey;
    if (!vapid) return { ok: false, reason: "Push keys aren't set on the server yet." };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }
    await base44.functions.invoke("donna", { route: "push-subscribe", subscription: sub.toJSON() });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "Couldn't turn on notifications." };
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await base44.functions.invoke("donna", { route: "push-unsubscribe", endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "Couldn't turn off notifications." };
  }
}

export async function sendTestPush() {
  try {
    const d = unwrap(await base44.functions.invoke("donna", { route: "push-test" }));
    if (d.sent > 0) return { ok: true, sent: d.sent };
    return { ok: false, reason: d.error || "Nothing was sent." };
  } catch (err) {
    return { ok: false, reason: /\b503\b/.test(String(err?.message)) ? "Push keys aren't set on the server yet." : "Couldn't send the test." };
  }
}
