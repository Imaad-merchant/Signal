import React, { useEffect, useRef, useState } from "react";
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
import {
  Undo2, Redo2, Bold, Italic, Underline as UIcon, Strikethrough, Code,
  List, ListOrdered, CheckSquare, Quote, Code2, Minus, Link as LinkIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Heading1, Heading2, Heading3,
  Type, ChevronDown, Palette, Highlighter, Table as TableIcon, RemoveFormatting, Sparkles
} from "lucide-react";

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

export default function RichTextEditor({ value, onChange, placeholder = "Start typing...", onAIVisualize }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-blue-400 underline" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
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
        class: "prose prose-invert prose-sm max-w-none focus:outline-none min-h-[60vh] text-gray-200",
      },
    },
  });

  // Update content if external value changes (e.g. switching pages)
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", false);
    }
  }, [editor, value]);

  // Right-click context menu state
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxRef = useRef(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const h = (e) => { if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ctxMenu]);

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

        {/* Table */}
        <RbBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">
          <TableIcon className="h-3.5 w-3.5" />
        </RbBtn>

        {/* Clear formatting */}
        <RbBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
          <RemoveFormatting className="h-3.5 w-3.5" />
        </RbBtn>

        {onAIVisualize && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAIVisualize(editor.getText())}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-[11px] text-purple-200 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
              title="Turn notes into a visual whiteboard with AI"
            >
              <Sparkles className="h-3 w-3" />
              AI Visualize
            </button>
          </>
        )}
      </div>

      {/* Editor body */}
      <div
        className="flex-1 overflow-y-auto"
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
        <div className="max-w-3xl mx-auto px-8 py-8">
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
          `}</style>
          <EditorContent editor={editor} />
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
