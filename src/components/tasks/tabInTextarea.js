// Tab inside a plain textarea inserts a tab character instead of moving focus;
// Shift+Tab removes the tab just before the caret. Goes through execCommand so
// React's onChange fires and native undo keeps working, with a manual fallback.
function setNative(el, value, caret) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function handleTextareaTab(e) {
  if (e.key !== "Tab" || e.altKey || e.metaKey || e.ctrlKey) return false;
  e.preventDefault();
  const el = e.currentTarget;
  const { selectionStart: start, selectionEnd: end, value } = el;
  if (e.shiftKey) {
    if (start === end && start > 0 && value[start - 1] === "\t") {
      el.setSelectionRange(start - 1, start);
      let ok = false;
      try { ok = document.execCommand("delete", false); } catch { ok = false; }
      if (!ok) setNative(el, value.slice(0, start - 1) + value.slice(start), start - 1);
    }
    return true;
  }
  let ok = false;
  try { ok = document.execCommand("insertText", false, "\t"); } catch { ok = false; }
  if (!ok) setNative(el, value.slice(0, start) + "\t" + value.slice(end), start + 1);
  return true;
}
