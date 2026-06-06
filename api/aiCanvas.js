export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { prompt, existingObjects, mode } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: "Prompt required" });

    const ctx = (existingObjects || []).map(o => {
      const b = boundsOf(o);
      return { id: o.id, type: o.type, ...b, text: (o.text || "").substring(0, 60) };
    });

    let task;
    if (mode === "reorganize") {
      task = `REORGANIZE the existing canvas. Move and align objects into a clean layout (mind map / flowchart / grid / aligned columns / tidy rows), keeping all existing objects but updating their x/y (and optionally w/h). You may add connector arrows/lines between related objects.

Return a JSON object:
{ "actions": [
    { "action": "move", "id": "<existing id>", "x": NUM, "y": NUM, "w": NUM?, "h": NUM? },
    { "action": "add", "object": { ...new object with type, x, y, w, h, color, etc... } }
  ] }`;
    } else {
      task = `CREATE NEW OBJECTS to fulfill the user's prompt. Build a clean PowerPoint-style diagram, chart, flow, hierarchy, table, or whatever fits.

Return a JSON object:
{ "actions": [
    { "action": "add", "object": { ...new object... } }
  ] }`;
    }

    const systemPrompt = `You are a whiteboard AI for an infinite-canvas app. The user can ask you to draw diagrams, flowcharts, mind maps, tables, charts, building blocks, kanban boards, timelines, comparison columns, or any visual structure using shapes + text + arrows.

CANVAS:
- World coordinates, origin (0,0) at top-left
- Aim layout to fit roughly 1200 x 800
- Existing objects (read-only, you may move them but keep their ids): ${JSON.stringify(ctx).substring(0, 3000)}

SHAPE TYPES (all support color, strokeWidth, opacity, and fill where filled):
- rect, roundedRect: { type, x, y, w, h, color, strokeWidth, fill, opacity }
- ellipse: { type, x, y, w, h, ... }
- triangle, diamond, star: { type, x, y, w, h, ... }
- line, arrow: { type, x1, y1, x2, y2, color, strokeWidth }
- text: { type, x, y, w, h, text (HTML ok: <b>, <i>, <u>), color, fontSize (14-48), fontFamily, textAlign }

VISUAL DESIGN:
- Use distinct colors to encode meaning (blue=primary, green=positive, amber=warning, red=critical, purple=special).
- Light fill with matching stroke: e.g., color="#3b82f6", fill="rgba(59,130,246,0.15)".
- Group related items in colored boxes with text labels inside or above.
- Arrows for flow, lines for relationships.
- Aim for 8-30 objects total. Make it look intentional and pretty.

USER PROMPT:
${prompt}

${task}

JSON ONLY. No markdown, no explanation.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.4,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return res.status(500).json({ error: "AI request failed" });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"actions":[]}';

    let parsed;
    try { parsed = JSON.parse(content); }
    catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { actions: [] };
    }
    if (!Array.isArray(parsed.actions)) parsed.actions = [];

    // Assign ids to new objects
    parsed.actions = parsed.actions.map((a, i) => {
      if (a.action === "add" && a.object && !a.object.id) {
        a.object.id = `ai_${Date.now()}_${i}`;
      }
      return a;
    });

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("aiCanvas error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

function boundsOf(o) {
  switch (o.type) {
    case "text":
    case "rect":
    case "ellipse":
    case "triangle":
    case "diamond":
    case "roundedRect":
    case "star":
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    case "line":
    case "arrow":
      return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    case "path":
      return { x: 0, y: 0, w: 0, h: 0 };
    default:
      return {};
  }
}
