import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { useIsMobile } from "@/components/useIsMobile";

const EMPTY_FORM = { title: "", description: "", priority: "medium", category: "work", estimated_minutes: "", due_date: "" };

const HIGH_PRIORITY_KEYWORDS = /\b(exam|test|quiz|midterm|final|payment|bill|rent|tuition|fee|due|deadline|submission|application)\b/i;

function autoDetectPriority(title) {
  return HIGH_PRIORITY_KEYWORDS.test(title) ? "high" : null;
}

function TaskForm({ form, setForm, onSubmit, onCancel, saving }) {
  const handleTitleChange = (e) => {
    const title = e.target.value;
    const detected = autoDetectPriority(title);
    if (detected && form.priority === "medium") {
      setForm({ ...form, title, priority: detected });
    } else {
      setForm({ ...form, title });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-1">
      <div>
        <Label className="text-xs text-gray-400">Title</Label>
        <Input
          value={form.title}
          onChange={handleTitleChange}
          placeholder="What needs to be done?"
          className="mt-1 bg-[#2d2e30] border-white/10 text-gray-100 placeholder:text-gray-600 h-11"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-400">Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Add details..."
          className="mt-1 h-20 resize-none bg-[#2d2e30] border-white/10 text-gray-100 placeholder:text-gray-600"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">Priority</Label>
          <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
            <SelectTrigger className="mt-1 h-11 bg-[#2d2e30] border-white/10 text-gray-100"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-400">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="mt-1 h-11 bg-[#2d2e30] border-white/10 text-gray-100"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="work">Work</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="health">Health</SelectItem>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="creative">Creative</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">Est. Minutes</Label>
          <Input type="number" value={form.estimated_minutes} onChange={(e) => setForm({ ...form, estimated_minutes: e.target.value })} placeholder="30" className="mt-1 h-11 bg-[#2d2e30] border-white/10 text-gray-100 placeholder:text-gray-600" />
        </div>
        <div>
          <Label className="text-xs text-gray-400">Due Date</Label>
          <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1 h-11 bg-[#2d2e30] border-white/10 text-gray-100" />
        </div>
      </div>
      <div className="flex gap-2 pb-1">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11 border-white/10 text-gray-300">Cancel</Button>
        <Button type="submit" disabled={saving} className="flex-1 h-11 bg-gray-100 text-gray-900 hover:bg-white rounded-xl">
          {saving ? "Creating..." : "Create Task"}
        </Button>
      </div>
    </form>
  );
}

export default function AddTaskDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    await base44.entities.Task.create({ ...form, estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : undefined });
    setSaving(false);
    setForm(EMPTY_FORM);
    onOpenChange(false);
    onCreated();
  };

  const formProps = { form, setForm, onSubmit: handleSubmit, onCancel: () => onOpenChange(false), saving };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-[#1e1f20] border-white/10">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-gray-100">New Task</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <TaskForm {...formProps} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#1e1f20] border-white/10 text-gray-100">
        <DialogHeader>
          <DialogTitle className="text-gray-100">New Task</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <TaskForm {...formProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}