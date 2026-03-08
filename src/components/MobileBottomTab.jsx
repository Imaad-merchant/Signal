import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CalendarDays, ListTodo, BarChart2, Settings } from "lucide-react";

const TABS = [
  { label: "Calendar",  icon: CalendarDays, page: "Dashboard" },
  { label: "Tasks",     icon: ListTodo,     page: "Tasks" },
  { label: "Analytics", icon: BarChart2,    page: "Analytics" },
  { label: "Settings",  icon: Settings,     page: "Settings" },
];

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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden bg-[#1e1f20] border-t border-white/10"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(({ label, icon: Icon, page }) => {
        const active = currentPageName === page;
        return (
          <button
            key={page}
            onClick={() => handleTabPress(page)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              active ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}