import { base44 } from "@/api/base44Client";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Ask for permission, subscribe, and hand the subscription to the server.
// Returns { ok, reason }. Requires VITE_VAPID_PUBLIC_KEY at build time.
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: "This browser can't do notifications." };
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, reason: "Reminders aren't set up on the server yet." };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "Notifications were declined." };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }
    await base44.functions.invoke("jarvis", { route: "push-subscribe", subscription: sub.toJSON() });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "Couldn't enable reminders." };
  }
}
