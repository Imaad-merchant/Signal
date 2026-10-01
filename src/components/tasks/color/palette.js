// Shared color palette for the document editor and the whiteboard.
// Laid out Google-Docs style: a grey ramp, then ten hues from light tint to deep shade.
export const PALETTE_COLS = 10;

export const PALETTE = [
  // greys (light → dark)
  "#ffffff", "#f3f4f6", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#374151", "#1f2937", "#111827", "#000000",
  // tints
  "#fecaca", "#fed7aa", "#fef08a", "#d9f99d", "#bbf7d0", "#a5f3fc", "#bfdbfe", "#c7d2fe", "#e9d5ff", "#fbcfe8",
  // light
  "#fca5a5", "#fdba74", "#fde047", "#bef264", "#86efac", "#67e8f9", "#93c5fd", "#a5b4fc", "#d8b4fe", "#f9a8d4",
  // base
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
  // deep
  "#b91c1c", "#c2410c", "#a16207", "#4d7c0f", "#15803d", "#0e7490", "#1d4ed8", "#4338ca", "#7e22ce", "#be185d",
  // darkest
  "#7f1d1d", "#7c2d12", "#713f12", "#365314", "#14532d", "#164e63", "#1e3a8a", "#312e81", "#581c87", "#831843",
];

// Default picks for the three picker kinds.
export const DEFAULT_TEXT_COLOR = "#e5e7eb";
export const DEFAULT_HIGHLIGHT_COLOR = "#fef08a";
