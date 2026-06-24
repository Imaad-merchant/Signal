import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAutosave } from "./useAutosave";
import RichTextEditor from "./RichTextEditor";

// Detect if content is HTML (vs. plain text / markdown from older docs)
function isLikelyHTML(s) {
  if (!s) return false;
  const trimmed = s.trim();
  return /^<[a-z][\s\S]*>/i.test(trimmed) && /<\/[a-z]/i.test(trimmed);
}

// Convert plain markdown / text to minimal HTML so old docs open gracefully
function legacyToHTML(s) {
  if (!s) return "";
  if (isLikelyHTML(s)) return s;
  const lines = s.split("\n");
  return lines.map(line => {
    const t = line.trimStart();
    if (/^# /.test(t)) return `<h1>${t.slice(2)}</h1>`;
    if (/^## /.test(t)) return `<h2>${t.slice(3)}</h2>`;
    if (/^### /.test(t)) return `<h3>${t.slice(4)}</h3>`;
    if (/^- \[ \] /.test(t)) return `<p>☐ ${t.slice(6)}</p>`;
    if (/^- \[x\] /i.test(t)) return `<p>☑ ${t.slice(6)}</p>`;
    if (/^[-*] /.test(t)) return `<p>• ${t.slice(2)}</p>`;
    if (t === "") return `<p></p>`;
    // Inline bold/italic minimal conversion
    let html = t
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    return `<p>${html}</p>`;
  }).join("");
}

export default function DocumentView({ page, onSave, onAIVisualize, onAIEdit }) {
  const [html, setHtml] = useState(() => legacyToHTML(page.content || ""));
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Bound to THIS document's id (component is keyed per page.id), so a flush after
  // a page switch still writes to the right document.
  const save = useCallback((patch) => onSave(page.id, patch), [onSave, page.id]);
  const { schedule } = useAutosave(500);

  useEffect(() => {
    setHtml(legacyToHTML(page.content || ""));
    loadedRef.current = true;
  }, [page.id]);

  const handleChange = useCallback((newHtml) => {
    setHtml(newHtml);
    if (!loadedRef.current) return;
    schedule({ content: newHtml }, save);
  }, [schedule, save]);

  const handleAIEdit = useCallback(async (mode, currentHtml, instruction) => {
    const newHtml = await onAIEdit?.(mode, currentHtml, instruction);
    if (newHtml) {
      if (mountedRef.current) setHtml(newHtml);
      save({ content: newHtml }); // immediate; bound to this page even post-switch
    }
  }, [onAIEdit, save]);

  return (
    <RichTextEditor
      value={html}
      onChange={handleChange}
      placeholder="Start writing..."
      onAIVisualize={onAIVisualize}
      onAIEdit={onAIEdit ? handleAIEdit : undefined}
    />
  );
}
