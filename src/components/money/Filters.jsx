// The transactions filter bar — Rocket Money's "All dates / All categories /
// All accounts / All amounts" row, plus search and sort.
import React from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { CATEGORIES } from "@/components/money/money";

export const DATE_RANGES = [
  { key: "all", label: "All dates" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
  { key: "year", label: "This year" },
];

export const AMOUNT_BANDS = [
  { key: "all", label: "All amounts" },
  { key: "spend", label: "Spending only" },
  { key: "income", label: "Income only" },
  { key: "gt50", label: "Over $50" },
  { key: "gt100", label: "Over $100" },
];

export const SORTS = [
  { key: "date", label: "Sort by date" },
  { key: "amount", label: "Sort by amount" },
  { key: "merchant", label: "Sort by name" },
];

export const emptyFilters = { range: "all", category: "all", account: "all", amount: "all", q: "", sort: "date" };

const startOf = (kind) => {
  const d = new Date();
  if (kind === "30d") d.setDate(d.getDate() - 30);
  else if (kind === "90d") d.setDate(d.getDate() - 90);
  else if (kind === "month") d.setDate(1);
  else if (kind === "year") { d.setMonth(0); d.setDate(1); }
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

// Apply the filter set to a transaction list. `categoryOf` resolves the
// effective category so rule-derived categories filter the same as explicit ones.
export function applyFilters(transactions, f, categoryOf) {
  const q = f.q.trim().toLowerCase();
  let out = (transactions || []).filter((t) => {
    if (f.account !== "all" && String(t.account_id || "") !== f.account) return false;
    if (f.category !== "all" && categoryOf(t) !== f.category) return false;

    const amt = Number(t.amount) || 0;
    if (f.amount === "spend" && amt >= 0) return false;
    if (f.amount === "income" && amt <= 0) return false;
    if (f.amount === "gt50" && Math.abs(amt) <= 50) return false;
    if (f.amount === "gt100" && Math.abs(amt) <= 100) return false;

    const date = t.date || "";
    if (f.range === "lastmonth") {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      if (!date.startsWith(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)) return false;
    } else if (f.range !== "all" && date < startOf(f.range)) return false;

    if (q && !`${t.merchant || ""} ${t.note || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  out = out.slice().sort((a, b) => {
    if (f.sort === "amount") return Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0);
    if (f.sort === "merchant") return String(a.merchant || "").localeCompare(String(b.merchant || ""));
    return String(b.date || "").localeCompare(String(a.date || ""));
  });
  return out;
}

const selectCls =
  "rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-gray-300 outline-none focus:border-cyan-400/40";

export default function Filters({ filters, onChange, accounts = [] }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search transactions…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pl-8 pr-2 text-xs text-gray-100 outline-none focus:border-cyan-400/40"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500" />
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })} className={`${selectCls} pl-6`}>
            {SORTS.map((s) => <option key={s.key} value={s.key} className="bg-[#0e1015]">{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
          <select value={filters.range} onChange={(e) => set({ range: e.target.value })} className={selectCls}>
            {DATE_RANGES.map((r) => <option key={r.key} value={r.key} className="bg-[#0e1015]">{r.label}</option>)}
          </select>
          <select value={filters.category} onChange={(e) => set({ category: e.target.value })} className={selectCls}>
            <option value="all" className="bg-[#0e1015]">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c} className="bg-[#0e1015]">{c}</option>)}
          </select>
          <select value={filters.account} onChange={(e) => set({ account: e.target.value })} className={selectCls}>
            <option value="all" className="bg-[#0e1015]">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id} className="bg-[#0e1015]">{a.name}</option>)}
          </select>
          <select value={filters.amount} onChange={(e) => set({ amount: e.target.value })} className={selectCls}>
            {AMOUNT_BANDS.map((b) => <option key={b.key} value={b.key} className="bg-[#0e1015]">{b.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
