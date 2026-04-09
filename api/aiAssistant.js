export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { messages, tasks, imageUrls, categories } = req.body;

    const systemPrompt = `You are a powerful calendar AI assistant that can create tasks, categories, and organize them into folders.

CURRENT STATE:
- Existing tasks: ${JSON.stringify((tasks || []).map(t => ({ id: t.id, title: t.title, due_date: t.due_date, category: t.category, status: t.status })), null, 1)}
- Existing categories: ${JSON.stringify((categories || []).map(c => ({ key: c.key, label: c.label, color: c.color })))}

CAPABILITIES - You respond with JSON containing:
- "reply": your text response to the user
- "actions": an array of actions:

  Task actions:
  - { "action": "create", "title": "...", "due_date": "YYYY-MM-DD", "category": "category_key", "priority": "high|medium|low", "description": "..." }
  - { "action": "update", "id": "task_id", "fields": { "title": "...", "status": "done", ... } }
  - { "action": "delete", "id": "task_id" }
  - { "action": "delete_all" }

  Category actions:
  - { "action": "create_category", "label": "Display Name", "color": "#hexcolor", "key": "lowercase_key" }

  Folder actions (folders group categories together):
  - { "action": "create_folder", "name": "Folder Name", "categoryKeys": ["key1", "key2"] }

IMPORTANT RULES:
1. When the user shows you a SCREENSHOT of a calendar/schedule, extract EVERY SINGLE task/event visible. Do not skip any.
2. Look carefully at dates, task titles, category labels, and colors in the screenshot.
3. When creating categories, match the EXACT colors you see. Common color mappings:
   - Blue: #4285f4
   - Red/Coral: #db4437 or #ea4335
   - Green: #0f9d58 or #34a853
   - Yellow/Amber: #f4b400 or #fbbc05
   - Purple: #a142f4 or #9c27b0
   - Orange: #ff6d00 or #e67c73
   - Teal: #009688
   - Pink: #e91e63
4. Create categories FIRST, then tasks that reference those categories, then folders to group them.
5. For folder organization, group related categories together (e.g., all class categories in a "Spring Classes" folder).
6. Be thorough — if you see 50+ tasks, create all 50+. Never summarize or skip tasks.
7. Always respond with valid JSON only. No markdown wrapping.
8. Set max_tokens high enough to include all tasks. If there are many tasks, include ALL of them.`;

    const openaiMessages = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of (messages || [])) {
      const content = [];
      if (msg.content) content.push({ type: "text", text: msg.content });
      if (msg.imageUrls?.length) {
        for (const url of msg.imageUrls) {
          content.push({ type: "image_url", image_url: { url, detail: "high" } });
        }
      }
      openaiMessages.push({
        role: msg.role,
        content: content.length === 1 && content[0].type === "text" ? content[0].text : content,
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: openaiMessages,
        temperature: 0.3,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return res.status(500).json({ reply: "Sorry, AI processing failed. Please try again.", actions: [] });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"reply": "Sorry, I couldn\'t process that.", "actions": []}';

    let parsed;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { reply: content, actions: [] };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("AI Assistant error:", err);
    return res.status(500).json({ reply: "Sorry, something went wrong.", actions: [] });
  }
}
