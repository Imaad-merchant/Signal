import React, { useState, useEffect, useRef } from "react";
import { Sunrise, Moon } from "lucide-react";
import CheckInModal from "./CheckInModal";
import { getChicagoParts, slotKeyOf, getStoredCheckinKey, setStoredCheckinKey } from "./checkinUtils";

// Single launch point for the daily check-in: a top-bar button with a "due" dot,
// plus auto-open-once-per-slot behavior. Self-contained so Dashboard only mounts one node.
export default function CheckInLauncher() {
  const [open, setOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  // Current Chicago slot/date, and whether this slot has already been shown.
  const [{ slot, currentKey }, setState] = useState(() => {
    const { slot, dateKey } = getChicagoParts();
    return { slot, currentKey: slotKeyOf(dateKey, slot) };
  });
  const [shownKey, setShownKey] = useState(() => getStoredCheckinKey());

  const due = shownKey !== currentKey;
  const SlotIcon = slot === "evening" ? Moon : Sunrise;

  // Auto-prompt once per slot/day (dismissible). Marking shown clears the dot and
  // prevents a re-open on refresh; the manual button always works regardless.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    // Recompute in case the component mounted right at a slot boundary.
    const { slot: s, dateKey } = getChicagoParts();
    const key = slotKeyOf(dateKey, s);
    setState({ slot: s, currentKey: key });
    const stored = getStoredCheckinKey();
    setShownKey(stored);
    if (stored !== key) {
      autoOpenedRef.current = true;
      setStoredCheckinKey(key);
      setShownKey(key);
      setOpen(true);
    }
  }, []);

  const handleCompleted = () => {
    // Persist completion as the shown key too (defensive; modal already does this).
    setStoredCheckinKey(currentKey);
    setShownKey(currentKey);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-blue-300 transition-colors"
        title="Daily check-in"
        aria-label="Daily check-in"
      >
        <SlotIcon className="h-5 w-5" />
        {due && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-400 ring-2 ring-[#232425]" />
        )}
      </button>
      <CheckInModal open={open} onOpenChange={setOpen} onCompleted={handleCompleted} />
    </>
  );
}
