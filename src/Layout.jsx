import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
    <div className="min-h-screen bg-[#1e1f20]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background-color: #1e1f20;
          overscroll-behavior: none;
        }
        :root { --pulse-theme: ${themeColor}; }
        .safe-area-pb { padding-bottom: calc(env(safe-area-inset-bottom) + 4rem); }
        button, a, [role="button"], nav, label {
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>

      <AnimatePresence mode="wait">
        <motion.main
          key={currentPageName}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
          className={currentPageName === "Dashboard" ? "h-screen overflow-hidden" : "p-4 sm:p-6 lg:p-8 pb-20 md:pb-8"}
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <MobileBottomTab currentPageName={currentPageName} />
    </div>
  );
}