import { useRef, useEffect, useCallback } from "react";

// Debounced autosave that never drops the last edit.
//
// schedule(patch, save) captures the EXACT save target at call time. `save` is
// bound to a specific page id by the caller, so a pending write can never be
// misrouted to a different page after the user switches pages.
//
// flush() snapshots-and-clears `pending` BEFORE writing, so firing it from
// visibilitychange + pagehide + unmount (which can all happen on one PWA close)
// is idempotent — the 2nd/3rd call sees nothing pending and no-ops.
//
// collectExtra() (optional) lets an editor inject not-yet-committed UI state —
// e.g. text typed into a contentEditable that hasn't been flushed into React
// state yet — by synchronously reading the DOM at flush time and returning
// { patch, save } to merge over the pending write.
export function useAutosave(delay = 500, collectExtra) {
  const pending = useRef(null); // { patch, save } | null
  const timer = useRef(null);
  const extraRef = useRef(collectExtra);
  useEffect(() => { extraRef.current = collectExtra; });

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    let p = pending.current;
    pending.current = null; // clear before writing so a re-entrant flush no-ops
    try {
      const extra = extraRef.current && extraRef.current();
      if (extra && extra.patch) {
        p = { patch: { ...((p && p.patch) || {}), ...extra.patch }, save: extra.save || (p && p.save) };
      }
    } catch { /* ignore */ }
    if (p && p.save && p.patch && Object.keys(p.patch).length) {
      try { p.save(p.patch); } catch { /* ignore */ }
    }
  }, []);

  const schedule = useCallback((patch, save) => {
    // Save target changed (e.g. an in-place editor switched pages) → write the
    // previous target first so its edit isn't clobbered by the new one.
    if (pending.current && pending.current.save !== save) {
      const old = pending.current;
      pending.current = null;
      if (old.save && old.patch && Object.keys(old.patch).length) {
        try { old.save(old.patch); } catch { /* ignore */ }
      }
    }
    pending.current = {
      patch: { ...((pending.current && pending.current.patch) || {}), ...patch },
      save,
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [delay, flush]);

  useEffect(() => {
    // Commit onBlur-gated fields (e.g. a focused input) before flushing.
    const blurActive = () => {
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch { /* ignore */ }
    };
    // Order matters: flush() first captures editors that read the live DOM in
    // collectExtra (e.g. an in-progress whiteboard text box). Then blur commits
    // onBlur-gated inputs (e.g. a focused text field), which schedule a write.
    // A second flush() persists that.
    const exit = () => { flush(); blurActive(); flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") exit(); };
    const onPageHide = () => exit();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flush(); // unmount (incl. page switch on keyed editors) → flush pending
    };
  }, [flush]);

  return { schedule, flush };
}
