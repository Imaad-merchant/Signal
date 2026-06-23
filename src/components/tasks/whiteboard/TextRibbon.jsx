import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Highlighter, X } from "lucide-react";
import { COLORS, FONT_FAMILIES, execCmd } from "./geometry";
import FontSizeStepper from "./FontSizeStepper";

// ─── Text Ribbon (Google Docs-style formatting) ───────────────────
// Trimmed to the essentials: font family, size, bold/italic/underline,
// alignment, text color, and highlight.
export default function TextRibbon({ textObject, onUpdate, editingTextRef, isEditing, isMobile = false }) {
  const [fontOpen, setFontOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const fontRef = useRef(null);
  const colorRef = useRef(null);
  const bgRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (fontRef.current && !fontRef.current.contains(e.target)) setFontOpen(false);
      if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false);
      if (bgRef.current && !bgRef.current.contains(e.target)) setBgOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const applyExec = (cmd, value) => {
    if (isEditing && editingTextRef?.current) {
      editingTextRef.current.focus();
      execCmd(cmd, value);
    }
  };

  // Apply object-level prop (default for the whole text box)
  const setProp = (patch) => {
    onUpdate(patch);
  };

  // True when there is a non-collapsed selection inside the editing text box.
  // Formatting should then target just those characters, not the whole box.
  const hasSelection = () => {
    if (!isEditing || !editingTextRef?.current) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const root = editingTextRef.current;
    return root.contains(sel.anchorNode) && root.contains(sel.focusNode);
  };

  const currentFont = FONT_FAMILIES.find(f => f.css === textObject.fontFamily) || FONT_FAMILIES[0];
  const currentSize = textObject.fontSize || 18;
  const currentBg = textObject.bgColor && textObject.bgColor !== "none" ? textObject.bgColor : null;

  const handleFontPick = (font) => {
    setFontOpen(false);
    if (hasSelection()) {
      editingTextRef.current.focus();
      execCmd("fontName", font.name);
      return;
    }
    setProp({ fontFamily: font.css });
    if (isEditing) editingTextRef?.current?.focus();
  };

  const handleSizePick = (size) => {
    if (hasSelection()) {
      editingTextRef.current.focus();
      // styleWithCSS must be OFF here: it makes execCommand("fontSize") emit the
      // deprecated <font size="7"> placeholder we swap for an exact px span.
      // With it ON, Chrome emits a fixed CSS keyword (xxx-large) instead, the
      // querySelector below matches nothing, and every pick collapses to one size.
      execCmd("styleWithCSS", false);
      execCmd("fontSize", "7");
      const root = editingTextRef.current;
      root.querySelectorAll('font[size="7"]').forEach(f => {
        const span = document.createElement("span");
        span.style.fontSize = `${size}px`;
        span.innerHTML = f.innerHTML;
        // Clear any nested font-size left from a previous resize — otherwise an
        // inner span's size wins and the text appears "stuck" at one size.
        span.querySelectorAll('[style*="font-size"]').forEach(el => {
          el.style.fontSize = "";
          if (!el.getAttribute("style")) el.removeAttribute("style");
        });
        f.replaceWith(span);
      });
      return;
    }
    setProp({ fontSize: size });
    if (isEditing) editingTextRef?.current?.focus();
  };

  const handleColorPick = (c) => {
    setColorOpen(false);
    if (hasSelection()) {
      editingTextRef.current.focus();
      execCmd("styleWithCSS", true);
      execCmd("foreColor", c);
      return;
    }
    setProp({ color: c });
    if (isEditing) editingTextRef?.current?.focus();
  };

  // Highlight: apply to just the selected characters when text is selected,
  // otherwise fall back to the object-level background for the whole box.
  const handleHighlight = (c) => {
    setBgOpen(false);
    if (hasSelection()) {
      editingTextRef.current.focus();
      execCmd("styleWithCSS", true);
      const val = c === "none" ? "transparent" : c;
      execCmd("hiliteColor", val); // standard
      execCmd("backColor", val);   // Chromium fallback
      return;
    }
    setProp({ bgColor: c });
    if (isEditing) editingTextRef?.current?.focus();
  };

  const RbBtn = ({ onClick, active, title, children }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${active ? "bg-blue-500/25 text-blue-200" : "text-gray-300 hover:bg-white/[0.07] hover:text-gray-100"}`}
    >
      {children}
    </button>
  );

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center justify-center gap-0.5 bg-[#252628]/98 backdrop-blur-md border border-white/[0.1] rounded-xl px-1.5 py-1 shadow-2xl max-w-[calc(100vw-1.5rem)]"
    >
      {/* Font family */}
      <div className="relative" ref={fontRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setFontOpen(o => !o); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-300 hover:bg-white/[0.07] min-w-[88px]"
          title="Font"
        >
          <span className="truncate flex-1 text-left" style={{ fontFamily: currentFont.css }}>{currentFont.name}</span>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {fontOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[140px] z-50 max-h-60 overflow-y-auto">
            {FONT_FAMILIES.map(f => (
              <button
                key={f.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); handleFontPick(f); }}
                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] ${currentFont.css === f.css ? "text-blue-300" : "text-gray-300"}`}
                style={{ fontFamily: f.css }}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font size */}
      <FontSizeStepper value={currentSize} onPick={handleSizePick} isMobile={isMobile} />

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Bold / Italic / Underline */}
      <RbBtn onClick={() => applyExec("bold")} title="Bold (⌘B)"><Bold className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("italic")} title="Italic (⌘I)"><Italic className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("underline")} title="Underline (⌘U)"><Underline className="h-3.5 w-3.5" /></RbBtn>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Color */}
      <div className="relative" ref={colorRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setColorOpen(o => !o); }}
          className="flex items-center gap-1 p-1.5 rounded-md hover:bg-white/[0.07] text-gray-300"
          title="Text color"
        >
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-bold leading-none">A</span>
            <div className="h-1 w-3 rounded-sm" style={{ backgroundColor: textObject.color || "#e5e7eb" }} />
          </div>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {colorOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl p-2 z-50">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); handleColorPick(c); }}
                  className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${textObject.color === c ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#2d2e30]" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 px-1">
              <span className="text-[10px] text-gray-500">Custom:</span>
              <input
                type="color"
                value={textObject.color || "#e5e7eb"}
                onChange={(e) => handleColorPick(e.target.value)}
                className="h-5 w-7 rounded cursor-pointer bg-transparent border border-white/[0.1]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Highlight / background color */}
      <div className="relative" ref={bgRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setBgOpen(o => !o); }}
          className="flex items-center gap-1 p-1.5 rounded-md hover:bg-white/[0.07] text-gray-300"
          title="Highlight color"
        >
          <div className="flex flex-col items-center">
            <Highlighter className="h-3.5 w-3.5" />
            <div className="h-1 w-3 rounded-sm mt-0.5" style={{ backgroundColor: currentBg || "transparent", border: currentBg ? "none" : "1px solid rgba(255,255,255,0.25)" }} />
          </div>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {bgOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl p-2 z-50">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); handleHighlight(c); }}
                  className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${currentBg === c ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#2d2e30]" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">Custom:</span>
                <input
                  type="color"
                  value={currentBg || "#000000"}
                  onChange={(e) => handleHighlight(e.target.value)}
                  className="h-5 w-7 rounded cursor-pointer bg-transparent border border-white/[0.1]"
                />
              </div>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); handleHighlight("none"); }}
                className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-gray-300 hover:bg-white/[0.07]"
                title="No highlight"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Alignment */}
      <RbBtn onClick={() => { setProp({ textAlign: "left" }); applyExec("justifyLeft"); }} active={textObject.textAlign === "left" || !textObject.textAlign} title="Align left">
        <AlignLeft className="h-3.5 w-3.5" />
      </RbBtn>
      <RbBtn onClick={() => { setProp({ textAlign: "center" }); applyExec("justifyCenter"); }} active={textObject.textAlign === "center"} title="Align center">
        <AlignCenter className="h-3.5 w-3.5" />
      </RbBtn>
      <RbBtn onClick={() => { setProp({ textAlign: "right" }); applyExec("justifyRight"); }} active={textObject.textAlign === "right"} title="Align right">
        <AlignRight className="h-3.5 w-3.5" />
      </RbBtn>
    </div>
  );
}
