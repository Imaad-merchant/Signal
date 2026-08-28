import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { NAV_ITEMS as TABS } from "./navItems";

export default function MobileBottomTab({ currentPageName }) {
  const navigate = useNavigate();

  const handleTabPress = (page) => {
    if (currentPageName === page) {
      // Scroll the page's main scroll container to top
      const scrollable = document.querySelector("main [data-scroll-container], main .overflow-y-auto, main .overflow-auto");
      if (scrollable) scrollable.scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
      // Dispatch event so pages can reset their own state
      window.dispatchEvent(new CustomEvent("tab-reset", { detail: { page } }));
    } else {
      navigate(createPageUrl(page));
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      <nav className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border border-white/[0.08] bg-[#1c1d1e]/85 px-1.5 py-1 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {TABS.map(({ label, icon: Icon, page }) => {
          const active = currentPageName === page;
          return (
            <button
              key={page}
              onClick={() => handleTabPress(page)}
              title={label}
              className={`group relative flex flex-col items-center justify-center gap-[3px] rounded-xl px-3.5 py-1.5 transition-colors ${
                active ? "text-blue-300" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {active && <span className="absolute inset-0 rounded-xl bg-blue-500/[0.14]" />}
              <Icon className="relative h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
              <span className={`relative text-[9px] font-medium tracking-tight ${active ? "opacity-100" : "opacity-80"}`}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}