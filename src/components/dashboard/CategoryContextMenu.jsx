import React, { useRef } from "react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuTrigger, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Pencil, Palette, Trash2 } from "lucide-react";

export default function CategoryContextMenu({ cat, onRename, onSaveColor, onDelete, children }) {
  const colorRef = useRef(null);

  return (
    <>
      <input
        ref={colorRef}
        type="color"
        defaultValue={cat.color}
        className="sr-only absolute"
        onChange={(e) => onSaveColor(e.target.value)}
      />
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="bg-[#2d2e30] border-white/10 text-gray-200 w-44">
          <ContextMenuItem
            onClick={onRename}
            className="flex items-center gap-2 text-sm focus:bg-white/10 focus:text-white cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={(e) => { e.preventDefault(); setTimeout(() => colorRef.current?.click(), 0); }}
            className="flex items-center gap-2 text-sm focus:bg-white/10 focus:text-white cursor-pointer"
          >
            <Palette className="h-3.5 w-3.5" />
            Change Color
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-white/10" />
          <ContextMenuItem
            onClick={onDelete}
            className="flex items-center gap-2 text-sm text-red-400 focus:bg-white/10 focus:text-red-300 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}