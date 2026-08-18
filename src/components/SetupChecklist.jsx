import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, Sparkles, Mic, X, Rocket } from "lucide-react";

// A light, dismissible first-run helper surfacing the buried setup actions
// (connect a bank, connect Google, try voice). Hidden forever once dismissed.
const KEY = "signal_setup_dismissed";

export default function SetupChecklist() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  if (hidden) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); };

  const items = [
    { to: "/Money", icon: Landmark, title: "Connect a bank", sub: "See net worth, spending & subscriptions" },
    { to: "/Donna", icon: Sparkles, title: "Connect Google", sub: "Calendar sync + read your inbox by voice" },
    { to: "/Donna", icon: Mic, title: "Try Donna", sub: "Tap the orb and just talk" },
  ];

  return (
    <div className="relative mb-4 rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-violet-500/10 p-4">
      <button onClick={dismiss} aria-label="Dismiss setup" className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200">
        <X className="h-4 w-4" />
      </button>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-100">
        <Rocket className="h-4 w-4 text-blue-300" /> Get set up
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {items.map(({ to, icon: Icon, title, sub }) => (
          <Link key={title} to={to} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-blue-400/40">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-gray-100">{title}</span>
              <span className="block text-[11px] text-gray-500">{sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
