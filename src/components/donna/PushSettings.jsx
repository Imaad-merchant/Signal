import React, { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send, AlertTriangle, CheckCircle2, Share } from "lucide-react";
import {
  pushSupported, isIOS, isInstalled, serverPushStatus, devicePushState,
  enablePush, disablePush, sendTestPush,
} from "./push";

// Lock-screen notifications (Web Push) for this device: shows exactly what's
// missing when they can't work, turns them on/off, and sends a test.
export default function PushSettings() {
  const [server, setServer] = useState(null);
  const [device, setDevice] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: true });

  const refresh = useCallback(async () => {
    const [s, d] = await Promise.all([serverPushStatus(), devicePushState()]);
    setServer(s);
    setDevice(d);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const needsInstall = isIOS() && !isInstalled();
  const on = !!device?.subscribed && device?.permission === "granted";

  const turnOn = async () => {
    setBusy("on"); setMsg({ text: "", ok: true });
    const r = await enablePush();
    setMsg(r.ok ? { text: "Notifications are on for this device.", ok: true } : { text: r.reason, ok: false });
    setBusy(""); refresh();
  };
  const turnOff = async () => {
    setBusy("off"); setMsg({ text: "", ok: true });
    const r = await disablePush();
    setMsg(r.ok ? { text: "Notifications are off for this device.", ok: true } : { text: r.reason, ok: false });
    setBusy(""); refresh();
  };
  const test = async () => {
    setBusy("test"); setMsg({ text: "", ok: true });
    const r = await sendTestPush();
    setMsg(r.ok ? { text: "Test sent — lock your phone to see it.", ok: true } : { text: r.reason, ok: false });
    setBusy("");
  };

  // The one blocker to show, in the order you'd have to fix them.
  let blocker = null;
  if (needsInstall) {
    blocker = (
      <>
        On iPhone, notifications only work from the Home Screen app. In Safari tap{" "}
        <Share className="inline h-3.5 w-3.5 -mt-0.5" /> Share → <b>Add to Home Screen</b>, then open Signal from there and come back here.
      </>
    );
  } else if (device && !pushSupported()) {
    blocker = "This browser can't show notifications.";
  } else if (server && !server.ready) {
    blocker = (
      <>
        Push isn&apos;t set up on the server yet. Add <code className="text-gray-300">VAPID_PUBLIC_KEY</code> and{" "}
        <code className="text-gray-300">VAPID_PRIVATE_KEY</code> in Vercel → Settings → Environment Variables, then redeploy.
      </>
    );
  } else if (device?.permission === "denied") {
    blocker = isIOS()
      ? <>Notifications are blocked. Turn them on in iPhone <b>Settings → Notifications → Signal</b>.</>
      : "Notifications are blocked for this site — allow them in your browser's site settings.";
  }

  const loading = !server || !device;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 min-h-[44px] py-1">
        <div>
          <p className="text-sm font-medium text-gray-200">Lock-screen notifications</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Your 6am briefing with what&apos;s due and your 6pm check-in, on this device.
            {server?.devices > 0 && ` On for ${server.devices} device${server.devices === 1 ? "" : "s"}.`}
          </p>
        </div>
        <div className="shrink-0">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          ) : on ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> On
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-gray-400">
              <BellOff className="h-3.5 w-3.5" /> Off
            </span>
          )}
        </div>
      </div>

      {blocker && (
        <p className="flex gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
          <span>{blocker}</span>
        </p>
      )}

      {!loading && (
        <div className="flex flex-wrap gap-2">
          {on ? (
            <button
              type="button"
              onClick={turnOff}
              disabled={!!busy}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/10 px-3.5 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
            >
              {busy === "off" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />} Turn off
            </button>
          ) : (
            <button
              type="button"
              onClick={turnOn}
              disabled={!!busy || needsInstall || (server && !server.ready)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {busy === "on" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Turn on notifications
            </button>
          )}
          <button
            type="button"
            onClick={test}
            disabled={!!busy || !on}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/10 px-3.5 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-40"
          >
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
          </button>
        </div>
      )}

      {msg.text && <p className={`text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
    </div>
  );
}
