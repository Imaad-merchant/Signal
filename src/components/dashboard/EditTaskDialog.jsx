import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Check, Loader2 } from "lucide-react";

const PRIORITIES = ["low", "medium", "high"];
const STATUSES = ["todo", "in_progress", "done"];

export default function EditTaskDialog({ task, categories, onClose, onUpdated }) {
  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    category: task.category || "work",
    priority: task.priority || "medium",
    status: task.status || "todo",
    due_date: task.due_date || "",
    estimated_minutes: task.estimated_minutes || "",
  });
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved
  const debounceRef = useRef(null);
  const isFirstRender = useRef(true);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const doSave = async (data) => {
    if (!data.title.trim()) return;
    setSaveStatus("saving");
    const payload = {
      ...data,
      estimated_minutes: data.estimated_minutes ? Number(data.estimated_minutes) : undefined,
    };
    await base44.entities.Task.update(task.id, payload);
    onUpdated();
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(form), 800);
    return () => clearTimeout(debounceRef.current);
  }, [form]);

  const handleDelete = async () => {
    await base44.entities.Task.delete(task.id);
    onUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onMouseDown={onClose}>
      <div
        className="w-full max-w-md bg-[#2d2e30] border border-white/15 rounded-2xl shadow-2xl p-6 space-y-4"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-100">Edit Task</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Title</label>
          <input
            autoFocus
            value={form.title}
            onChange={e => set("title", e.target.value)}
            className="w-full bg-[#1e1f20] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Description</label>
          <textarea
            value={form.description}
            onChange={e => set("description", e.target.value)}
            rows={2}
            className="w-full bg-[#1e1f20] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
          />
        </div>

        {/* Row: Category + Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Category</label>
            <select
              value={form.category}
              onChange={e => set("category", e.target.value)}
              className="w-full bg-[#1e1f20] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-white/30"
            >
              {categories.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Priority</label>
            <select
              value={form.priority}
              onChange={e => set("priority", e.target.value)}
              className="w-full bg-[#1e1f20] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-white/30"
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Row: Status + Due Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Status</label>
            <select
              value={form.status}
              onChange={e => set("status", e.target.value)}
              className="w-full bg-[#1e1f20] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-white/30"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => set("due_date", e.target.value)}
              className="w-full bg-[#1e1f20] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        {/* Estimated minutes */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Estimated Minutes</label>
          <input
            type="number"
            min={0}
            value={form.estimated_minutes}
            onChange={e => set("estimated_minutes", e.target.value)}
            placeholder="e.g. 30"
            className="w-full bg-[#1e1f20] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
          >
            Delete task
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}