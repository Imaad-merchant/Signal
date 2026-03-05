import React, { useEffect, useState } from "react";

export default function Layout({ children, currentPageName }) {
  const [bgColor, setBgColor] = useState(() => localStorage.getItem("pulse_primary") || "#1e1f20");
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("pulse_secondary") || "#3b82f6");

  useEffect(() => {
    const sync = () => {
      setBgColor(localStorage.getItem("pulse_primary") || "#1e1f20");
      setAccentColor(localStorage.getItem("pulse_secondary") || "#3b82f6");
    };
    window.addEventListener("storage", sync);
    // Also poll on focus in case same-tab update
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor }}>
      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background-color: ${bgColor}; }
        :root { --pulse-accent: ${accentColor}; }
      `}</style>
      <main className={currentPageName === "Dashboard" ? "h-screen overflow-hidden" : "p-4 sm:p-6 lg:p-8"}>
        {children}
      </main>
    </div>
  );
}