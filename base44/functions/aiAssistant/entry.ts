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
    const allTasks = await base44.asServiceRole.entities.Task.filter({ created_by: user.email }, "-due_date", 500);
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
      const upcoming = sorted.filter(t => (t.due_date || '') >= today && !matchedIds.has(t.id)).slice(0, 50);
      contextTasks = [...matched, ...upcoming].slice(0, 150);
    } else {
      contextTasks = sorted.slice(0, 150);
    }

    const tasksJson = JSON.stringify(
      contextTasks.map(t => ({ id: t.id, title: t.title, due_date: t.due_date, status: t.status, category: t.category, priority: t.priority, description: t.description || null, estimated_minutes: t.estimated_minutes || null }))
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
    const systemPrompt = `You are an expert AI calendar & task management assistant with deep scheduling intelligence. Today is ${today}, time: ${currentTime} (America/Chicago). Tomorrow is ${tomorrowStr}.
${userPrefsText}
User's tasks:
${tasksJson}

Available categories (use EXACT Key value only):
${categoryList}

Action field rules — populate ONLY relevant fields, set all others to null:
- create: title, due_date (YYYY-MM-DD), category (exact key), priority, description, estimated_minutes; id/label/color/key = null
- update: id + only changed fields; unchanged fields = null
- delete: id only; all others = null
- delete_all: all fields = null
- create_category: label, color (hex), key (simple lowercase slug); others = null — ONLY when user explicitly asks

## CORE CAPABILITIES
You are highly capable at complex scheduling tasks. You can:

1. **Bulk editing**: Change multiple tasks at once (e.g., "move all my work tasks to next week", "mark everything due today as high priority")
2. **Smart reorganization**: When asked to reorganize, rebalance, or optimize a schedule, analyze the full task list and redistribute tasks across dates to create a balanced workload. Consider priority, category, and due dates.
3. **Conflict resolution**: Detect when too many tasks are on one day and suggest or automatically spread them out.
4. **Batch rescheduling**: Handle requests like "push everything back 2 days", "clear Friday and move those to Monday".
5. **Smart defaults**: When creating tasks, infer reasonable due dates, categories, and priorities from context if not specified.
6. **Multi-step operations**: For complex requests, break them into multiple actions. For example, "swap the dates of task A and task B" requires two update actions.
7. **Date math**: Understand "next Monday", "end of week", "in 3 days", "this weekend", etc. Always resolve to YYYY-MM-DD.
8. **Prioritization**: When asked to prioritize or rank tasks, update their priority fields and optionally reorder due dates so high-priority items come first.

## RESPONSE GUIDELINES
- THOUGHT PROCESS: Before deciding on actions, explain your reasoning in thought_process (2-4 sentences). Analyze what the user wants, which tasks are affected, and your strategy.
- For read-only questions, return empty actions [] but give a thorough, helpful answer.
- When reorganizing, explain your reasoning in the reply (e.g., "I spread your 8 Monday tasks across Mon-Wed to keep each day manageable").
- Be proactive: if you notice issues (overloaded days, missed deadlines), mention them.
- CALENDAR IMAGES: Extract ALL visible events with exact dates and create a task for each.
- For ambiguous requests, make your best judgment and explain what you did so the user can undo if needed.

## AUTO-PRIORITY RULES (always apply when creating/updating tasks)
- Payments, bills, rent, tuition, fees, subscriptions due → always HIGH priority
- Exams, tests, quizzes, midterms, finals → always HIGH priority
- Deadlines, submissions, applications → always HIGH priority
- Meetings, appointments → MEDIUM priority unless specified otherwise
- These rules apply automatically even if the user doesn't mention priority.`;

    // ---------- Few-Shot Examples ----------
    const exampleCat = categoryKeys[0] || "work";
    const fewShotMessages = [
      { role: "user", content: `Add dentist appointment for ${tomorrowStr}` },
      {
        role: "assistant", content: JSON.stringify({
          thought_process: "User wants a new dentist appointment for tomorrow. I'll use medium priority and the first available category.",
          reply: "Done! Dentist appointment added for tomorrow.",
          actions: [{ action: "create", id: null, title: "Dentist appointment", due_date: tomorrowStr, category: exampleCat, priority: "medium", description: null, status: null, estimated_minutes: null, label: null, color: null, key: null }]
        })
      },
      { role: "user", content: "Mark my gym session as done" },
      {
        role: "assistant", content: JSON.stringify({
          thought_process: "User wants to mark gym session as complete. I'll update the status to done.",
          reply: "Marked your gym session as complete!",
          actions: [{ action: "update", id: "EXAMPLE_ID", title: null, due_date: null, category: null, priority: null, description: null, status: "done", estimated_minutes: null, label: null, color: null, key: null }]
        })
      },
      { role: "user", content: "Reorganize my week — I have too much on Monday" },
      {
        role: "assistant", content: JSON.stringify({
          thought_process: "User has too many tasks on Monday. I need to look at Monday's tasks and spread some to Tue/Wed/Thu to balance the load. I'll keep high-priority items on Monday and move medium/low ones later.",
          reply: "I've rebalanced your week! Moved 3 lower-priority tasks from Monday to Tuesday and Wednesday. Monday now has 4 tasks (down from 7), and your high-priority items stay put.",
          actions: [
            { action: "update", id: "TASK_1", title: null, due_date: "2025-01-07", category: null, priority: null, description: null, status: null, estimated_minutes: null, label: null, color: null, key: null },
            { action: "update", id: "TASK_2", title: null, due_date: "2025-01-08", category: null, priority: null, description: null, status: null, estimated_minutes: null, label: null, color: null, key: null },
            { action: "update", id: "TASK_3", title: null, due_date: "2025-01-08", category: null, priority: null, description: null, status: null, estimated_minutes: null, label: null, color: null, key: null }
          ]
        })
      },
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
                estimated_minutes: { anyOf: [{ type: "number" }, { type: "null" }] },
                label:       { anyOf: [{ type: "string" }, { type: "null" }] },
                color:       { anyOf: [{ type: "string" }, { type: "null" }] },
                key:         { anyOf: [{ type: "string" }, { type: "null" }] }
              },
              required: ["action", "id", "title", "due_date", "category", "priority", "description", "status", "estimated_minutes", "label", "color", "key"],
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
      model: "gpt-4o",
      messages: oaiMessages,
      response_format: { type: "json_schema", json_schema: responseSchema },
      max_tokens: 8000,
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
        if (act.estimated_minutes !== null) fields.estimated_minutes = act.estimated_minutes;
        return { action: "update", id: act.id, fields };
      }
      if (act.action === "create") {
        const data = { title: act.title, due_date: act.due_date, category: act.category, priority: act.priority, description: act.description };
        if (act.estimated_minutes !== null) data.estimated_minutes = act.estimated_minutes;
        return { action: "create", ...data };
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