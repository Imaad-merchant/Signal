import React, { useState, useRef, useEffect } from "react";

// ─── Whiteboard Context Menu ──────────────────────────────────────
export default function WhiteboardContextMenu({ menu, onClose, onAction }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const [subOpen, setSubOpen] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let x = menu.x, y = menu.y;
    if (x + rect.width + 8 > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height + 8 > window.innerHeight) y = window.innerHeight - rect.height - 8;
    setPos({ x, y });
  }, [menu]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const target = menu.target;

  const MenuItem = ({ icon: Icon, label, shortcut, onClick, danger }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); onClose(); }}
      className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs transition-colors ${danger ? "text-rose-400 hover:bg-rose-500/15" : "text-gray-200 hover:bg-white/[0.06]"}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-gray-600">{shortcut}</span>}
    </button>
  );

  const SubMenuTrigger = ({ icon: Icon, label, subKey, children }) => (
    <div className="relative" onMouseEnter={() => setSubOpen(subKey)} onMouseLeave={() => setSubOpen(null)}>
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs text-gray-200 hover:bg-white/[0.06]"
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span className="flex-1 text-left">{label}</span>
        <span className="text-gray-600">›</span>
      </button>
      {subOpen === subKey && (
        <div className="absolute left-full top-0 ml-1 bg-[#2d2e30] border border-white/[0.1] rounded-lg shadow-2xl py-1 min-w-[160px]">
          {children}
        </div>
      )}
    </div>
  );

  const Sep = () => <div className="border-t border-white/[0.06] my-1" />;

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 10000 }}
      className="w-52 bg-[#2a2b2d] border border-white/[0.1] rounded-xl shadow-2xl py-1"
    >
      {target ? (
        <>
          {target.type === "text" && <MenuItem label="Edit text" onClick={() => onAction("editText", target)} />}
          <MenuItem label="Cut" shortcut="⌘X" onClick={() => onAction("cut")} />
          <MenuItem label="Copy" shortcut="⌘C" onClick={() => onAction("copy")} />
          <MenuItem label="Paste" shortcut="⌘V" onClick={() => onAction("paste")} />
          <MenuItem label="Duplicate" shortcut="⌘D" onClick={() => onAction("duplicate")} />
          <MenuItem label="Delete" shortcut="Del" onClick={() => onAction("delete")} danger />
          <Sep />
          <MenuItem label="Bring to front" onClick={() => onAction("bringToFront")} />
          <MenuItem label="Bring forward" onClick={() => onAction("bringForward")} />
          <MenuItem label="Send backward" onClick={() => onAction("sendBackward")} />
          <MenuItem label="Send to back" onClick={() => onAction("sendToBack")} />
          <Sep />
          <MenuItem label={target.locked ? "Unlock" : "Lock"} onClick={() => onAction("toggleLock")} />
          <MenuItem label="Group" shortcut="⌘G" onClick={() => onAction("group")} />
          <MenuItem label="Ungroup" shortcut="⌘⇧G" onClick={() => onAction("ungroup")} />
          <Sep />
          <SubMenuTrigger label="Color" subKey="color">
            <div className="grid grid-cols-5 gap-1 p-2">
              {["#e5e7eb", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAction("setColor", c); onClose(); }}
                  className="h-5 w-5 rounded-full hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </SubMenuTrigger>
          <SubMenuTrigger label="Stroke width" subKey="stroke">
            <div className="py-1">
              {[1.5, 3, 5, 8].map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAction("setStrokeWidth", w); onClose(); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.06]"
                >
                  <div className="rounded-full bg-gray-300" style={{ height: w, width: 24 }} />
                  <span>{w}px</span>
                </button>
              ))}
            </div>
          </SubMenuTrigger>
        </>
      ) : (
        <>
          <MenuItem label="Paste" shortcut="⌘V" onClick={() => onAction("pasteAt")} />
          <MenuItem label="Select all" shortcut="⌘A" onClick={() => onAction("selectAll")} />
          <Sep />
          <MenuItem label="Toggle grid" onClick={() => onAction("toggleGrid")} />
          <MenuItem label="Reset zoom" onClick={() => onAction("resetZoom")} />
          <MenuItem label="Zoom to fit" onClick={() => onAction("zoomToFit")} />
          <Sep />
          <SubMenuTrigger label="Add" subKey="add">
            <MenuItem label="Sticky note" onClick={() => onAction("addAt", "sticky")} />
            <MenuItem label="Text" onClick={() => onAction("addAt", "text")} />
            <MenuItem label="Rectangle" onClick={() => onAction("addAt", "rect")} />
            <MenuItem label="Ellipse" onClick={() => onAction("addAt", "ellipse")} />
            <MenuItem label="Triangle" onClick={() => onAction("addAt", "triangle")} />
            <MenuItem label="Diamond" onClick={() => onAction("addAt", "diamond")} />
            <MenuItem label="Star" onClick={() => onAction("addAt", "star")} />
          </SubMenuTrigger>
        </>
      )}
    </div>
  );
}
