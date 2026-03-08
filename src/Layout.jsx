import React, { useEffect, useState } from "react";
import MobileBottomTab from "./components/MobileBottomTab";

export default function Layout({ children, currentPageName }) {
  const [themeColor, setThemeColor] = useState(() => localStorage.getItem("pulse_theme") || "#4285f4");

  useEffect(() => {
    const sync = () => setThemeColor(localStorage.getItem("pulse_theme") || "#4285f4");
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);

  return (
    <div className="min-h-screen bg-[#1e1f20]">
      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #1e1f20; }
        :root { --pulse-theme: ${themeColor}; }
        .safe-area-pb { padding-bottom: calc(env(safe-area-inset-bottom) + 4rem); }
      `}</style>
      <main className={currentPageName === "Dashboard" ? "h-screen overflow-hidden" : "p-4 sm:p-6 lg:p-8 pb-20 md:pb-8"}>
        {children}
      </main>
      <MobileBottomTab currentPageName={currentPageName} />
    </div>
  );
}