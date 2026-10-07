import { verifyAuth } from "./_auth.js";
import { callLLM, llmConfigured } from "./_llm.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!llmConfigured()) return res.status(500).json({ error: "LLM not configured (ANTHROPIC_API_KEY)" });

  try {
    const { text, instruction, mode } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text required" });

    let systemPrompt;
    let userText;
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

OUTPUT HTML ONLY.`;
      userText = `NOTES:\n${text.substring(0, 8000)}`;
    } else if (mode === "summarize") {
      systemPrompt = `Summarize the user's notes into a concise, well-formatted HTML document.

RULES:
- Output ONLY HTML body content.
- Start with a brief 1-2 sentence overview (in a <p>).
- Use <h2> for key sections and <ul><li> for bullet points.
- Keep it tight: ~30% of original length.
- End with an "Action items" section as a task list IF any are present.

OUTPUT HTML ONLY.`;
      userText = `NOTES:\n${text.substring(0, 8000)}`;
    } else if (mode === "expand") {
      systemPrompt = `Expand the user's brief notes into a more detailed, well-written HTML document.

RULES:
- Output ONLY HTML body content.
- Flesh out each bullet/idea into a real paragraph with context.
- Add reasonable headings to organize the expansion.
- Stay faithful to the original intent — don't add facts the user didn't imply.
- Output should be 2-3x the input length.

OUTPUT HTML ONLY.`;
      userText = `NOTES:\n${text.substring(0, 4000)}`;
    } else {
      // Custom instruction
      systemPrompt = `You are a writing assistant. Apply the user's instruction to their document.

INSTRUCTION: ${instruction || "improve clarity and structure"}

RULES:
- Output ONLY HTML body content (no markdown, no code fences, no explanation).
- Use semantic HTML: <h1>/<h2>/<h3>, <p>, <ul><li>, <ol><li>, <strong>, <em>, <blockquote>.
- For task lists use: <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>task</p></div></li></ul>
- Preserve the user's intent and voice.

OUTPUT HTML ONLY.`;
      userText = `DOCUMENT:\n${text.substring(0, 8000)}`;
    }

    let html;
    try {
      html = await callLLM({ system: systemPrompt, user: userText, maxTokens: 6000 });
    } catch (err) {
      console.error("aiEditDoc LLM error:", err.message);
      return res.status(500).json({ error: "AI request failed" });
    }
    // Strip ```html and ``` fences if present
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    return res.status(200).json({ html });
  } catch (err) {
    console.error("aiEditDoc error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
