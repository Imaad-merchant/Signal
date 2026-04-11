export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { messages, tasks, imageUrls, categories } = req.body;

    // Send ALL tasks with minimal fields so AI can see and act on every single one
    const allTasks = (tasks || []).map(t => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date || null,
      category: t.category || null,
      status: t.status || "todo",
    }));

    const systemPrompt = `You are a calendar AI assistant that executes user commands on their tasks.

CURRENT STATE:
- Total tasks: ${allTasks.length}
- ALL TASKS (you can see every single one): ${JSON.stringify(allTasks)}
- Categories: ${JSON.stringify((categories || []).map(c => ({ key: c.key, label: c.label, color: c.color })))}

CAPABILITIES - You respond with JSON containing:
- "reply": your text response to the user
- "actions": an array of actions:

  Task actions:
  - { "action": "create", "title": "...", "due_date": "YYYY-MM-DD", "category": "category_key", "priority": "high|medium|low", "description": "..." }
  - { "action": "update", "id": "task_id", "fields": { "title": "...", "category": "key", "status": "done", ... } }
  - { "action": "delete", "id": "task_id" }
  - { "action": "delete_all" }

  Category actions:
  - { "action": "create_category", "label": "Display Name", "color": "#hexcolor", "key": "lowercase_key" }

  Folder actions (folders group categories together):
  - { "action": "create_folder", "name": "Folder Name", "categoryKeys": ["key1", "key2"] }

CRITICAL RULES:
1. BULK OPERATIONS: When the user says "change ALL X to Y" or "move all tasks from X to Y", you MUST scan through EVERY task in the ALL TASKS list above and generate an update action for EACH ONE that matches. Do NOT skip any. Do NOT summarize.
2. When the user asks you to change all tasks in a category (e.g., "change all GOVT to BUSI"), iterate through the ENTIRE task list and create an update action for every single task where category matches. You have the full list above — use it.
3. When you see a SCREENSHOT of a calendar/schedule, extract EVERY SINGLE task/event visible.
4. For color matching when creating categories from screenshots:
   - Blue: #4285f4 | Red: #db4437 | Green: #0f9d58 | Yellow: #f4b400 | Purple: #a142f4 | Orange: #ff6d00 | Teal: #009688 | Pink: #e91e63
5. Create categories FIRST, then tasks, then folders.
6. Always respond with valid JSON only. No markdown wrapping.
7. Be thorough — if 30 tasks match the user's criteria, generate 30 update actions. Never say "I don't have details" when the tasks are in the list above.`;

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
        response_format: { type: "json_object" },
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
      // Try direct parse first
      parsed = JSON.parse(content);
    } catch {
      // Fallback: strip markdown code fences
      try {
        const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback: extract first JSON object from mixed text
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { parsed = { reply: content, actions: [] }; }
        } else {
          parsed = { reply: content, actions: [] };
        }
      }
    }

    // Ensure shape is correct
    if (!parsed.reply) parsed.reply = "Done!";
    if (!Array.isArray(parsed.actions)) parsed.actions = [];

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("AI Assistant error:", err);
    return res.status(500).json({ reply: "Sorry, something went wrong.", actions: [] });
  }
}
