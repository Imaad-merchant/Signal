import React from "react";

// A GitHub-contribution-style strip of the last N days for one habit. Each cell is
// a day, oldest → newest: filled = done, faint = a logged miss, empty = no log.
// The most recent cell animates (scale + ring) when it was just logged, so an
// answer visibly "lands" in the history.
export default function ContributionStrip({ history = [], justLogged = false }) {
  if (!history.length) return null;
  return (
    <div className="mt-1.5 flex items-center gap-[3px]">
      {history.map((d, i) => {
        const last = i === history.length - 1;
        const cls =
          d.state === "done" ? "bg-emerald-400/80"
          : d.state === "miss" ? "bg-white/[0.12]"
          : "bg-white/[0.05]";
        return (
          <span
            key={d.date}
            title={`${d.date}${d.state === "done" ? " · done" : d.state === "miss" ? " · missed" : ""}`}
            className={`h-2.5 w-2.5 rounded-[3px] transition-all duration-500 ${cls} ${
              last && justLogged ? "scale-[1.35] ring-2 ring-emerald-300/70" : ""
            }`}
          />
        );
      })}
    </div>
  );
}
