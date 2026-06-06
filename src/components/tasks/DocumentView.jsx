import React, { useState, useEffect, useRef, useCallback } from "react";
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

export default function DocumentView({ page, onUpdate, onAIVisualize }) {
  const [html, setHtml] = useState(() => legacyToHTML(page.content || ""));
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);
  const lastSavedRef = useRef(html);

  useEffect(() => {
    setHtml(legacyToHTML(page.content || ""));
    lastSavedRef.current = legacyToHTML(page.content || "");
    loadedRef.current = true;
  }, [page.id]);

  const handleChange = useCallback((newHtml) => {
    setHtml(newHtml);
    if (!loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (newHtml !== lastSavedRef.current) {
        lastSavedRef.current = newHtml;
        onUpdate({ content: newHtml });
      }
    }, 600);
  }, [onUpdate]);

  return (
    <RichTextEditor
      value={html}
      onChange={handleChange}
      placeholder="Start writing..."
      onAIVisualize={onAIVisualize}
    />
  );
}
