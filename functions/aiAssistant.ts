import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import OpenAI from 'npm:openai';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages, imageUrls } = await req.json();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

    // ---------- Step 1: Smart keyword extraction (Two-Step Context) ----------
    const latestUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    let keywords = [];

    if (latestUserMsg.length > 10 && !imageUrls?.length) {
      try {
        const kwRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: 'Extract 3-6 short search keywords (nouns/task names) from the user request. For broad listing queries like "what do I have this week", return empty. JSON: {"keywords": ["word1"]}' },
            { role: "user", content: latestUserMsg }
          ],
          response_format: { type: "json_object" },
          max_tokens: 80,
        });
        const kwParsed = JSON.parse(kwRes.choices[0].message.content);
        keywords = Array.isArray(kwParsed.keywords) ? kwParsed.keywords.map(k => k.toLowerCase()) : [];
      } catch (_) { keywords = []; }
    }

    // ---------- Step 2: Fetch tasks and filter by keywords ----------
    const allTasks = await base44.asServiceRole.entities.Task.filter({ created_by: user.email }, "-due_date", 200);
    const sorted = allTasks.sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1);

    let contextTasks;
    if (keywords.length > 0) {
      const matched = sorted.filter(t =>
        keywords.some(kw =>
          (t.title || '').toLowerCase().includes(kw) ||
          (t.description || '').toLowerCase().includes(kw) ||
          (t.category || '').toLowerCase().includes(kw)
        )
      );
      const matchedIds = new Set(matched.map(m => m.id));
      const upcoming = sorted.filter(t => (t.due_date || '') >= today && !matchedIds.has(t.id)).slice(0, 25);
      contextTasks = [...matched, ...upcoming].slice(0, 80);
    } else {
      contextTasks = sorted.slice(0, 80);
    }

    const tasksJson = JSON.stringify(
      contextTasks.map(t => ({ id: t.id, title: t.title, due_date: t.due_date, status: t.status, category: t.category, priority: t.priority }))
    );

    // ---------- UserPreferences ----------
    let userPrefsText = "";
    try {
      const prefs = await base44.asServiceRole.entities.UserPreferences.filter({ user_email: user.email }, "-created_date", 1);
      if (prefs.length > 0 && prefs[0].preferences) {
        userPrefsText = `\nUser preferences (apply these automatically):\n${prefs[0].preferences}\n`;
      }
    } catch (_) {}

    // ---------- Categories ----------
    const fetchedCategories = await base44.entities.Category.filter({}, "-created_date", 100);
    const catList = fetchedCategories.length > 0 ? fetchedCategories : [];
    const categoryKeys = catList.length > 0 ? catList.map(c => c.key) : ["work", "personal"];
    const categoryList = catList.length > 0
      ? catList.map(c => `  - Label: "${c.label}", Key: "${c.key}"`).join("\n")
      : '  - Label: "Work", Key: "work"\n  - Label: "Personal", Key: "personal"';

    // ---------- System prompt ----------
    const systemPrompt = `You are a smart calendar & task management assistant. Today is ${today}, time: ${currentTime} (America/Chicago).
${userPrefsText}
User's tasks:
${tasksJson}

Available categories (use EXACT Key value only):
${categoryList}

Action field rules — populate ONLY relevant fields, set all others to null:
- create: title, due_date (YYYY-MM-DD), category (exact key), priority, description; id/label/color/key = null
- update: id + only changed fields; unchanged fields = null
- delete: id only; all others = null
- delete_all: all fields = null
- create_category: label, color (hex), key (simple lowercase slug); others = null — ONLY when user explicitly asks

THOUGHT PROCESS: Before deciding on actions, briefly explain your reasoning in thought_process (1-2 sentences). This helps you choose the right category, priority, and date.
For read-only questions, return empty actions [].
CALENDAR IMAGES: Extract ALL visible events with exact dates and create a task for each.`;

    // ---------- Few-Shot Examples ----------
    const exampleCat = categoryKeys[0] || "work";
    const fewShotMessages = [
      { role: "user", content: `Add dentist appointment for ${tomorrowStr}` },
      {
        role: "assistant", content: JSON.stringify({
          reply: "Done! Dentist appointment added.",
          actions: [{ action: "create", id: null, title: "Dentist appointment", due_date: tomorrowStr, category: exampleCat, priority: "medium", description: null, status: null, label: null, color: null, key: null }]
        })
      },
      { role: "user", content: "Mark my gym session as done" },
      {
        role: "assistant", content: JSON.stringify({
          reply: "Marked your gym session as complete!",
          actions: [{ action: "update", id: "EXAMPLE_ID", title: null, due_date: null, category: null, priority: null, description: null, status: "done", label: null, color: null, key: null }]
        })
      },
      { role: "user", content: "What tasks do I have this week?" },
      {
        role: "assistant", content: JSON.stringify({
          reply: "Here's what you have this week: [lists based on context]",
          actions: []
        })
      }
    ];

    // ---------- Structured Output Schema (100% reliable) ----------
    const responseSchema = {
      name: "task_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          thought_process: { type: "string" },
          reply: { type: "string" },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["create", "update", "delete", "delete_all", "create_category"] },
                id:          { anyOf: [{ type: "string" }, { type: "null" }] },
                title:       { anyOf: [{ type: "string" }, { type: "null" }] },
                due_date:    { anyOf: [{ type: "string" }, { type: "null" }] },
                category:    { anyOf: [{ type: "string" }, { type: "null" }] },
                priority:    { anyOf: [{ type: "string", enum: ["low", "medium", "high"] }, { type: "null" }] },
                description: { anyOf: [{ type: "string" }, { type: "null" }] },
                status:      { anyOf: [{ type: "string", enum: ["todo", "in_progress", "done"] }, { type: "null" }] },
                label:       { anyOf: [{ type: "string" }, { type: "null" }] },
                color:       { anyOf: [{ type: "string" }, { type: "null" }] },
                key:         { anyOf: [{ type: "string" }, { type: "null" }] }
              },
              required: ["action", "id", "title", "due_date", "category", "priority", "description", "status", "label", "color", "key"],
              additionalProperties: false
            }
          }
        },
        required: ["thought_process", "reply", "actions"],
        additionalProperties: false
      }
    };

    // ---------- Build messages ----------
    const oaiMessages = [
      { role: "system", content: systemPrompt },
      ...fewShotMessages
    ];

    for (const msg of messages) {
      if (msg.role === "user") {
        const contentParts = [];
        if (msg.content) contentParts.push({ type: "text", text: msg.content });
        if (msg.imageUrls?.length > 0) {
          for (const url of msg.imageUrls) {
            contentParts.push({ type: "image_url", image_url: { url, detail: "high" } });
          }
        }
        oaiMessages.push({ role: "user", content: contentParts.length === 1 && contentParts[0].type === "text" ? msg.content : contentParts });
      } else {
        oaiMessages.push({ role: "assistant", content: msg.content });
      }
    }

    if (imageUrls?.length > 0) {
      const last = oaiMessages[oaiMessages.length - 1];
      if (last.role === "user") {
        const parts = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
        for (const url of imageUrls) parts.push({ type: "image_url", image_url: { url, detail: "high" } });
        oaiMessages[oaiMessages.length - 1] = { role: "user", content: parts };
      }
    }

    // ---------- OpenAI call with Structured Outputs ----------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: oaiMessages,
      response_format: { type: "json_schema", json_schema: responseSchema },
      max_tokens: 4000,
    });

    const message = completion.choices[0].message;
    if (message.refusal) {
      return Response.json({ reply: "I couldn't process that request. Please try rephrasing.", actions: [] });
    }

    const parsed = JSON.parse(message.content);

    // ---------- Transform flat schema → frontend-expected format ----------
    const transformedActions = parsed.actions.map(act => {
      if (act.action === "update") {
        const fields = {};
        if (act.title !== null)       fields.title = act.title;
        if (act.due_date !== null)    fields.due_date = act.due_date;
        if (act.category !== null)    fields.category = act.category;
        if (act.priority !== null)    fields.priority = act.priority;
        if (act.description !== null) fields.description = act.description;
        if (act.status !== null)      fields.status = act.status;
        return { action: "update", id: act.id, fields };
      }
      if (act.action === "create") {
        return { action: "create", title: act.title, due_date: act.due_date, category: act.category, priority: act.priority, description: act.description };
      }
      if (act.action === "delete")         return { action: "delete", id: act.id };
      if (act.action === "delete_all")     return { action: "delete_all" };
      if (act.action === "create_category") return { action: "create_category", label: act.label, color: act.color, key: act.key };
      return act;
    });

    // Process create_category actions first
    for (const act of transformedActions.filter(a => a.action === "create_category")) {
      if (act.label && act.color && act.key) {
        await base44.entities.Category.create({ label: act.label, color: act.color, key: act.key });
      }
    }

    return Response.json({ reply: parsed.reply, actions: transformedActions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});