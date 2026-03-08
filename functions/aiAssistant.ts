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

    // Always fetch tasks fresh from DB for the current user
    const freshTasks = await base44.entities.Task.filter({ created_by: user.email }, "-due_date", 50);

    // Sort by due_date ascending
    const sortedTasks = freshTasks
      .slice()
      .sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1);
    const tasksJson = JSON.stringify(
      sortedTasks.slice(0, 50).map(t => ({ id: t.id, title: t.title, due_date: t.due_date, status: t.status, category: t.category, priority: t.priority }))
    );

    // Fetch all categories (some may have been created by service role)
    const fetchedCategories = await base44.asServiceRole.entities.Category.list();
    const catList = fetchedCategories.length > 0 ? fetchedCategories : [];
    const categoryList = catList.length > 0
      ? catList.map(c => `  - Label: "${c.label}", Key: "${c.key}"`).join("\n")
      : "  - Label: \"Work\", Key: \"work\"\n  - Label: \"Personal\", Key: \"personal\"";
    const categoryEnum = catList.length > 0
      ? catList.map(c => c.key).join("|")
      : "work|personal";

    const systemPrompt = `You are a smart, friendly calendar & task management AI assistant. Today's date is ${today} and the current time is ${currentTime} (America/Chicago).

The user's current tasks (JSON):
${tasksJson}

Available categories (Label → Key mapping):
${categoryList}

CRITICAL CATEGORY RULES:
1. The "Key" is what goes in the database — use the EXACT key value (e.g. "fa", not "FA" or "Finance").
2. When the user mentions a category by any name or abbreviation, find the closest matching Label in the list above and use its Key.
3. NEVER invent a new category key. NEVER use a capitalized or modified version of the key.
4. Only use create_category if the user explicitly says "create a new category" AND no existing category matches their intent.

Your job is to understand what the user wants and return BOTH a friendly reply AND a list of actions.

Valid actions:
- create: { action: "create", title, due_date (YYYY-MM-DD), category (${categoryEnum}), priority (low|medium|high), description? }
- create_category: { action: "create_category", label, color (hex code like #FF5733), key }
- update: { action: "update", id, fields: { due_date?, title?, status?, category?, priority?, description? } }
- delete: { action: "delete", id }
- delete_all: { action: "delete_all" } — use this when user wants to delete ALL tasks at once, instead of listing individual deletes

If the user is just ASKING A QUESTION (e.g., "What do I have due tomorrow?", "How many tasks do I have?"), answer in the reply field and return an empty actions array []. Do NOT create or modify anything for read-only queries.

Priority synonyms — map these to the correct enum value:
- "urgent", "critical", "ASAP", "important" → high
- "normal", "regular", "moderate" → medium
- "minor", "trivial", "whenever", "not important", "low priority" → low

IMPORTANT FOR CATEGORY CHANGES: When the user asks to change tasks to a specific category (e.g., "change these to FA" or "put under FA"), FIRST look at the available categories list above and find the matching key. Use the update action with that existing key. NEVER create a new category if one already exists with a matching name or abbreviation.

Only use create_category if the user explicitly asks to CREATE a new category that does not exist in the available categories list.

Always respond with valid JSON only (no markdown blocks):
{
  "reply": "Your friendly message here",
  "actions": [ ...actions ]
}

CRITICAL FOR CALENDAR IMAGES: If an image of a calendar is attached, carefully read EVERY visible event on the calendar. Look at each cell/day and extract ALL event titles you can see, along with the exact date from the calendar grid. Create a task for each event with the correct due_date (YYYY-MM-DD). The calendar shown is for the year/month visible in the image header. Read truncated text as best you can and include it. Do not skip any events.

CRITICAL FOR CATEGORY ASSIGNMENT:
- Match the user's words to the closest Label in the available categories list, then use that Label's exact Key (lowercase, as listed).
- If the user says "FA", look for a Label like "FA" or "Financial Aid" etc., and use its Key exactly as written.
- If the user asks to move/change EXISTING tasks to a category, use the update action for each task ID and set category to the matched exact Key.
- NEVER use a modified, capitalized, or invented key. The key must come directly from the list above.

Be proactive, helpful, and conversational. Keep replies concise.`;

    // Build OpenAI messages
    const oaiMessages = [{ role: "system", content: systemPrompt }];

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

    // Attach current turn images
    if (imageUrls?.length > 0) {
      const last = oaiMessages[oaiMessages.length - 1];
      if (last.role === "user") {
        const parts = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
        for (const url of imageUrls) parts.push({ type: "image_url", image_url: { url, detail: "high" } });
        oaiMessages[oaiMessages.length - 1] = { role: "user", content: parts };
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: oaiMessages,
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const raw = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      // If JSON parse fails, return a safe fallback with the raw text as reply
      parsed = { reply: raw || "I couldn't process that. Please try again.", actions: [] };
    }
    if (!parsed.reply) parsed.reply = "Done!";
    if (!Array.isArray(parsed.actions)) parsed.actions = [];

    // Process create_category actions FIRST, so they're available for task assignments
    if (parsed.actions?.length > 0) {
      const createCategoryActions = parsed.actions.filter(a => a.action === "create_category");
      for (const act of createCategoryActions) {
        if (act.label && act.color && act.key) {
          await base44.asServiceRole.entities.Category.create({ label: act.label, color: act.color, key: act.key });
        }
      }
    }

    return Response.json(parsed);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});