export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { notes, style } = req.body;
    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: "Notes required" });
    }

    const systemPrompt = `You are a visualization assistant. Transform the user's notes into a PowerPoint-style visual layout for an infinite whiteboard canvas.

Your job: convert plain text into a clean, well-organized diagram using shapes, arrows, text labels, and where appropriate flow charts, mind maps, hierarchies, building-block diagrams, simple tables, or bar/column chart skeletons.

CANVAS SYSTEM:
- World coordinates, origin (0, 0) at top-left
- Aim for a layout that fits roughly 1200 x 800 (centered around 0–1200, 0–800)
- Leave breathing room between elements (16-40px gaps)
- Stack related groups; use rows for sequences, columns for hierarchies
- Pick a STYLE that fits the content: "mindmap" / "flowchart" / "buildingblocks" / "kanban" / "process" / "compare" / "timeline"

AVAILABLE OBJECT TYPES (you may use any combination):
- { "type": "rect", "x", "y", "w", "h", "color": "#hex", "strokeWidth": 2, "fill": "#hex or transparent", "opacity": 1 }
- { "type": "roundedRect", "x", "y", "w", "h", "color", "strokeWidth", "fill", "opacity" }
- { "type": "ellipse", "x", "y", "w", "h", "color", "strokeWidth", "fill", "opacity" }
- { "type": "triangle", "x", "y", "w", "h", "color", "strokeWidth", "fill", "opacity" }
- { "type": "diamond", "x", "y", "w", "h", "color", "strokeWidth", "fill", "opacity" }
- { "type": "star", "x", "y", "w", "h", "color", "strokeWidth", "fill", "opacity" }
- { "type": "line", "x1", "y1", "x2", "y2", "color", "strokeWidth" }
- { "type": "arrow", "x1", "y1", "x2", "y2", "color", "strokeWidth" }
- { "type": "text", "x", "y", "w", "h", "text": "HTML allowed: <b>, <i>, <u>, <br>", "color": "#hex", "fontSize": 14-48, "fontFamily": "Inter, sans-serif", "textAlign": "left|center|right" }

VISUAL GUIDELINES:
- Use distinct colors to encode meaning (blue for primary, green for success/positive, amber for warning, red for negative, purple for special)
- Title at top (large bold text)
- Group items in colored boxes with light fills (e.g., color="#3b82f6", fill="rgba(59,130,246,0.15)")
- Use arrows for flow/causation, lines for connections
- For hierarchies: parent at top, children below, arrows pointing from parent to child
- For mind maps: central node, satellites around it, lines connecting
- For lists/processes: rounded rectangles in a row or column with arrows between
- For comparison: parallel columns
- For "building blocks": stacked rounded rectangles like Lego bricks
- For timelines: horizontal line with milestones as circles + dates underneath
- For tables: a grid of rectangles with header row darker

COLORS PALETTE (use these or similar):
- Backgrounds (light fills): rgba(59,130,246,0.15), rgba(16,185,129,0.15), rgba(245,158,11,0.15), rgba(239,68,68,0.15), rgba(139,92,246,0.15)
- Strokes (matching solid): #3b82f6, #10b981, #f59e0b, #ef4444, #8b5cf6, #ec4899
- Text colors: #e5e7eb (default), #f3f4f6 (titles), #9ca3af (subtle)

RESPOND with JSON ONLY:
{
  "title": "Short title (will become page title)",
  "style": "mindmap|flowchart|...",
  "objects": [ ... array of objects above ... ]
}

NOTES TO VISUALIZE:
${(notes || "").substring(0, 4000)}

Aim for 10–40 objects. Make it look intentional and pretty. NO extra prose, NO markdown — JSON only.`;

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
    const content = data.choices?.[0]?.message?.content || '{"objects":[]}';

    let parsed;
    try { parsed = JSON.parse(content); }
    catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { objects: [] };
    }

    if (!Array.isArray(parsed.objects)) parsed.objects = [];
    // Add ids to objects
    parsed.objects = parsed.objects.map((o, i) => ({ id: `viz_${Date.now()}_${i}`, ...o }));
    if (!parsed.title) parsed.title = "Visual Notes";
    if (!parsed.style) parsed.style = "diagram";

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("visualizeNotes error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
