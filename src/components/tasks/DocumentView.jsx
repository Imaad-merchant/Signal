import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Eye, Edit3 } from "lucide-react";

export default function DocumentView({ page, onUpdate }) {
  const [content, setContent] = useState(page.content || "");
  const [mode, setMode] = useState("edit"); // edit | preview
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    setContent(page.content || "");
    setMode("edit");
    loadedRef.current = true;
  }, [page.id]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate({ content });
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [content, onUpdate]);

  return (
    <div className="flex-1 flex flex-col bg-[#1a1b1c] overflow-hidden">
      {/* Mode toggle */}
      <div className="flex items-center justify-end gap-1 px-4 py-1.5 border-b border-white/[0.05]">
        <div className="flex items-center bg-[#252628] border border-white/[0.06] rounded-lg p-0.5">
          <button
            onClick={() => setMode("edit")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors ${mode === "edit" ? "bg-blue-500/20 text-blue-300" : "text-gray-500 hover:text-gray-300"}`}
          >
            <Edit3 className="h-3 w-3" /> Edit
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors ${mode === "preview" ? "bg-blue-500/20 text-blue-300" : "text-gray-500 hover:text-gray-300"}`}
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          {mode === "edit" ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing... markdown supported"
              className="w-full bg-transparent text-[14px] text-gray-200 placeholder-gray-700 focus:outline-none resize-none font-mono leading-relaxed"
              style={{ minHeight: "60vh" }}
            />
          ) : (
            <div className="prose prose-invert prose-sm max-w-none text-gray-200 prose-headings:text-gray-100 prose-strong:text-gray-100 prose-code:text-blue-300 prose-code:bg-white/[0.05] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-blue-400 prose-blockquote:border-l-blue-500/40 prose-blockquote:text-gray-400">
              {content ? (
                <ReactMarkdown>{content}</ReactMarkdown>
              ) : (
                <p className="text-gray-700 italic text-sm">Nothing to preview yet — switch to Edit mode and start writing.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
