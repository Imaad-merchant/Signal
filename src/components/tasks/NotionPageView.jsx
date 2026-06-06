import React, { useState, useEffect, useRef, useCallback } from "react";
import { Calendar as CalendarIcon, Type, Flag, Activity, MoreHorizontal, MessageCircle, Plus, ChevronDown, FileText } from "lucide-react";
import { ICON_MAP } from "./NotionSidebar";
import { format, parseISO } from "date-fns";

const STATUS_OPTIONS = [
  { key: "not_started", label: "Not started", color: "#6b7280", bg: "bg-rose-500/15", border: "border-rose-500/40", text: "text-rose-400" },
  { key: "in_progress", label: "In progress", color: "#3b82f6", bg: "bg-blue-500/15", border: "border-blue-500/40", text: "text-blue-400" },
  { key: "done", label: "Done", color: "#10b981", bg: "bg-emerald-500/15", border: "border-emerald-500/40", text: "text-emerald-400" },
];

const PRIORITY_OPTIONS = [
  { key: "low", label: "Low", text: "text-emerald-400" },
  { key: "medium", label: "Medium", text: "text-amber-400" },
  { key: "high", label: "High", text: "text-rose-400" },
];

function IconPicker({ current, onChange, onClose }) {
  return (
    <div className="absolute z-50 mt-2 bg-[#2d2e30] border border-white/[0.1] rounded-xl shadow-2xl p-2 grid grid-cols-4 gap-1">
      {Object.entries(ICON_MAP).map(([key, cfg]) => {
        const Icon = cfg.icon;
        return (
          <button
            key={key}
            onClick={() => { onChange(key); onClose(); }}
            className={`p-2 rounded-lg hover:bg-white/[0.06] ${current === key ? "bg-white/[0.08]" : ""}`}
          >
            <Icon className={`h-5 w-5 ${cfg.color}`} />
          </button>
        );
      })}
    </div>
  );
}

function PropertyRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="flex items-center gap-2 w-32 shrink-0 text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[12.5px]">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function StatusBadge({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_OPTIONS.find(s => s.key === value) || STATUS_OPTIONS[0];
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        {cfg.label}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-[#2d2e30] border border-white/[0.1] rounded-lg shadow-2xl py-1 min-w-[140px]">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => { onChange(s.key); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.05]"
            >
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.bg} ${s.border} ${s.text}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {s.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PrioritySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = PRIORITY_OPTIONS.find(p => p.key === value);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 text-[12.5px] hover:bg-white/[0.04] rounded px-1.5 py-0.5 ${cfg ? cfg.text : "text-gray-600"}`}
      >
        {cfg?.label || "Empty"}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-[#2d2e30] border border-white/[0.1] rounded-lg shadow-2xl py-1 min-w-[100px]">
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className="block w-full px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-white/[0.05]"
          >
            Empty
          </button>
          {PRIORITY_OPTIONS.map(p => (
            <button
              key={p.key}
              onClick={() => { onChange(p.key); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-xs text-left hover:bg-white/[0.05] ${p.text}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DateRangeField({ start, end, onChange }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!editing) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setEditing(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [editing]);

  const display = (() => {
    if (!start) return "Empty";
    try {
      const startStr = format(parseISO(start), "MMMM d, yyyy");
      if (!end || end === start) return startStr;
      const endStr = format(parseISO(end), "MMMM d, yyyy");
      return `${startStr} → ${endStr}`;
    } catch { return start; }
  })();

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setEditing(!editing)}
        className={`text-[12.5px] hover:bg-white/[0.04] rounded px-1.5 py-0.5 ${start ? "text-gray-300" : "text-gray-600"}`}
      >
        {display}
      </button>
      {editing && (
        <div className="absolute z-50 mt-1 bg-[#2d2e30] border border-white/[0.1] rounded-lg shadow-2xl p-3 min-w-[260px] space-y-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Start</label>
            <input
              type="date"
              value={start || ""}
              onChange={(e) => onChange({ start: e.target.value, end })}
              className="w-full bg-[#1e1f20] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">End</label>
            <input
              type="date"
              value={end || ""}
              min={start || undefined}
              onChange={(e) => onChange({ start, end: e.target.value })}
              className="w-full bg-[#1e1f20] border border-white/[0.08] rounded px-2 py-1 text-xs text-gray-200"
            />
          </div>
          {(start || end) && (
            <button
              onClick={() => onChange({ start: "", end: "" })}
              className="text-[10px] text-gray-500 hover:text-rose-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TextField({ value, placeholder, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");

  useEffect(() => setVal(value || ""), [value]);

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); if (val !== value) onChange(val); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.target.blur(); } if (e.key === "Escape") { setVal(value || ""); setEditing(false); } }}
        className="bg-[#1e1f20] border border-white/[0.1] rounded px-1.5 py-0.5 text-[12.5px] text-gray-200 focus:outline-none focus:border-white/[0.2]"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`text-[12.5px] text-left hover:bg-white/[0.04] rounded px-1.5 py-0.5 ${value ? "text-gray-300" : "text-gray-600"}`}
    >
      {value || placeholder}
    </button>
  );
}

export default function NotionPageView({ page, onUpdate, onDelete }) {
  const [iconOpen, setIconOpen] = useState(false);
  const [title, setTitle] = useState(page.title || "");
  const [content, setContent] = useState(page.content || "");
  const [showComment, setShowComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const saveDebounce = useRef(null);

  useEffect(() => {
    setTitle(page.title || "");
    setContent(page.content || "");
  }, [page.id]);

  const debouncedSave = useCallback((patch) => {
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(() => onUpdate(patch), 600);
  }, [onUpdate]);

  const handleTitle = (e) => {
    const v = e.target.value;
    setTitle(v);
    debouncedSave({ title: v });
  };

  const handleContent = (e) => {
    const v = e.target.value;
    setContent(v);
    debouncedSave({ content: v });
  };

  const iconCfg = ICON_MAP[page.icon] || ICON_MAP.file;
  const Icon = iconCfg.icon;

  const comments = page.comments || [];

  const addComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    const newComments = [...comments, { id: Date.now(), text, created_at: new Date().toISOString() }];
    onUpdate({ comments: newComments });
    setCommentDraft("");
    setShowComment(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#1e1f20]">
      <div className="max-w-3xl mx-auto px-12 py-12">
        {/* Icon */}
        <div className="relative mb-3">
          <button
            onClick={() => setIconOpen(!iconOpen)}
            className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors -ml-2"
          >
            <Icon className={`h-12 w-12 ${iconCfg.color}`} />
          </button>
          {iconOpen && (
            <IconPicker
              current={page.icon}
              onChange={(k) => onUpdate({ icon: k })}
              onClose={() => setIconOpen(false)}
            />
          )}
        </div>

        {/* Title */}
        <input
          value={title}
          onChange={handleTitle}
          placeholder="New page"
          className="w-full bg-transparent text-3xl font-bold text-gray-100 placeholder-gray-700 focus:outline-none mb-6"
        />

        {/* Properties */}
        <div className="border-t border-white/[0.05] pt-4 pb-2 mb-6">
          <PropertyRow icon={Type} label="Subject">
            <TextField
              value={page.subject}
              placeholder="Empty"
              onChange={(v) => onUpdate({ subject: v })}
            />
          </PropertyRow>
          <PropertyRow icon={CalendarIcon} label="Due date">
            <DateRangeField
              start={page.due_start}
              end={page.due_end}
              onChange={({ start, end }) => onUpdate({ due_start: start, due_end: end })}
            />
          </PropertyRow>
          <PropertyRow icon={Flag} label="Priority">
            <PrioritySelect
              value={page.priority || ""}
              onChange={(v) => onUpdate({ priority: v })}
            />
          </PropertyRow>
          <PropertyRow icon={Activity} label="Status">
            <StatusBadge
              value={page.status || "not_started"}
              onChange={(v) => onUpdate({ status: v })}
            />
          </PropertyRow>

          <button className="mt-3 flex items-center gap-1.5 text-[11.5px] text-gray-600 hover:text-gray-400 transition-colors">
            <Plus className="h-3 w-3" />
            Add a property
          </button>
        </div>

        {/* Comments */}
        <div className="mb-6">
          <p className="text-[12.5px] text-gray-500 mb-2 flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            Comments
          </p>
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 py-1.5 border-b border-white/[0.04]">
              <div className="h-5 w-5 rounded-full bg-blue-500/30 flex items-center justify-center text-[10px] text-blue-300 shrink-0">I</div>
              <div className="flex-1">
                <p className="text-[12.5px] text-gray-300">{c.text}</p>
                <p className="text-[10px] text-gray-600">{format(parseISO(c.created_at), "MMM d, h:mm a")}</p>
              </div>
            </div>
          ))}
          {showComment ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addComment(); if (e.key === "Escape") { setShowComment(false); setCommentDraft(""); } }}
                placeholder="Add a comment..."
                className="flex-1 bg-[#2a2b2d] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/[0.15]"
              />
              <button
                onClick={addComment}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Send
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowComment(true)}
              className="mt-2 flex items-center gap-2 w-full text-left text-[12.5px] text-gray-600 hover:text-gray-400 transition-colors py-1.5"
            >
              <div className="h-5 w-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-300/60">I</div>
              Add a comment...
            </button>
          )}
        </div>

        {/* Content / body */}
        <div className="mb-6">
          <textarea
            value={content}
            onChange={handleContent}
            placeholder="Press 'enter' to continue with an empty page, or pick a template (use ↑ and ↓ to select)"
            rows={Math.max(3, (content || "").split("\n").length)}
            className="w-full bg-transparent text-[14px] text-gray-300 placeholder-gray-700 focus:outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Bottom hint actions (Notion-style) */}
        {!content && (
          <div className="space-y-1 text-[13px] text-gray-600">
            <button className="flex items-center gap-2 w-full hover:bg-white/[0.03] px-2 py-1.5 rounded transition-colors">
              <FileText className="h-3.5 w-3.5 text-gray-500" />
              New item
            </button>
            <button className="flex items-center gap-2 w-full hover:bg-white/[0.03] px-2 py-1.5 rounded transition-colors">
              <FileText className="h-3.5 w-3.5 text-gray-500" />
              Empty
            </button>
            <button className="flex items-center gap-2 w-full hover:bg-white/[0.03] px-2 py-1.5 rounded transition-colors">
              <Plus className="h-3.5 w-3.5 text-gray-500" />
              New template
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
