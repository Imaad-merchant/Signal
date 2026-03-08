import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { ListTodo, Loader2 } from "lucide-react";
import { useIsMobile } from "@/components/useIsMobile";

const CATEGORIES = ["work", "personal", "health", "learning", "creative"];
const PRIORITIES = ["low", "medium", "high"];
const EMPTY = { title: "", description: "", due_date: "", category: "work", priority: "medium", estimated_minutes: "" };

function TaskForm2({ form, set, onSubmit, onClose, saving, accentColor }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input placeholder="Task title *" value={form.title} onChange={e => set("title", e.target.value)}
        className="rounded-xl h-11 bg-[#2d2e30] border-white/10 text-gray-100 placeholder:text-gray-600" autoFocus />
      <Input placeholder="Description (optional)" value={form.description} onChange={e => set("description", e.target.value)}
        className="rounded-xl h-11 bg-[#2d2e30] border-white/10 text-gray-100 placeholder:text-gray-600" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Due Date</label>
          <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} className="rounded-xl h-11 bg-[#2d2e30] border-white/10 text-gray-100" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Est. Minutes</label>
          <Input type="number" placeholder="e.g. 30" value={form.estimated_minutes} onChange={e => set("estimated_minutes", e.target.value)} className="rounded-xl h-11 bg-[#2d2e30] border-white/10 text-gray-100 placeholder:text-gray-600" min={1} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Category</label>
          <Select value={form.category} onValueChange={v => set("category", v)}>
            <SelectTrigger className="rounded-xl h-11 bg-[#2d2e30] border-white/10 text-gray-100"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Priority</label>
          <Select value={form.priority} onValueChange={v => set("priority", v)}>
            <SelectTrigger className="rounded-xl h-11 bg-[#2d2e30] border-white/10 text-gray-100"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-1 pb-1">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl h-11 border-white/10 text-gray-300">Cancel</Button>
        <Button type="submit" disabled={saving || !form.title.trim()} className="flex-1 rounded-xl h-11 gap-2 text-white" style={{ backgroundColor: accentColor }}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Add Task
        </Button>
      </div>
    </form>
  );
}

export default function AddTaskDialog2({ open, onOpenChange, onAdded }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  const accentColor = localStorage.getItem("pulse_secondary") || "#f59e0b";
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    await base44.entities.Task.create({ ...form, estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : undefined, status: "todo" });
    setSaving(false);
    onAdded?.();
    onOpenChange(false);
    setForm(EMPTY);
  };

  const formProps = { form, set, onSubmit: handleSubmit, onClose: () => onOpenChange(false), saving, accentColor };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-[#1e1f20] border-white/10">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-gray-100">
              <ListTodo className="h-4 w-4" style={{ color: accentColor }} />
              Add Task
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <TaskForm2 {...formProps} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#1e1f20] border-white/10 text-gray-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-100">
            <ListTodo className="h-4 w-4" style={{ color: accentColor }} />
            Add Task
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <TaskForm2 {...formProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}