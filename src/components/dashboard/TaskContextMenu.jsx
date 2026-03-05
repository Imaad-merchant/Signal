import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Pencil, Trash2, Tag, Check } from "lucide-react";

const CATEGORIES = ["work", "personal", "health", "learning", "creative"];
const categoryColors = {
  work: "#4285f4",
  personal: "#a142f4",
  health: "#0f9d58",
  learning: "#f4b400",
  creative: "#db4437",
};

export default function TaskContextMenu({ task, position, onClose, onUpdated }) {
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(task.title);
  const [showCategories, setShowCategories] = useState(false);
  const menuRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.focus();
  }, [renaming]);

  const handleRename = async () => {
    if (newTitle.trim() && newTitle !== task.title) {
      await base44.entities.Task.update(task.id, { title: newTitle.trim() });
      onUpdated();
    }
    onClose();
  };

  const handleDelete = async () => {
    await base44.entities.Task.delete(task.id);
    onUpdated();
    onClose();
  };

  const handleCategory = async (cat) => {
    await base44.entities.Task.update(task.id, { category: cat });
    onUpdated();
    onClose();
  };

  // Keep menu inside viewport
  const style = {
    position: "fixed",
    top: Math.min(position.y, window.innerHeight - 260),
    left: Math.min(position.x, window.innerWidth - 200),
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="w-48 bg-[#2d2e30] border border-white/15 rounded-xl shadow-2xl overflow-hidden text-sm"
    >
      {/* Task title header */}
      <div className="px-3 py-2 border-b border-white/10">
        <p className="text-xs text-gray-400 truncate">{task.title}</p>
      </div>

      {renaming ? (
        <div className="p-2">
          <input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") onClose(); }}
            className="w-full bg-[#1e1f20] border border-white/20 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleRename}
            className="mt-1.5 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg py-1.5 transition-colors"
          >
            Save
          </button>
        </div>
      ) : showCategories ? (
        <div className="p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategory(cat)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-white/10 text-gray-300 transition-colors capitalize"
            >
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColors[cat] }} />
              {cat}
              {task.category === cat && <Check className="h-3 w-3 ml-auto text-blue-400" />}
            </button>
          ))}
          <button
            onClick={() => setShowCategories(false)}
            className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors text-left"
          >
            ← Back
          </button>
        </div>
      ) : (
        <div className="p-1">
          <button
            onClick={() => setRenaming(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-white/10 text-gray-300 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" /> Rename
          </button>
          <button
            onClick={() => setShowCategories(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-white/10 text-gray-300 transition-colors"
          >
            <Tag className="h-3.5 w-3.5" /> Change Category
          </button>
          <div className="border-t border-white/10 my-1" />
          <button
            onClick={handleDelete}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}