import React, { useMemo } from "react";

// Karaoke caption: renders the text line by line and highlights the word currently
// being spoken. Driven by `idx` (the char index from the TTS boundary events / a
// time estimate). While not speaking it just shows the full text.
export default function SpokenCaption({ text, idx = 0, speaking = false }) {
  const lines = useMemo(() => {
    if (!text) return [];
    const out = [];
    const re = /[^.?!]*[.?!]+|\S[^.?!]*$/g; // sentence-ish chunks with their offsets
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width matches
      const chunk = m[0];
      if (!chunk.trim()) continue;
      const start = m.index;
      const words = [];
      const wre = /\S+/g;
      let wm;
      while ((wm = wre.exec(chunk)) !== null) words.push({ text: wm[0], start: start + wm.index });
      out.push({ start, end: start + chunk.length, words });
    }
    return out;
  }, [text]);

  if (!lines.length) return null;

  // Active word = the last word whose start index is at/behind the cursor.
  let activeStart = -1;
  if (speaking) {
    for (const ln of lines) for (const w of ln.words) if (w.start <= idx) activeStart = w.start;
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      {lines.map((ln, li) => {
        const past = speaking && idx >= ln.end;
        const current = speaking && idx >= ln.start && idx < ln.end;
        const opacity = !speaking ? "opacity-100" : current ? "opacity-100" : past ? "opacity-40" : "opacity-55";
        return (
          <p key={li} className={`text-center text-sm leading-snug transition-opacity duration-200 ${opacity}`}>
            {ln.words.map((w, wi) => (
              <span
                key={wi}
                className={w.start === activeStart ? "rounded bg-cyan-400/25 px-0.5 font-semibold text-cyan-100" : "text-gray-100"}
              >
                {w.text}{wi < ln.words.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
