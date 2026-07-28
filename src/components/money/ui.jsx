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
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-[#16191d]" style={{ background: bg }}>
      {initials(name)}
    </div>
  );
}

export function Card({ title, children, right = null }) {
  return (
    <section className="mt-4 rounded-2xl border border-[#e6e8ec] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#16191d]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// Small SVG progress ring — Rocket Money puts one of these on every budget row.
export function Ring({ pct = 0, size = 18, stroke = 3, color = "#7b8ff7", over = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6e8ec" strokeWidth={stroke} />
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
      <button onClick={() => shift(-1)} className="inline-flex items-center gap-1 rounded-lg border border-[#dcdfe4] px-2 py-1 text-[11px] text-[#454b54] hover:border-[#d81b48]/45">
        <ChevronLeft className="h-3 w-3" /> {label(prevValue)}
      </button>
      <button onClick={() => canGoNext && shift(1)} disabled={!canGoNext} className="inline-flex items-center gap-1 rounded-lg border border-[#dcdfe4] px-2 py-1 text-[11px] text-[#454b54] hover:border-[#d81b48]/45 disabled:opacity-35 disabled:hover:border-[#dcdfe4]">
        {label(nextValue)} <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// Labelled amount row used in the summary rails (Assets / Debts / Net Worth).
export function StatRow({ icon: Icon = null, label, sub = null, value, tone = "default" }) {
  const tones = { default: "text-[#16191d]", good: "text-[#0f7b53]", bad: "text-[#c01530]", muted: "text-[#6b727e]" };
  return (
    <div className="flex items-center gap-2.5 py-2">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-[#8b929c]" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-[#454b54]">{label}</span>
        {sub && <span className="block truncate text-[10px] text-[#8b929c]">{sub}</span>}
      </span>
      <span className={`shrink-0 text-sm font-medium ${tones[tone] || tones.default}`}>
        {typeof value === "number" ? fmtMoney(value) : value}
      </span>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="text-[11px] text-[#8b929c]">{children}</p>;
}
