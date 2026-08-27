import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import MobileBottomTab from "./components/MobileBottomTab";

export default function Layout({ children, currentPageName }) {
  const [themeColor, setThemeColor] = useState(() => localStorage.getItem("pulse_theme") || "#4285f4");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const sync = () => setThemeColor(localStorage.getItem("pulse_theme") || "#4285f4");
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);

  const isFullHeight = currentPageName === "Dashboard" || currentPageName === "Tasks" || currentPageName === "Donna";

  return (
    <div className="min-h-[100dvh] bg-[#1e1f20]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
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
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
          transition={{ duration: reduceMotion ? 0.08 : 0.18, ease: "easeInOut" }}
          className={isFullHeight ? "overflow-hidden" : "p-4 sm:p-6 lg:p-8 pb-20"}
          style={isFullHeight ? { height: "calc(100dvh - env(safe-area-inset-top))" } : undefined}
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <MobileBottomTab currentPageName={currentPageName} />
    </div>
  );
}