import React, { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Link } from "@tiptap/extension-link";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Highlight } from "@tiptap/extension-highlight";
import { FontFamily } from "@tiptap/extension-font-family";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ResizableImage } from "./ResizableImage";
import {
  Undo2, Redo2, Bold, Italic, Underline as UIcon, Strikethrough, Code,
  List, ListOrdered, CheckSquare, Quote, Code2, Minus, Link as LinkIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, ChevronDown, Highlighter, Table as TableIcon, RemoveFormatting, Sparkles,
  Image as ImageIcon, Type
} from "lucide-react";

// Font size as an attribute on the existing TextStyle mark (the v3 font-size
// package is still prerelease, so we define the ~dozen lines ourselves).
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Sans Serif", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"];

const MARGIN_KEY = "signal_doc_margins";
function loadMargins() {
  try { const m = JSON.parse(localStorage.getItem(MARGIN_KEY) || ""); if (m && typeof m.left === "number") return m; } catch { /* ignore */ }
  return { left: 96, right: 96 };
}
function saveMargins(m) { try { localStorage.setItem(MARGIN_KEY, JSON.stringify(m)); } catch { /* ignore */ } }

// Obsidian-style [[wikilinks]]: decorate them so they read as links. Click
// handling is done with a native DOM listener on the editor (see the component)
// for reliability — ProseMirror's handleClick is finicky on decoration spans.
const WikiLink = Extension.create({
  name: "wikilink",
  addProseMirrorPlugins() {
    const re = /\[\[([^\]\n]+)\]\]/g;
    return [
      new Plugin({
        key: new PluginKey("wikilink"),
        props: {
          decorations(state) {
            const decos = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              re.lastIndex = 0;
              let m;
              while ((m = re.exec(node.text))) {
                const from = pos + m.index;
                const to = from + m[0].length;
                decos.push(Decoration.inline(from, to, { class: "wikilink", "data-title": m[1].split(/[|#]/)[0].trim() }));
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

const TEXT_COLORS = ["#e5e7eb", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
const HIGHLIGHT_COLORS = ["#fef08a", "#bef264", "#fda4af", "#a5f3fc", "#c4b5fd", "#fdba74"];

function Dropdown({ trigger, children, width = "min-w-[160px]" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-gray-300 hover:bg-white/[0.07] hover:text-gray-100"
      >
        {trigger}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className={`absolute top-full left-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 ${width} z-50 max-h-72 overflow-y-auto`}>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

function RbBtn({ onClick, active, title, children, disabled }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${active ? "bg-blue-500/25 text-blue-200" : "text-gray-300 hover:bg-white/[0.07] hover:text-gray-100"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange, placeholder = "Start typing...", onAIVisualize, onAIEdit, onOpenLink, uploadImage }) {
  const onOpenLinkRef = useRef(onOpenLink);
  useEffect(() => { onOpenLinkRef.current = onOpenLink; }, [onOpenLink]);
  const uploadRef = useRef(uploadImage);
  useEffect(() => { uploadRef.current = uploadImage; }, [uploadImage]);
  const fileInputRef = useRef(null);

  // Upload image files to storage, then insert them at `pos` (or the caret).
  // Paste/drop handlers below claim the event synchronously and call this async.
  const uploadAndInsert = useCallback(async (view, files, pos) => {
    const imgs = Array.from(files || []).filter((f) => f.type && f.type.startsWith("image/"));
    for (const file of imgs) {
      if (file.size > 20 * 1024 * 1024) { window.alert(`"${file.name}" is over 20MB — too large to embed.`); continue; }
      let url = null;
      try {
        url = uploadRef.current ? await uploadRef.current(file) : URL.createObjectURL(file);
      } catch (err) {
        window.alert(`Couldn't upload "${file.name}": ${err?.message || "failed"}`);
        continue;
      }
      if (!url) continue;
      const schema = view.state.schema;
      if (!schema.nodes.image) continue;
      const node = schema.nodes.image.create({ src: url });
      const at = typeof pos === "number" ? Math.min(pos, view.state.doc.content.size) : view.state.selection.from;
      view.dispatch(view.state.tr.insert(at, node).scrollIntoView());
    }
  }, []);

  const [margins, setMargins] = useState(loadMargins);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      WikiLink,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-blue-400 underline" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      ResizableImage,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert prose-sm max-w-none focus:outline-none min-h-[calc(100vh-210px)] text-gray-200",
      },
      // Paste an image from the clipboard.
      handlePaste(view, event) {
        const files = event.clipboardData?.files;
        if (files && files.length && Array.from(files).some((f) => f.type.startsWith("image/"))) {
          event.preventDefault();
          uploadAndInsert(view, files, null);
          return true;
        }
        return false;
      },
      // Drop image files onto the page (internal content drags fall through).
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (files && files.length && Array.from(files).some((f) => f.type.startsWith("image/"))) {
          event.preventDefault();
          event.stopPropagation();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          uploadAndInsert(view, files, coords ? coords.pos : null);
          return true;
        }
        return false;
      },
    },
  });

  // Update content if external value changes (e.g. switching pages)
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", false);
    }
  }, [editor, value]);

  // Open the target note when a [[wikilink]] is clicked (native listener — robust).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (e) => {
      const el = e.target.closest?.(".wikilink");
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        const title = el.getAttribute("data-title");
        if (title && onOpenLinkRef.current) onOpenLinkRef.current(title);
      }
    };
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor]);

  // Right-click context menu state
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxRef = useRef(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const h = (e) => { if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ctxMenu]);

  // AI menu state
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const aiMenuRef = useRef(null);
  useEffect(() => {
    if (!aiMenuOpen) return;
    const h = (e) => { if (aiMenuRef.current && !aiMenuRef.current.contains(e.target)) setAiMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [aiMenuOpen]);

  // Document outline — headings in document order, kept live as the doc changes.
  const [outline, setOutline] = useState([]);
  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const items = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "heading") items.push({ level: node.attrs.level || 1, text: node.textContent });
      });
      setOutline(items);
    };
    compute();
    editor.on("update", compute);
    return () => { editor.off("update", compute); };
  }, [editor]);

  const scrollToHeading = (i) => {
    const root = editor?.view?.dom;
    if (!root) return;
    const hs = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
    hs[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!editor) {
    return <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">Loading editor...</div>;
  }

  const headingLabel = (() => {
    if (editor.isActive("heading", { level: 1 })) return "Heading 1";
    if (editor.isActive("heading", { level: 2 })) return "Heading 2";
    if (editor.isActive("heading", { level: 3 })) return "Heading 3";
    return "Paragraph";
  })();

  return (
    <div className="flex-1 flex flex-col bg-[#1a1b1c] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/[0.06] bg-[#1c1d1e] flex-wrap shrink-0">
        <RbBtn onClick={() => editor.chain().focus().undo().run()} title="Undo (⌘Z)"><Undo2 className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().redo().run()} title="Redo (⌘⇧Z)"><Redo2 className="h-3.5 w-3.5" /></RbBtn>

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        {/* Heading dropdown */}
        <Dropdown trigger={<span className="min-w-[64px] text-left">{headingLabel}</span>}>
          {(close) => (
            <>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().setParagraph().run(); close(); }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.05]">Paragraph</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); close(); }} className="block w-full text-left px-3 py-1.5 text-base font-bold text-gray-100 hover:bg-white/[0.05]">Heading 1</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); close(); }} className="block w-full text-left px-3 py-1.5 text-sm font-bold text-gray-100 hover:bg-white/[0.05]">Heading 2</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run(); close(); }} className="block w-full text-left px-3 py-1.5 text-xs font-bold text-gray-100 hover:bg-white/[0.05]">Heading 3</button>
            </>
          )}
        </Dropdown>

        {/* Font family */}
        <Dropdown trigger={<span className="min-w-[52px] text-left flex items-center gap-1"><Type className="h-3 w-3" />Font</span>}>
          {(close) => (
            <>
              {FONT_FAMILIES.map((f) => (
                <button
                  key={f.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (f.value) editor.chain().focus().setFontFamily(f.value).run(); else editor.chain().focus().unsetFontFamily().run(); close(); }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]"
                  style={{ fontFamily: f.value || "inherit" }}
                >
                  {f.label}
                </button>
              ))}
            </>
          )}
        </Dropdown>

        {/* Font size */}
        <Dropdown trigger={<span className="min-w-[30px] text-left">{(editor.getAttributes("textStyle").fontSize || "16px").replace("px", "")}</span>} width="min-w-[80px]">
          {(close) => (
            <>
              {FONT_SIZES.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { editor.chain().focus().setFontSize(s).run(); close(); }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.05]"
                >
                  {s.replace("px", "")}
                </button>
              ))}
              <div className="border-t border-white/[0.06] my-1" />
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().unsetFontSize().run(); close(); }} className="block w-full text-left px-3 py-1.5 text-[10px] text-gray-500 hover:bg-white/[0.05]">Reset</button>
            </>
          )}
        </Dropdown>

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        {/* Inline formatting */}
        <RbBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (⌘B)"><Bold className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (⌘I)"><Italic className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline (⌘U)"><UIcon className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code"><Code className="h-3.5 w-3.5" /></RbBtn>

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        {/* Text color */}
        <Dropdown trigger={<div className="flex flex-col items-center"><span className="text-[9px] font-bold leading-none text-gray-300">A</span><div className="h-1 w-3 rounded-sm" style={{ backgroundColor: editor.getAttributes("textStyle").color || "#e5e7eb" }} /></div>}>
          {(close) => (
            <div className="p-2">
              <div className="grid grid-cols-5 gap-1.5">
                {TEXT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { editor.chain().focus().setColor(c).run(); close(); }}
                    className="h-5 w-5 rounded-full hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().unsetColor().run(); close(); }} className="block w-full mt-2 text-[10px] text-gray-500 hover:text-gray-300">Remove color</button>
            </div>
          )}
        </Dropdown>

        {/* Highlight */}
        <Dropdown trigger={<Highlighter className="h-3.5 w-3.5 text-gray-300" />}>
          {(close) => (
            <div className="p-2">
              <div className="grid grid-cols-3 gap-1.5">
                {HIGHLIGHT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { editor.chain().focus().toggleHighlight({ color: c }).run(); close(); }}
                    className="h-5 w-12 rounded hover:scale-105 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().unsetHighlight().run(); close(); }} className="block w-full mt-2 text-[10px] text-gray-500 hover:text-gray-300">Remove highlight</button>
            </div>
          )}
        </Dropdown>

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        {/* Lists */}
        <RbBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bulleted list"><List className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Task list"><CheckSquare className="h-3.5 w-3.5" /></RbBtn>

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        {/* Block elements */}
        <RbBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Block quote"><Quote className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block"><Code2 className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule"><Minus className="h-3.5 w-3.5" /></RbBtn>

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        {/* Alignment */}
        <RbBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center"><AlignCenter className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right"><AlignRight className="h-3.5 w-3.5" /></RbBtn>
        <RbBtn onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })} title="Justify"><AlignJustify className="h-3.5 w-3.5" /></RbBtn>

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        {/* Link */}
        <RbBtn
          onClick={() => {
            const prev = editor.getAttributes("link").href;
            const url = window.prompt("Link URL", prev || "https://");
            if (url === null) return;
            if (url === "") { editor.chain().focus().unsetLink().run(); return; }
            editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
          title="Insert link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </RbBtn>

        {/* Image */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) uploadAndInsert(editor.view, e.target.files, null); e.target.value = ""; }}
        />
        <RbBtn onClick={() => fileInputRef.current?.click()} title="Insert image"><ImageIcon className="h-3.5 w-3.5" /></RbBtn>

        {/* Table */}
        <RbBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">
          <TableIcon className="h-3.5 w-3.5" />
        </RbBtn>

        {/* Clear formatting */}
        <RbBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
          <RemoveFormatting className="h-3.5 w-3.5" />
        </RbBtn>

        {(onAIVisualize || onAIEdit) && (
          <>
            <div className="flex-1" />
            <div className="relative" ref={aiMenuRef}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setAiMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-[11px] text-purple-200 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
                title="AI options"
              >
                <Sparkles className="h-3 w-3" />
                AI
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
              {aiMenuOpen && (
                <div className="absolute top-full right-0 mt-1 bg-[#2d2e30] border border-white/[0.12] rounded-lg shadow-2xl py-1 min-w-[220px] z-50">
                  {onAIEdit && (
                    <>
                      <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-600">Edit document</p>
                      <AIMenuItem icon="↻" label="Reorganize & clean up" desc="Sections, headings, lists" onClick={() => { onAIEdit("reorganize", editor.getHTML()); setAiMenuOpen(false); }} />
                      <AIMenuItem icon="∑" label="Summarize" desc="Tighter, ~30% length" onClick={() => { onAIEdit("summarize", editor.getHTML()); setAiMenuOpen(false); }} />
                      <AIMenuItem icon="⤴" label="Expand into paragraphs" desc="Flesh out bullets" onClick={() => { onAIEdit("expand", editor.getHTML()); setAiMenuOpen(false); }} />
                      <AIMenuItem icon="✎" label="Custom instruction..." desc="Tell AI what to do" onClick={() => {
                        const instruction = window.prompt("What should AI do with this document?", "Rewrite in a friendlier tone");
                        if (instruction && instruction.trim()) onAIEdit("custom", editor.getHTML(), instruction);
                        setAiMenuOpen(false);
                      }} />
                    </>
                  )}
                  {onAIVisualize && (
                    <>
                      {onAIEdit && <div className="border-t border-white/[0.06] my-1" />}
                      <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-600">Convert</p>
                      <AIMenuItem icon="📊" label="Visualize as diagram" desc="New canvas page from notes" onClick={() => { onAIVisualize(editor.getText()); setAiMenuOpen(false); }} />
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Editor body — one continuous full-bleed surface (no paper edges), like
          Notion. An outline rail floats alongside; clicking any empty space in the
          writing column places the cursor at the end of the document. */}
      <div
        className="flex-1 overflow-y-auto bg-[#1a1b1c]"
        onContextMenu={(e) => {
          // Only show our menu if there's a selection or click is in the editor
          if (!editor) return;
          e.preventDefault();
          let x = e.clientX, y = e.clientY;
          if (x + 220 > window.innerWidth) x = window.innerWidth - 230;
          if (y + 420 > window.innerHeight) y = window.innerHeight - 430;
          setCtxMenu({ x, y });
        }}
      >
        <div className="flex items-start">
          {/* Writing column — left-anchored, full width, no card. Its own left/right
              padding IS the page margin, set by the draggable ruler above it. */}
          <div className="flex-1 min-w-0 pt-3 pb-24">
            <MarginRuler margins={margins} onChange={(m) => { setMargins(m); saveMargins(m); }} />
            <div
              style={{ paddingLeft: margins.left, paddingRight: margins.right }}
              onClick={(e) => { if (e.target === e.currentTarget) editor.chain().focus("end").run(); }}
            >
          <style>{`
            .ProseMirror { outline: none; }
            .ProseMirror p.is-editor-empty:first-child::before {
              content: attr(data-placeholder);
              float: left;
              color: #4b5563;
              pointer-events: none;
              height: 0;
            }
            .ProseMirror h1 { font-size: 1.75em; font-weight: 700; margin: 0.6em 0 0.3em; color: #f3f4f6; }
            .ProseMirror h2 { font-size: 1.35em; font-weight: 700; margin: 0.5em 0 0.25em; color: #f3f4f6; }
            .ProseMirror h3 { font-size: 1.15em; font-weight: 600; margin: 0.4em 0 0.2em; color: #f3f4f6; }
            .ProseMirror p { margin: 0.45em 0; line-height: 1.6; }
            .ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; margin: 0.5em 0; }
            .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
            .ProseMirror ul[data-type="taskList"] li { display: flex; gap: 0.5em; align-items: flex-start; }
            .ProseMirror ul[data-type="taskList"] li > label { flex-shrink: 0; user-select: none; }
            .ProseMirror ul[data-type="taskList"] li > div { flex: 1 1 auto; }
            .ProseMirror blockquote { border-left: 3px solid rgba(59, 130, 246, 0.5); padding-left: 1em; margin: 0.6em 0; color: #9ca3af; }
            .ProseMirror code { background: rgba(255,255,255,0.07); color: #93c5fd; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
            .ProseMirror pre { background: #0f1011; color: #e5e7eb; padding: 0.8em 1em; border-radius: 8px; overflow-x: auto; margin: 0.6em 0; }
            .ProseMirror pre code { background: transparent; color: inherit; padding: 0; }
            .ProseMirror hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 1em 0; }
            .ProseMirror table { border-collapse: collapse; margin: 0.6em 0; table-layout: fixed; width: 100%; }
            .ProseMirror table td, .ProseMirror table th { border: 1px solid rgba(255,255,255,0.12); padding: 0.4em 0.7em; min-width: 80px; }
            .ProseMirror table th { background: rgba(255,255,255,0.05); font-weight: 600; }
            .ProseMirror a { color: #60a5fa; text-decoration: underline; cursor: pointer; }
            .ProseMirror mark { padding: 0.1em 0.2em; border-radius: 2px; color: #111827; }
            .ProseMirror .wikilink { color: #a5b4fc; cursor: pointer; border-radius: 3px; padding: 0 1px; }
            .ProseMirror .wikilink:hover { background: rgba(129,140,248,0.15); text-decoration: underline; }
            .ProseMirror img { max-width: 100%; height: auto; }
            .ProseMirror .ri-wrap { user-select: none; }
          `}</style>
          <EditorContent editor={editor} />
            </div>
          </div>
          {/* Outline rail — moved to the right so text stays anchored to the left. */}
          {outline.length > 0 && (
            <nav className="hidden xl:block w-48 shrink-0 sticky top-0 self-start pt-6 pr-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2 px-2">Outline</p>
              <div className="flex flex-col">
                {outline.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToHeading(i)}
                    style={{ paddingLeft: 8 + (h.level - 1) * 10 }}
                    className="text-left text-[12px] leading-snug text-gray-500 hover:text-gray-200 py-1 pr-2 truncate transition-colors"
                  >
                    {h.text || "Untitled"}
                  </button>
                ))}
              </div>
            </nav>
          )}
        </div>
      </div>


      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 10000 }}
          className="w-56 bg-[#2a2b2d] border border-white/[0.1] rounded-xl shadow-2xl py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => { document.execCommand("cut"); setCtxMenu(null); }} label="Cut" shortcut="⌘X" />
          <MenuItem onClick={() => { document.execCommand("copy"); setCtxMenu(null); }} label="Copy" shortcut="⌘C" />
          <MenuItem onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              editor.chain().focus().insertContent(text).run();
            } catch {}
            setCtxMenu(null);
          }} label="Paste" shortcut="⌘V" />
          <MenuItem onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              editor.chain().focus().insertContent(text.replace(/<[^>]+>/g, "")).run();
            } catch {}
            setCtxMenu(null);
          }} label="Paste without formatting" />
          <Sep />
          <MenuItem onClick={() => { editor.chain().focus().toggleBold().run(); setCtxMenu(null); }} label="Bold" active={editor.isActive("bold")} shortcut="⌘B" />
          <MenuItem onClick={() => { editor.chain().focus().toggleItalic().run(); setCtxMenu(null); }} label="Italic" active={editor.isActive("italic")} shortcut="⌘I" />
          <MenuItem onClick={() => { editor.chain().focus().toggleUnderline().run(); setCtxMenu(null); }} label="Underline" active={editor.isActive("underline")} shortcut="⌘U" />
          <Sep />
          <SubMenu label="Format">
            <MenuItem onClick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); setCtxMenu(null); }} label="Heading 1" />
            <MenuItem onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); setCtxMenu(null); }} label="Heading 2" />
            <MenuItem onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run(); setCtxMenu(null); }} label="Heading 3" />
            <MenuItem onClick={() => { editor.chain().focus().setParagraph().run(); setCtxMenu(null); }} label="Paragraph" />
            <Sep />
            <MenuItem onClick={() => { editor.chain().focus().toggleBulletList().run(); setCtxMenu(null); }} label="Bulleted list" />
            <MenuItem onClick={() => { editor.chain().focus().toggleOrderedList().run(); setCtxMenu(null); }} label="Numbered list" />
            <MenuItem onClick={() => { editor.chain().focus().toggleTaskList().run(); setCtxMenu(null); }} label="Task list" />
            <Sep />
            <MenuItem onClick={() => { editor.chain().focus().toggleBlockquote().run(); setCtxMenu(null); }} label="Block quote" />
            <MenuItem onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setCtxMenu(null); }} label="Code block" />
          </SubMenu>
          <MenuItem onClick={() => {
            const prev = editor.getAttributes("link").href;
            const url = window.prompt("Link URL", prev || "https://");
            if (url === null) { setCtxMenu(null); return; }
            if (url === "") editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href: url }).run();
            setCtxMenu(null);
          }} label="Insert link" />
          <MenuItem onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setCtxMenu(null); }} label="Insert table" />
          <MenuItem onClick={() => { editor.chain().focus().clearNodes().unsetAllMarks().run(); setCtxMenu(null); }} label="Clear formatting" />
          <Sep />
          <MenuItem onClick={() => { editor.chain().focus().selectAll().run(); setCtxMenu(null); }} label="Select all" shortcut="⌘A" />
        </div>
      )}
    </div>
  );
}

