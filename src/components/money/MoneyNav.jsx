// Rocket Money's left sidebar: brand mark, the six views, and a footer.
// Collapses to a horizontal scroll strip under `md` so the section still works
// on a phone, where Signal's bottom tab bar owns the lower edge.
import React from "react";
import { LayoutGrid, Repeat, PieChart, Table2, Landmark, Receipt, MessageCircle, ExternalLink } from "lucide-react";

export const VIEWS = [
  { key: "overview", label: "Dashboard", icon: LayoutGrid },
  { key: "recurring", label: "Recurring", icon: Repeat },
  { key: "spending", label: "Spending", icon: PieChart },
  { key: "budgets", label: "Budgets", icon: Table2 },
  { key: "networth", label: "Net Worth", icon: Landmark },
  { key: "transactions", label: "Transactions", icon: Receipt },
];

export const isView = (v) => VIEWS.some((x) => x.key === v);
export const viewLabel = (v) => VIEWS.find((x) => x.key === v)?.label || "Money";

export default function MoneyNav({ view, onChange }) {
  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-[208px] shrink-0 flex-col border-r border-[#e6e8ec] bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d81b48] text-[13px] font-bold text-white">S</span>
          <span className="text-[15px] font-bold leading-4 text-[#16191d]">Signal<br /><span className="text-[#d81b48]">Money</span></span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {VIEWS.map((v) => {
            const active = v.key === view;
            return (
              <button
                key={v.key}
                onClick={() => onChange(v.key)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  active ? "bg-[#f2f4f7] font-semibold text-[#d81b48]" : "text-[#454b54] hover:bg-[#f7f8fa]"
                }`}
              >
                <v.icon className={`h-4 w-4 shrink-0 ${active ? "text-[#d81b48]" : "text-[#8b929c]"}`} />
                {v.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-5 py-5 text-[12px] text-[#6b727e]">
          <span className="inline-flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5" /> Suggest a feature</span>
          <span className="inline-flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" /> Chat with us</span>
        </div>
      </aside>

      {/* Mobile strip */}
      <nav className="sticky top-0 z-10 -mx-4 mb-1 overflow-x-auto border-b border-[#e6e8ec] bg-white px-4 py-2 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5">
          {VIEWS.map((v) => {
            const active = v.key === view;
            return (
              <button
                key={v.key}
                onClick={() => onChange(v.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                  active ? "bg-[#f2f4f7] font-semibold text-[#d81b48]" : "text-[#6b727e]"
                }`}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
