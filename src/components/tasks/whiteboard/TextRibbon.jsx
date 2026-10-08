import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Highlighter } from "lucide-react";
import { FONT_FAMILIES, execCmd } from "./geometry";
import FontSizeStepper from "./FontSizeStepper";
import ColorPicker from "../color/ColorPicker";

// Quick text styles (Google Docs' "Normal text" menu). Sizes are board px at 100%.
export const TEXT_STYLES = [
  { key: "title", label: "Title", fontSize: 40, fontWeight: 700, lineHeight: 1.15 },
  { key: "h1", label: "Heading 1", fontSize: 32, fontWeight: 700, lineHeight: 1.2 },
  { key: "h2", label: "Heading 2", fontSize: 26, fontWeight: 600, lineHeight: 1.25 },
  { key: "h3", label: "Heading 3", fontSize: 22, fontWeight: 600, lineHeight: 1.3 },
  { key: "body1", label: "Body 1", fontSize: 18, fontWeight: 400, lineHeight: 1.4 },
  { key: "body2", label: "Body 2", fontSize: 15, fontWeight: 400, lineHeight: 1.4 },
  { key: "caption", label: "Caption", fontSize: 12, fontWeight: 400, lineHeight: 1.35 },
];

// Drop inline font-size/weight so a whole-box style isn't overridden by spans
// left from earlier per-word sizing. <b>/<strong> bold is kept.
const INLINE_SIZE_WEIGHT = /\s*font-(?:size|weight)\s*:\s*[^;"]+;?/gi;
function stripInlineSizeWeight(html) {
  return String(html || "").replace(/style="([^"]*)"/gi, (m, css) => {
    const rest = css.replace(INLINE_SIZE_WEIGHT, "").trim();
    return rest ? `style="${rest}"` : "";
  });
}

