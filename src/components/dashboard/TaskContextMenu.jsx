import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Pencil, Trash2, Tag, Check, Edit2 } from "lucide-react";
import EditTaskDialog from "./EditTaskDialog";

export default function TaskContextMenu({ task, position, onClose, onUpdated, categories = [] }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const menuRef = useRef();

  const categoryColors = Object.fromEntries(categories.map(c => [c.key, c.color]));

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Reposition menu to stay within viewport after it renders
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 8;
    let x = position.x;
    let y = position.y;

    // If menu overflows right edge, flip left
    if (x + rect.width + padding > window.innerWidth) {
      x = Math.max(padding, window.innerWidth - rect.width - padding);
    }
    // If menu overflows bottom edge, flip up
    if (y + rect.height + padding > window.innerHeight) {
      y = Math.max(padding, window.innerHeight - rect.height - padding);
    }

    setAdjustedPos({ x, y });
  }, [position, showCategories]);

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

  const style = {
    position: "fixed",
    top: adjustedPos.y,
    left: adjustedPos.x,
    zIndex: 9999,
  };

  if (showEdit) {
    return (
      <EditTaskDialog
        task={task}
        categories={categories}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    );
  }

  return (
    <div
      ref={menuRef}
      style={style}
      className="w-48 bg-[#2d2e30] border border-white/15 rounded-xl shadow-2xl overflow-hidden text-sm"
    >
      <div className="px-3 py-2 border-b border-white/10">
        <p className="text-xs text-gray-400 truncate">{task.title}</p>
      </div>

      {showCategories ? (
        <div className="p-1">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategory(cat.key)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-white/10 text-gray-300 transition-colors capitalize"
            >
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              {cat.label}
              {task.category === cat.key && <Check className="h-3 w-3 ml-auto text-blue-400" />}
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
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-white/10 text-gray-300 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" /> Edit
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