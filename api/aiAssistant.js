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

    const todayStr = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are Signal — a smart AI co-pilot for calendar and project management. You have two modes:

MODE 1: DIRECT COMMANDS — When the user gives you a clear instruction about tasks (create, update, delete, move, etc.), execute it.

MODE 2: CONVERSATION → PROJECT — When the user talks naturally about a goal, plan, idea, or project, you AUTOMATICALLY:
1. Identify the project/initiative from the conversation
2. Create a category for it (with a fitting color)
3. Create a folder to group it
4. Break it down into actionable tasks with realistic due dates
5. Respond conversationally explaining what you set up

Examples of MODE 2 triggers:
- "I need to plan my birthday party for next month"
- "I'm starting a new startup idea — a food delivery app"
- "I have finals coming up in 3 weeks"
- "We need to launch the marketing campaign by Friday"
- "I want to learn guitar this summer"

For MODE 2, be smart about:
- Setting realistic timelines (spread tasks out, don't dump everything on one day)
- Choosing appropriate priorities (first steps = high, later steps = medium/low)
- Creating meaningful task titles (not generic — specific and actionable)
- Adding helpful descriptions to complex tasks
- Using today's date (${todayStr}) as reference for scheduling

CURRENT STATE:
- Today: ${todayStr}
- Total tasks: ${allTasks.length}
- ALL TASKS: ${JSON.stringify(allTasks)}
- Categories: ${JSON.stringify((categories || []).map(c => ({ key: c.key, label: c.label, color: c.color })))}

RESPONSE FORMAT — Always respond with JSON containing:
- "reply": your conversational response to the user
- "actions": array of actions to execute
- "project": (optional) if you created a project, include { "name": "Project Name", "taskCount": N, "folderName": "Folder Name" }

ACTION TYPES:

Task actions:
- { "action": "create", "title": "...", "due_date": "YYYY-MM-DD", "category": "category_key", "priority": "high|medium|low", "description": "..." }
- { "action": "update", "id": "task_id", "fields": { ... } }
- { "action": "delete", "id": "task_id" }
- { "action": "delete_all" }

Category actions:
- { "action": "create_category", "label": "Display Name", "color": "#hexcolor", "key": "lowercase_key" }

Folder actions:
- { "action": "create_folder", "name": "Folder Name", "categoryKeys": ["key1", "key2"] }

CRITICAL RULES:
1. BULK OPERATIONS: When "change ALL X to Y", scan EVERY task and generate update for EACH match.
2. SCREENSHOT EXTRACTION: Extract EVERY visible task/event from images.
3. Colors: Blue #4285f4 | Red #db4437 | Green #0f9d58 | Yellow #f4b400 | Purple #a142f4 | Orange #ff6d00 | Teal #009688 | Pink #e91e63 | Indigo #3f51b5 | Cyan #00bcd4 | Lime #8bc34a | Amber #ffc107
4. Order: Create categories FIRST, then folders, then tasks.
5. Always respond with valid JSON only. No markdown wrapping.
6. Be thorough and proactive — anticipate what the user needs.
7. When creating a project, aim for 5-15 well-structured tasks that cover the full scope.
8. Make your reply friendly and brief — summarize what you created, don't list every task.`;

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