// ─── Text Ribbon (Google Docs-style formatting) ───────────────────
// Trimmed to the essentials: text style, font family, size, bold/italic/underline,
// alignment, text color, and highlight.
export default function TextRibbon({ textObject, onUpdate, editingTextRef, isEditing, onFinishEdit, isMobile = false }) {
  const [fontOpen, setFontOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const styleRef = useRef(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const fontRef = useRef(null);
  const ribbonRef = useRef(null);
  const colorRef = useRef(null);
  const bgRef = useRef(null);
  // Last non-collapsed selection inside the editing box. Native <input type=color>
  // steals focus and collapses the live selection before its onChange fires, so we
  // restore from here before applying selection-aware styles.
  const savedRange = useRef(null);
  // Font size at the current selection/caret, so the stepper shows the size of the
  // text you actually have selected (which may be an inline span) rather than the
  // box default. null → fall back to the object-level size.
  const [selFontSize, setSelFontSize] = useState(null);

  // Latest edit state for the one-time document listener below.
  const latest = useRef({});
  latest.current = { isEditing, onFinishEdit };

  useEffect(() => {
    const handler = (e) => {
      // A click outside while the picker's hex field has focus: closing the panel
      // unmounts the field before its blur reaches React, so finish the edit here.
      const { isEditing, onFinishEdit } = latest.current;
      const root = editingTextRef?.current;
      if (isEditing && root && document.activeElement?.hasAttribute?.("data-keep-text-edit") &&
          !root.contains(e.target) && !ribbonRef.current?.contains(e.target)) {
        onFinishEdit?.();
      }
      if (fontRef.current && !fontRef.current.contains(e.target)) setFontOpen(false);
      if (styleRef.current && !styleRef.current.contains(e.target)) setStyleOpen(false);
      if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false);
      if (bgRef.current && !bgRef.current.contains(e.target)) setBgOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editingTextRef]);

  // Continuously remember the live selection while editing, and reflect the size at
  // the selection so the stepper shows the selected text's actual size.
  useEffect(() => {
    const onSelChange = () => {
      const root = editingTextRef?.current;
      if (!isEditing || !root) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (!root.contains(r.commonAncestorContainer)) return;
      if (!sel.isCollapsed) savedRange.current = r.cloneRange();
      // Resolve the element whose font-size actually applies to the selected text.
      // A range boundary set with setStartBefore(span) has startContainer = the
      // PARENT (offset points at the span), so reading the parent would report the
      // box default; descend into the child at the boundary to reach the real span.
      let node = r.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) {
        let child = node.childNodes[r.startOffset] || node.lastChild;
        while (child && child.nodeType !== Node.TEXT_NODE) child = child.firstChild;
        if (child) node = child;
      }
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (el && root.contains(el)) {
        const px = parseInt(getComputedStyle(el).fontSize, 10);
        if (!Number.isNaN(px)) setSelFontSize(px);
      }
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, [isEditing, editingTextRef]);

  // Clear the tracked selection size when we stop editing so the stepper falls
  // back to the object-level size for the next box.
  useEffect(() => { if (!isEditing) setSelFontSize(null); }, [isEditing]);

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

  // Returns true when a non-collapsed selection inside the editing box is active —
  // restoring the saved range first if the live selection was lost (e.g. a native
  // color input stole focus). Formatting then targets just those characters.
  const ensureSelection = () => {
    const root = editingTextRef?.current;
    if (!isEditing || !root) return false;
    const sel = window.getSelection();
    const liveOk = sel && sel.rangeCount > 0 && !sel.isCollapsed &&
      root.contains(sel.anchorNode) && root.contains(sel.focusNode);
    if (liveOk) return true;
    const r = savedRange.current;
    if (sel && r && !r.collapsed && root.contains(r.commonAncestorContainer)) {
      root.focus();
      sel.removeAllRanges();
      sel.addRange(r);
      return sel.rangeCount > 0 && !sel.isCollapsed;
    }
    return false;
  };

  // Re-capture the live selection after applying a style, so a follow-up onChange
  // from the still-open native color picker keeps targeting the same characters.
  const resaveSelection = () => {
    const root = editingTextRef?.current;
    const sel = window.getSelection();
    if (root && sel && sel.rangeCount > 0 && !sel.isCollapsed &&
        root.contains(sel.anchorNode) && root.contains(sel.focusNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const currentFont = FONT_FAMILIES.find(f => f.css === textObject.fontFamily) || FONT_FAMILIES[0];
  const currentSize = selFontSize || textObject.fontSize || 18;
  const currentBg = textObject.bgColor && textObject.bgColor !== "none" ? textObject.bgColor : null;

  const handleFontPick = (font) => {
    setFontOpen(false);
    if (ensureSelection()) {
      execCmd("fontName", font.name);
      resaveSelection();
      return;
    }
    setProp({ fontFamily: font.css });
    if (isEditing) editingTextRef?.current?.focus();
  };

  const handleSizePick = (size, weight = null) => {
    if (ensureSelection()) {
      editingTextRef.current.focus();
      // styleWithCSS must be OFF here: it makes execCommand("fontSize") emit the
      // deprecated <font size="7"> placeholder we swap for an exact px span.
      // With it ON, Chrome emits a fixed CSS keyword (xxx-large) instead, the
      // querySelector below matches nothing, and every pick collapses to one size.
      execCmd("styleWithCSS", false);
      execCmd("fontSize", "7");
      const root = editingTextRef.current;
      const created = [];
      root.querySelectorAll('font[size="7"]').forEach(f => {
        const span = document.createElement("span");
        span.style.fontSize = `${size}px`;
        if (weight != null) span.style.fontWeight = String(weight);
        span.innerHTML = f.innerHTML;
        // Clear any nested font-size left from a previous resize — otherwise an
        // inner span's size wins and the text appears "stuck" at one size.
        span.querySelectorAll('[style*="font-size"], [style*="font-weight"]').forEach(el => {
          el.style.fontSize = "";
          if (weight != null) el.style.fontWeight = "";
          if (!el.getAttribute("style")) el.removeAttribute("style");
        });
        f.replaceWith(span);
        created.push(span);
      });
      // Re-select the resized text. replaceWith() collapses the selection, which
      // would make the NEXT size change miss the word and silently fall back to
      // the whole-box default — so restore a range spanning the new spans.
      if (created.length) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStartBefore(created[0]);
        range.setEndAfter(created[created.length - 1]);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      resaveSelection();
      // Direct DOM edits (replaceWith) don't fire the editor's onInput, so notify
      // it — otherwise the in-progress snapshot used for autosave/flush is stale
      // and can revert the inline size when the box loses focus.
      root.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    setProp({ fontSize: size });
    if (isEditing) editingTextRef?.current?.focus();
  };

  // Text style: with characters selected, style just those (inline span);
  // otherwise restyle the whole box — size, weight and line height — clearing
  // inline size/weight overrides so the style actually shows.
  const handleStylePick = (st) => {
    setStyleOpen(false);
    if (ensureSelection()) { handleSizePick(st.fontSize, st.fontWeight); return; }
    const root = isEditing ? editingTextRef?.current : null;
    if (root) {
      root.innerHTML = stripInlineSizeWeight(root.innerHTML);
      root.dispatchEvent(new Event("input", { bubbles: true }));
      setProp({ fontSize: st.fontSize, fontWeight: st.fontWeight, lineHeight: st.lineHeight });
      root.focus();
    } else {
      setProp({ fontSize: st.fontSize, fontWeight: st.fontWeight, lineHeight: st.lineHeight, text: stripInlineSizeWeight(textObject.text) });
    }
  };
  const currentStyle = TEXT_STYLES.find((st) =>
    st.fontSize === currentSize && st.fontWeight === (textObject.fontWeight || 400)) || null;

  // Panel-closing is handled by the swatch onClicks, NOT here — so the custom
  // <input type=color> can keep firing onChange while its picker stays open.
  const handleColorPick = (c) => {
    if (ensureSelection()) {
      execCmd("styleWithCSS", true);
      execCmd("foreColor", c);
      resaveSelection();
      return;
    }
    setProp({ color: c });
    if (isEditing) editingTextRef?.current?.focus();
  };

  // Highlight: apply to just the selected characters when text is selected,
  // otherwise fall back to the object-level background for the whole box.
  const handleHighlight = (c) => {
    if (ensureSelection()) {
      execCmd("styleWithCSS", true);
      const val = c === "none" ? "transparent" : c;
      execCmd("hiliteColor", val); // standard
      execCmd("backColor", val);   // Chromium fallback
      resaveSelection();
      return;
    }
    setProp({ bgColor: c });
    if (isEditing) editingTextRef?.current?.focus();
  };

  // The hex field is the one picker control that takes focus. The editing box
  // ignores that blur (see Whiteboard), so when focus leaves the field for anywhere
  // other than the box or this ribbon, finish the edit explicitly.
  const handleHexBlur = (e) => {
    const root = editingTextRef?.current;
    if (!isEditing || !root) return;
    const to = e.relatedTarget;
    if (to && (root.contains(to) || ribbonRef.current?.contains(to))) return;
    onFinishEdit?.();
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
      ref={ribbonRef}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center justify-center gap-0.5 bg-[#252628] border border-white/[0.1] rounded-xl px-1.5 py-1 shadow-2xl max-w-[calc(100vw-1.5rem)]"
    >
      {/* Text style */}
      <div className="relative" ref={styleRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); setStyleOpen(o => !o); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-200 hover:bg-white/[0.07] min-w-[82px]"
          title="Text style"
        >
          <span className="truncate flex-1 text-left">{currentStyle ? currentStyle.label : "Style"}</span>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {styleOpen && (
          <div className="absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[180px] z-50 max-h-[60vh] overflow-y-auto">
            {TEXT_STYLES.map(st => (
              <button
                key={st.key}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); handleStylePick(st); }}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-white/[0.05] ${currentStyle?.key === st.key ? "text-blue-300" : "text-gray-200"}`}
              >
                <span style={{ fontSize: Math.min(22, Math.max(11, st.fontSize * 0.6)), fontWeight: st.fontWeight, lineHeight: 1.2 }}>{st.label}</span>
                <span className="text-[10px] text-gray-500 tabular-nums">{st.fontSize}</span>
              </button>
            ))}
          </div>
        )}
      </div>

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
            <ColorPicker
              kind="text"
              value={textObject.color || null}
              onPick={(c) => handleColorPick(c)}
              onClose={() => setColorOpen(false)}
              onInputBlur={handleHexBlur}
            />
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
            <ColorPicker
              kind="highlight"
              shape="square"
              value={currentBg}
              onPick={(c) => handleHighlight(c)}
              onClear={() => handleHighlight("none")}
              clearLabel="None"
              onClose={() => setBgOpen(false)}
              onInputBlur={handleHexBlur}
            />
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
