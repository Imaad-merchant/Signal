import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { NAV_ITEMS } from "./navItems";

// Left icon rail for desktop (md+). The mobile bottom tab bar is md:hidden, so
// without this Money/Donna/etc. were unreachable on a computer.
export default function DesktopNav({ currentPageName }) {
  const navigate = useNavigate();
  return (
    <nav
      className="fixed left-0 top-0 bottom-0 z-40 hidden w-16 flex-col items-center gap-1 border-r border-white/10 bg-[#1e1f20] py-4 md:flex"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
      aria-label="Primary"
    >
      {NAV_ITEMS.map(({ label, icon: Icon, page }) => {
        const active = currentPageName === page;
        return (
          <button
            key={page}
            type="button"
            onClick={() => navigate(createPageUrl(page))}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex w-12 flex-col items-center gap-0.5 rounded-lg py-2 transition-colors ${
              active ? "bg-white/10 text-blue-400" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[9px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
