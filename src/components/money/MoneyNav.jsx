// View switcher for the Money section — the six Rocket Money top-level views.
// Horizontal scroll strip on mobile, wraps to a row on wider screens.
import React from "react";
import { LayoutGrid, Repeat, PieChart, Table2, Landmark, Receipt } from "lucide-react";

export const VIEWS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "recurring", label: "Recurring", icon: Repeat },
  { key: "spending", label: "Spending", icon: PieChart },
  { key: "budgets", label: "Budgets", icon: Table2 },
  { key: "networth", label: "Net Worth", icon: Landmark },
  { key: "transactions", label: "Transactions", icon: Receipt },
];

export const isView = (v) => VIEWS.some((x) => x.key === v);

export default function MoneyNav({ view, onChange }) {
  return (
    <nav className="-mx-4 mb-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <button
              key={v.key}
              onClick={() => onChange(v.key)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                active
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200"
              }`}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
