import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, ListOrdered } from "lucide-react";
import { COLORS, FONT_FAMILIES, FONT_SIZES, execCmd } from "./geometry";

// ─── Text Ribbon (Google Docs-style formatting) ───────────────────
export default function TextRibbon({ textObject, onUpdate, editingTextRef, isEditing }) {
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const fontRef = useRef(null);
  const sizeRef = useRef(null);
  const colorRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (fontRef.current && !fontRef.current.contains(e.target)) setFontOpen(false);
      if (sizeRef.current && !sizeRef.current.contains(e.target)) setSizeOpen(false);
      if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false);
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

  // Apply object-level prop (when not editing or font-level)
  const setProp = (patch) => {
    onUpdate(patch);
  };

  const currentFont = FONT_FAMILIES.find(f => f.css === textObject.fontFamily) || FONT_FAMILIES[0];
  const currentSize = textObject.fontSize || 18;

  const handleFontPick = (font) => {
    setProp({ fontFamily: font.css });
    setFontOpen(false);
    if (isEditing) {
      editingTextRef?.current?.focus();
      execCmd("fontName", font.name);
    }
  };

  const handleSizePick = (size) => {
    setProp({ fontSize: size });
    setSizeOpen(false);
    if (isEditing && editingTextRef?.current) {
      editingTextRef.current.focus();
      // Wrap selection in span with style
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        execCmd("styleWithCSS", true);
        execCmd("fontSize", "7");
        // Replace generated font tags with span style
        const root = editingTextRef.current;
        root.querySelectorAll('font[size="7"]').forEach(f => {
          const span = document.createElement("span");
          span.style.fontSize = `${size}px`;
          span.innerHTML = f.innerHTML;
          f.replaceWith(span);
        });
      }
    }
  };

  const handleColorPick = (c) => {
    setProp({ color: c });
    setColorOpen(false);
    if (isEditing && editingTextRef?.current) {
      editingTextRef.current.focus();
      execCmd("styleWithCSS", true);
      execCmd("foreColor", c);
    }
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
      className="absolute top-[60px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-[#252628]/98 backdrop-blur-md border border-white/[0.1] rounded-xl px-1.5 py-1 shadow-2xl"
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
      <div className="relative" ref={sizeRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setSizeOpen(o => !o); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-300 hover:bg-white/[0.07] min-w-[52px]"
          title="Font size"
        >
          <span className="flex-1 text-center">{currentSize}</span>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {sizeOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[60px] z-50 max-h-60 overflow-y-auto">
            {FONT_SIZES.map(s => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); handleSizePick(s); }}
                className={`block w-full text-center px-2 py-1 text-xs hover:bg-white/[0.05] ${currentSize === s ? "text-blue-300" : "text-gray-300"}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Bold / Italic / Underline / Strikethrough */}
      <RbBtn onClick={() => applyExec("bold")} title="Bold (⌘B)"><Bold className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("italic")} title="Italic (⌘I)"><Italic className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("underline")} title="Underline (⌘U)"><Underline className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("strikeThrough")} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></RbBtn>

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

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Lists */}
      <RbBtn onClick={() => applyExec("insertUnorderedList")} title="Bulleted list"><List className="h-3.5 w-3.5" /></RbBtn>
      <RbBtn onClick={() => applyExec("insertOrderedList")} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></RbBtn>
    </div>
  );
}
