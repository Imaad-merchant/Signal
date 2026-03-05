import React from "react";

export default function Layout({ children, currentPageName }) {
  return (
    <div className="min-h-screen bg-[#1e1f20]">
      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #1e1f20; }
      `}</style>
      <main className={currentPageName === "Dashboard" ? "h-screen overflow-hidden" : "p-4 sm:p-6 lg:p-8"}>
        {children}
      </main>
    </div>
  );
}