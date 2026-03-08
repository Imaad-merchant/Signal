import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import OpenAI from 'npm:openai';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages, tasks, imageUrls, categories } = await req.json();

    const today = new Date().toISOString().slice(0, 10);
    // Limit tasks to last 50 to keep prompt small and fast
    const tasksJson = JSON.stringify(
      (tasks || []).slice(0, 50).map(t => ({ id: t.id, title: t.title, due_date: t.due_date, status: t.status, category: t.category, priority: t.priority }))
    );

    // Build category list for the AI with colors
    const categoryList = (categories || [])
      .map(c => `${c.label} (${c.key}, color: ${c.color})`)
      .join("; ") || "work, personal, health, learning, creative";
    const categoryEnum = (categories || []).map(c => c.key).join("|") || "work|personal|health|learning|creative";

    const systemPrompt = `You are a smart, friendly calendar & task management AI assistant. Today's date is ${today}.

The user's current tasks (JSON):
${tasksJson}

Available categories: ${categoryList}

Your job is to understand what the user wants and return BOTH a friendly reply AND a list of actions.

Valid actions:
- create: { action: "create", title, due_date (YYYY-MM-DD), category (${categoryEnum}), priority (low|medium|high), description? }
- create_category: { action: "create_category", label, color (hex code like #FF5733), key }
- update: { action: "update", id, fields: { due_date?, title?, status?, category?, priority?, description? } }
- delete: { action: "delete", id }
- delete_all: { action: "delete_all" } — use this when user wants to delete ALL tasks at once, instead of listing individual deletes

IMPORTANT FOR CATEGORY CHANGES: When the user asks to change tasks to a specific category (e.g., "change these to FA" or "put under FA"), FIRST look at the available categories list above and find the matching key. Use the update action with that existing key. NEVER create a new category if one already exists with a matching name or abbreviation.

Only use create_category if the user explicitly asks to CREATE a new category that does not exist in the available categories list.

Always respond with valid JSON only (no markdown blocks):
{
  "reply": "Your friendly message here",
  "actions": [ ...actions ]
}

CRITICAL FOR CALENDAR IMAGES: If an image of a calendar is attached, carefully read EVERY visible event on the calendar. Look at each cell/day and extract ALL event titles you can see, along with the exact date from the calendar grid. Create a task for each event with the correct due_date (YYYY-MM-DD). The calendar shown is for the year/month visible in the image header. Read truncated text as best you can and include it. Do not skip any events.

CRITICAL FOR CATEGORY ASSIGNMENT:
- If the user mentions a category at ANY point in the conversation (e.g. "put under FA", "FA category", "these are work"), assign ALL newly created tasks to that category key. Match their words to the closest key in the available categories (e.g. "FA" -> "fa", "financial" -> "fa", etc.).
- If the user asks to move/change EXISTING tasks to a category (e.g. "put all these events under FA"), use the update action for each matching task ID from the current tasks list and set category to the matched key.
- NEVER ignore a category instruction. Always match to the closest available category key.

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
    const parsed = JSON.parse(raw);

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