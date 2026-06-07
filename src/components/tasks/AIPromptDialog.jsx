import React, { useState, useEffect } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";

export default function AIPromptDialog({ open, onClose, title, subtitle, presets = [], placeholder, onSubmit, loading }) {
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (open) setPrompt("");
  }, [open]);

  if (!open) return null;

  const handleSubmit = (override) => {
    const text = (override || prompt).trim();
    if (!text) return;
    onSubmit(text);
  };

  return (
    <div
      data-ai-dialog
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div
        className="w-full max-w-lg bg-[#1e1f20] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-gradient-to-r from-purple-500/10 to-pink-500/10">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-purple-500/25 to-pink-500/25 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-purple-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
              {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(p.prompt)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 border border-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            onKeyUp={(e) => e.stopPropagation()}
            onPaste={(e) => e.stopPropagation()}
            placeholder={placeholder || "Type your instruction..."}
            rows={3}
            disabled={loading}
            className="w-full bg-[#2a2b2d] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40 resize-none disabled:opacity-40"
          />

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600">⌘ + Enter to submit</span>
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !prompt.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {loading ? "Working..." : "Run"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
