// Shared presentation primitives for the Money section.
// Extracted from Money.jsx so every view (Overview, Spending, Budgets, …) shares
// one card shell, one category palette and one avatar treatment.
import React from "react";
import {
  Repeat, ShoppingBag, Utensils, Car, Home, Film, HeartPulse, Plane, DollarSign, Package,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { initials, avatarColor, fmtMoney } from "@/components/money/money";

export const CAT_META = {
  Income: { c: "#10b981", Icon: DollarSign },
  Groceries: { c: "#22c55e", Icon: ShoppingBag },
  Food: { c: "#f97316", Icon: Utensils },
  Transport: { c: "#38bdf8", Icon: Car },
  Shopping: { c: "#a78bfa", Icon: ShoppingBag },
  "Bills & Utilities": { c: "#f43f5e", Icon: Home },
  Subscriptions: { c: "#8b5cf6", Icon: Repeat },
  Entertainment: { c: "#ec4899", Icon: Film },
  Health: { c: "#14b8a6", Icon: HeartPulse },
  Travel: { c: "#eab308", Icon: Plane },
  Other: { c: "#94a3b8", Icon: Package },
};
export const catMeta = (c) => CAT_META[c] || CAT_META.Other;

export function Avatar({ name, color = null }) {
  const bg = color || avatarColor(name);
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: bg }}>
      {initials(name)}
    </div>
  );
}

export function Card({ title, children, right = null }) {
  return (
    <section className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// Small SVG progress ring — Rocket Money puts one of these on every budget row.
export function Ring({ pct = 0, size = 18, stroke = 3, color = "#22d3ee", over = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={over ? "#fb923c" : color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c}
      />
    </svg>
  );
}

// ← Jun 2026 / Aug 2026 → month pager. `value` is a YYYY-MM string.
export function MonthPager({ value, onChange, canGoNext = true }) {
  const shift = (delta) => {
    const [y, m] = value.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const label = (v) => {
    const [y, m] = v.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "numeric" });
  };
  const nextValue = (() => {
    const [y, m] = value.split("-").map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const prevValue = (() => {
    const [y, m] = value.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => shift(-1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:border-cyan-400/40">
        <ChevronLeft className="h-3 w-3" /> {label(prevValue)}
      </button>
      <button onClick={() => canGoNext && shift(1)} disabled={!canGoNext} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:border-cyan-400/40 disabled:opacity-35 disabled:hover:border-white/10">
        {label(nextValue)} <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// Labelled amount row used in the summary rails (Assets / Debts / Net Worth).
export function StatRow({ icon: Icon = null, label, sub = null, value, tone = "default" }) {
  const tones = { default: "text-gray-200", good: "text-emerald-300", bad: "text-rose-300", muted: "text-gray-400" };
  return (
    <div className="flex items-center gap-2.5 py-2">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-gray-500" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-gray-300">{label}</span>
        {sub && <span className="block truncate text-[10px] text-gray-500">{sub}</span>}
      </span>
      <span className={`shrink-0 text-sm font-medium ${tones[tone] || tones.default}`}>
        {typeof value === "number" ? fmtMoney(value) : value}
      </span>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="text-[11px] text-gray-500">{children}</p>;
}
