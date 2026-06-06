export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { text, instruction, mode } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text required" });

    let systemPrompt;
    if (mode === "reorganize") {
      systemPrompt = `You are a document organizer. Take the user's notes and produce a clean, well-structured HTML document.

RULES:
- Output ONLY HTML body content, no <html>/<body> tags, no markdown code fences.
- Use proper headings (<h1>, <h2>, <h3>), <p>, <ul><li>, <ol><li>, <strong>, <em>, <blockquote>, <hr> as appropriate.
- Group related ideas under headings.
- Convert clearly-list-like things into bullets or numbered lists.
- Convert action items into a task list using <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>task</p></div></li></ul>
- Preserve the user's voice and content — DO NOT invent new facts. You may rephrase for clarity.
- Trim filler words and redundancy.
- Output should be at most 1.5x the input length.

NOTES:
${text.substring(0, 8000)}

OUTPUT HTML ONLY:`;
    } else if (mode === "summarize") {
      systemPrompt = `Summarize the user's notes into a concise, well-formatted HTML document.

RULES:
- Output ONLY HTML body content.
- Start with a brief 1-2 sentence overview (in a <p>).
- Use <h2> for key sections and <ul><li> for bullet points.
- Keep it tight: ~30% of original length.
- End with an "Action items" section as a task list IF any are present.

NOTES:
${text.substring(0, 8000)}

OUTPUT HTML ONLY:`;
    } else if (mode === "expand") {
      systemPrompt = `Expand the user's brief notes into a more detailed, well-written HTML document.

RULES:
- Output ONLY HTML body content.
- Flesh out each bullet/idea into a real paragraph with context.
- Add reasonable headings to organize the expansion.
- Stay faithful to the original intent — don't add facts the user didn't imply.
- Output should be 2-3x the input length.

NOTES:
${text.substring(0, 4000)}

OUTPUT HTML ONLY:`;
    } else {
      // Custom instruction
      systemPrompt = `You are a writing assistant. Apply the user's instruction to their document.

INSTRUCTION: ${instruction || "improve clarity and structure"}

RULES:
- Output ONLY HTML body content (no markdown, no code fences, no explanation).
- Use semantic HTML: <h1>/<h2>/<h3>, <p>, <ul><li>, <ol><li>, <strong>, <em>, <blockquote>.
- For task lists use: <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>task</p></div></li></ul>
- Preserve the user's intent and voice.

DOCUMENT:
${text.substring(0, 8000)}

OUTPUT HTML ONLY:`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.3,
        max_tokens: 6000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return res.status(500).json({ error: "AI request failed" });
    }

    const data = await response.json();
    let html = data.choices?.[0]?.message?.content || "";
    // Strip ```html and ``` fences if present
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    return res.status(200).json({ html });
  } catch (err) {
    console.error("aiEditDoc error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
