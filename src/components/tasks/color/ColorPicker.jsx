import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PALETTE, PALETTE_COLS } from "./palette";
import { useRecentColors, pushRecentColor, MAX_RECENT } from "./recentColors";
import { normalizeHex } from "./colorMath";
import ColorWheel from "./ColorWheel";

// Shared color picker panel: recent slots, palette grid, color wheel + hex entry.
//
//   kind     "text" | "highlight" | "draw" — which recent-colors list to use
//   value    current color (hex) or null
//   onPick   (hex, { commit }) — commit=false while dragging the wheel, true on release,
//            swatch click, or hex entry. Every committed pick is saved to the recents.
//   onClear  optional; renders a clear/remove link
//   onClose  optional; called after a committed swatch/recent/hex pick
//   wheel    show the Wheel tab (default true); off for hover submenus
//   shape    "circle" | "square" swatches
export default function ColorPicker({ kind, value, onPick, onClear, clearLabel = "Remove color", onClose, wheel = true, shape = "circle", onInputBlur }) {
  const recent = useRecentColors(kind);
  const [tab, setTab] = useState("palette");
  const current = normalizeHex(value);
  const [hex, setHex] = useState(current || value || "");

  useEffect(() => { setHex(current || value || ""); }, [current, value]);

  const commit = (c, close = true) => {
    const n = normalizeHex(c);
    if (!n) return;
    pushRecentColor(kind, n);
    onPick(n, { commit: true });
    if (close) onClose?.();
  };

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const radius = shape === "square" ? "rounded-[4px]" : "rounded-full";
  const swatchCls = (c) =>
    `h-4 w-4 ${radius} transition-transform hover:scale-110 ${current === c ? "ring-2 ring-blue-400 ring-offset-1 ring-offset-[#2d2e30]" : ""}`;

  return (
    <div className="w-[216px] select-none" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {/* Recent slots */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] text-gray-500 w-11">Recent</span>
        {Array.from({ length: MAX_RECENT }).map((_, i) => {
          const c = recent[i];
          return c ? (
            <button
              key={`${c}-${i}`}
              type="button"
              title={c}
              onMouseDown={stop}
              onClick={(e) => { e.stopPropagation(); commit(c); }}
              className={swatchCls(c)}
              style={{ backgroundColor: c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
            />
          ) : (
            <div key={`empty-${i}`} className={`h-4 w-4 ${radius} border border-dashed border-white/20`} title="Empty slot" />
          );
        })}
      </div>

      {/* Tabs */}
      {wheel && (
        <div className="flex gap-1 mb-2 bg-white/[0.04] rounded-md p-0.5">
          {["palette", "wheel"].map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={stop}
              onClick={(e) => { e.stopPropagation(); setTab(t); }}
              className={`flex-1 text-[10.5px] py-0.5 rounded ${tab === t ? "bg-white/[0.1] text-gray-100" : "text-gray-400 hover:text-gray-200"}`}
            >
              {t === "palette" ? "Palette" : "Wheel"}
            </button>
          ))}
        </div>
      )}

      {tab === "palette" || !wheel ? (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${PALETTE_COLS}, minmax(0, 1fr))` }}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onMouseDown={stop}
              onClick={(e) => { e.stopPropagation(); commit(c); }}
              className={swatchCls(c)}
              style={{ backgroundColor: c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <ColorWheel
            value={current || "#3b82f6"}
            onChange={(c) => { setHex(c); onPick(c, { commit: false }); }}
            onCommit={(c) => { setHex(c); commit(c, false); }}
          />
        </div>
      )}

      {/* Hex entry + clear */}
      <div className="mt-2 flex items-center gap-2">
        <div
          className="h-4 w-4 rounded-full shrink-0"
          style={{ backgroundColor: current || "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)" }}
        />
        <input
          type="text"
          value={hex}
          spellCheck={false}
          placeholder="#rrggbb"
          onChange={(e) => setHex(e.target.value)}
          data-keep-text-edit=""
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={onInputBlur}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); commit(hex); }
            if (e.key === "Escape") { e.preventDefault(); setHex(value || ""); e.currentTarget.blur(); }
          }}
          className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.1] rounded px-1.5 py-0.5 text-[11px] font-mono text-gray-200 focus:outline-none focus:border-blue-400/50"
          aria-label="Hex color"
        />
        {onClear && (
          <button
            type="button"
            onMouseDown={stop}
            onClick={(e) => { e.stopPropagation(); onClear(); onClose?.(); }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-200 hover:bg-white/[0.07] whitespace-nowrap"
            title={clearLabel}
          >
            <X className="h-3 w-3" /> {clearLabel}
          </button>
        )}
      </div>
    </div>
  );
}
