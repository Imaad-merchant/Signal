// Rocket Money's left sidebar: brand mark, the six views, and a footer.
// Under `md` the rail is hidden and `MoneyTabs` (a horizontal scroll strip under
// the header) takes over, since Signal's bottom tab bar owns the lower edge.
import React, { useEffect, useRef } from "react";
import { LayoutGrid, Repeat, PieChart, Table2, Landmark, Receipt, Target, Gauge, Settings, MessageCircle, ExternalLink } from "lucide-react";

export const VIEWS = [
  { key: "overview", label: "Dashboard", icon: LayoutGrid },
  { key: "recurring", label: "Recurring", icon: Repeat },
  { key: "spending", label: "Spending", icon: PieChart },
  { key: "budgets", label: "Budgets", icon: Table2 },
  { key: "networth", label: "Net Worth", icon: Landmark },
  { key: "transactions", label: "Transactions", icon: Receipt },
  { key: "goals", label: "Goals", icon: Target },
  { key: "credit", label: "Credit Score", icon: Gauge },
];

// Settings sits in the sidebar footer, the way Rocket Money keeps its gear out
// of the main nav list. It is still a real view, so it lives in `isView`.
export const FOOTER_VIEWS = [{ key: "settings", label: "Settings", icon: Settings }];

const ALL_VIEWS = [...VIEWS, ...FOOTER_VIEWS];

export const isView = (v) => ALL_VIEWS.some((x) => x.key === v);
export const viewLabel = (v) => ALL_VIEWS.find((x) => x.key === v)?.label || "Money";

export default function MoneyNav({ view, onChange }) {
  return (
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

      <div className="mt-auto flex flex-col gap-2 px-2 pb-5 pt-5 text-[12px] text-[#6b727e]">
        {FOOTER_VIEWS.map((v) => {
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
        <span className="mt-1 inline-flex items-center gap-2 px-3"><ExternalLink className="h-3.5 w-3.5" /> Suggest a feature</span>
        <span className="inline-flex items-center gap-2 px-3"><MessageCircle className="h-3.5 w-3.5" /> Chat with us</span>
      </div>
    </aside>
  );
}

// Phone view switcher: a sticky, horizontally scrolling strip of pills under the
// header. The active pill is scrolled into view so deep links (?view=credit)
// don't land with the selection hidden off-screen.
export function MoneyTabs({ view, onChange }) {
  const activeRef = useRef(null);
  useEffect(() => {
    try { activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" }); } catch { /* ignore */ }
  }, [view]);
  return (
    <nav
      aria-label="Money views"
      className="shrink-0 overflow-x-auto border-b border-[#e6e8ec] bg-white md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-1.5 px-4 py-2">
        {ALL_VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <button
              key={v.key}
              ref={active ? activeRef : undefined}
              onClick={() => onChange(v.key)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-8 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${
                active ? "border-[#16191d] bg-[#16191d] font-semibold text-white" : "border-[#e6e8ec] bg-white text-[#454b54]"
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
