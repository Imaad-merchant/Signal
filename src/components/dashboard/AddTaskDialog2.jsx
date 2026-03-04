import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { ListTodo, Loader2 } from "lucide-react";

const CATEGORIES = ["work", "personal", "health", "learning", "creative"];
const PRIORITIES = ["low", "medium", "high"];

export default function AddTaskDialog2({ open, onOpenChange, onAdded }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    due_date: "",
    category: "work",
    priority: "medium",
    estimated_minutes: "",
  });
  const [saving, setSaving] = useState(false);
  const accentColor = localStorage.getItem("pulse_secondary") || "#f59e0b";

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    await base44.entities.Task.create({
      ...form,
      estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : undefined,
      status: "todo",
    });
    setSaving(false);
    onAdded?.();
    onOpenChange(false);
    setForm({ title: "", description: "", due_date: "", category: "work", priority: "medium", estimated_minutes: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ListTodo className="h-4 w-4" style={{ color: accentColor }} />
            Add Task
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <Input
            placeholder="Task title *"
            value={form.title}
            onChange={e => set("title", e.target.value)}
            className="rounded-xl"
            autoFocus
          />
          <Input
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => set("description", e.target.value)}
            className="rounded-xl"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Due Date</label>
              <Input
                type="date"
                value={form.due_date}
                onChange={e => set("due_date", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Est. Minutes</label>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={form.estimated_minutes}
                onChange={e => set("estimated_minutes", e.target.value)}
                className="rounded-xl"
                min={1}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Category</label>
              <select
                value={form.category}
                onChange={e => set("category", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Priority</label>
              <select
                value={form.priority}
                onChange={e => set("priority", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-xl">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !form.title.trim()}
              className="flex-1 rounded-xl gap-2 text-white"
              style={{ backgroundColor: accentColor }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}