// A Google-Docs-style ruler: two draggable handles set the left/right page
// margins. It lives in the same width-constrained box as the text, so the handle
// positions line up with where the text actually starts and ends.
function MarginRuler({ margins, onChange }) {
  const ref = useRef(null);
  const dragRef = useRef(null);

  const start = (side) => (e) => {
    e.preventDefault();
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { side, rect };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const w = d.rect.width;
      const MIN_GAP = 120; // keep a usable text column between the two margins
      if (d.side === "left") {
        const left = Math.max(0, Math.min(ev.clientX - d.rect.left, w - margins.right - MIN_GAP));
        onChange({ left: Math.round(left), right: margins.right });
      } else {
        const right = Math.max(0, Math.min(d.rect.right - ev.clientX, w - margins.left - MIN_GAP));
        onChange({ left: margins.left, right: Math.round(right) });
      }
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={ref} className="relative h-5 mb-1 select-none group" title="Drag to adjust margins">
      {/* track: light where text goes, dimmed in the margins */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-white/[0.04] rounded" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-[3px] bg-white/[0.12] rounded"
        style={{ left: margins.left, right: margins.right }}
      />
      {[["left", margins.left], ["right", margins.right]].map(([side, val]) => (
        <div
          key={side}
          onPointerDown={start(side)}
          className="absolute top-0 h-5 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity"
          style={side === "left" ? { left: val } : { right: val, marginLeft: 0, marginRight: -6 }}
          title={`${side} margin: ${val}px`}
        >
          <div className="w-2 h-2 rotate-45 bg-blue-400 border border-[#0b0c0d] rounded-[2px]" />
        </div>
      ))}
    </div>
  );
}

function AIMenuItem({ icon, label, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2.5 w-full px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
    >
      <span className="text-[14px] mt-0.5 w-4 text-purple-300">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-gray-200">{label}</p>
        {desc && <p className="text-[10px] text-gray-500">{desc}</p>}
      </div>
    </button>
  );
}

function MenuItem({ onClick, label, shortcut, active, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs transition-colors ${danger ? "text-rose-400 hover:bg-rose-500/15" : active ? "text-blue-200 bg-blue-500/15" : "text-gray-200 hover:bg-white/[0.06]"}`}
    >
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-gray-600">{shortcut}</span>}
    </button>
  );
}

function Sep() {
  return <div className="border-t border-white/[0.06] my-1" />;
}

function SubMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs text-gray-200 hover:bg-white/[0.06]">
        <span className="flex-1 text-left">{label}</span>
        <span className="text-gray-600">›</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 ml-1 bg-[#2d2e30] border border-white/[0.1] rounded-lg shadow-2xl py-1 min-w-[180px]">
          {children}
        </div>
      )}
    </div>
  );
}
