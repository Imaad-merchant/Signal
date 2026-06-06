export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { pages } = req.body;
    const slim = (pages || []).map(p => ({
      id: p.id,
      title: p.title || "Untitled",
      parent_id: p.parent_id || null,
      subject: p.subject || "",
      status: p.status || "not_started",
      priority: p.priority || "",
    }));

    const systemPrompt = `You are a page-organization assistant. Given a flat list of pages with titles, group related ones together by setting parent_id.

RULES:
1. Identify pages that belong to the same project, topic, or theme.
2. For each topical cluster of 2 or more related pages, designate ONE as the parent (most generic / overarching title), and set the others' parent_id to that page's id.
3. If a cluster has no obvious parent in the list, you may create a new folder page by emitting a "create_folder" action and then "set_parent" actions pointing the cluster's pages to the new folder.
4. DO NOT touch pages that are already well-organized (already have a logical parent_id) unless you're regrouping them.
5. Do NOT change titles, content, or any other fields — only parenting.
6. Prefer LESS changes. If pages are already reasonable, return an empty actions array.
7. Pages whose title is empty/Untitled should NOT become folders.

CURRENT PAGES:
${JSON.stringify(slim, null, 2)}

RESPOND with JSON ONLY:
{
  "reasoning": "Brief 1-sentence explanation of grouping logic",
  "actions": [
    { "action": "set_parent", "pageId": "<id>", "newParentId": "<id or null>" },
    { "action": "create_folder", "tempId": "folder_1", "title": "Folder Name", "icon": "folder" }
  ]
}

If creating folders, the "tempId" will be used in subsequent set_parent actions as the newParentId. Process create_folder actions before set_parent actions.

If no organization is needed, return: { "reasoning": "Pages are already well-organized", "actions": [] }`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return res.status(500).json({ error: "AI request failed", actions: [] });
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
    if (!parsed.reasoning) parsed.reasoning = "Organized pages";

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("organizePages error:", err);
    return res.status(500).json({ error: "Server error", actions: [] });
  }
}
