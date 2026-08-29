import React, { useRef } from "react";
import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from "lucide-react";

// A drag-to-resize, alignable image. `width` (px) and `align` live in the node
// SCHEMA (with parse/renderHTML) so a resize survives save + reload — a NodeView
// that only touched the DOM would look right live and lose the size on reload,
// because getHTML() serializes from attrs, not the DOM.

function ImageNodeView({ node, updateAttributes, selected, editor, getPos }) {
  const { src, alt, title, width, align } = node.attrs;
  const wrapRef = useRef(null);
  const startRef = useRef(null);

  const beginResize = (e, corner) => {
    e.preventDefault();
    e.stopPropagation();
    const img = wrapRef.current?.querySelector("img");
    const editorW = editor?.view?.dom?.clientWidth || 800;
    startRef.current = {
      x: e.clientX,
      w: img ? img.getBoundingClientRect().width : (width || 320),
      max: editorW,
      corner,
    };
    const onMove = (ev) => {
      const s = startRef.current;
      if (!s) return;
      const dx = ev.clientX - s.x;
      // Left-side handles grow when dragged left; right-side handles grow right.
      const delta = s.corner === "nw" || s.corner === "sw" ? -dx : dx;
      const next = Math.max(48, Math.min(s.max, Math.round(s.w + delta)));
      updateAttributes({ width: next });
    };
    const onUp = () => {
      startRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const editable = editor?.isEditable;

  return (
    <NodeViewWrapper
      className="ri-wrap"
      style={{ display: "flex", justifyContent: justify, margin: "0.6em 0" }}
      data-align={align || "left"}
    >
      <div
        ref={wrapRef}
        className="ri-box"
        style={{ position: "relative", display: "inline-block", width: width ? `${width}px` : "auto", maxWidth: "100%", lineHeight: 0 }}
      >
        <img
          src={src}
          alt={alt || ""}
          title={title || ""}
          draggable={false}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: 4, outline: selected ? "2px solid #60a5fa" : "none" }}
        />
        {selected && editable && (
          <>
            {/* Corner resize handles */}
            {["nw", "ne", "sw", "se"].map((c) => (
              <span
                key={c}
                onPointerDown={(e) => beginResize(e, c)}
                style={{
                  position: "absolute", width: 12, height: 12, background: "#60a5fa",
                  border: "2px solid #0b0c0d", borderRadius: 3, zIndex: 2,
                  cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
                  top: c[0] === "n" ? -6 : "auto", bottom: c[0] === "s" ? -6 : "auto",
                  left: c[1] === "w" ? -6 : "auto", right: c[1] === "e" ? -6 : "auto",
                }}
              />
            ))}
            {/* Floating align/delete toolbar */}
            <div
              contentEditable={false}
              style={{
                position: "absolute", top: -34, left: "50%", transform: "translateX(-50%)",
                display: "flex", gap: 2, padding: 3, background: "#2a2b2d",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, zIndex: 3, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              }}
            >
              {[["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]].map(([a, Icon]) => (
                <button
                  key={a}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => updateAttributes({ align: a })}
                  title={`Align ${a}`}
                  style={{ padding: 4, borderRadius: 5, background: align === a ? "rgba(96,165,250,0.25)" : "transparent", color: align === a ? "#bfdbfe" : "#d1d5db", lineHeight: 0 }}
                >
                  <Icon size={14} />
                </button>
              ))}
              <span style={{ width: 1, background: "rgba(255,255,255,0.12)", margin: "2px 2px" }} />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { if (typeof getPos === "function") editor.chain().focus().deleteRange({ from: getPos(), to: getPos() + node.nodeSize }).run(); }}
                title="Delete image"
                style={{ padding: 4, borderRadius: 5, color: "#fca5a5", lineHeight: 0 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("width") || el.style?.width || "";
          const n = parseInt(String(w), 10);
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width, style: `width: ${attrs.width}px` } : {}),
      },
      align: {
        default: "left",
        parseHTML: (el) => el.getAttribute("data-align") || el.closest?.("[data-align]")?.getAttribute("data-align") || "left",
        renderHTML: (attrs) => ({ "data-align": attrs.align || "left" }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
}).configure({ inline: false, allowBase64: true });
