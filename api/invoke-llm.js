export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { prompt, file_urls, response_json_schema } = req.body;

    const messages = [{ role: "user", content: prompt }];

    const body = {
      model: "gpt-4o",
      messages,
      temperature: 0.3,
      max_tokens: 4000,
    };

    if (response_json_schema) {
      body.response_format = { type: "json_object" };
      messages[0].content += `\n\nRespond with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    try {
      return res.status(200).json(JSON.parse(content));
    } catch {
      return res.status(200).json({ result: content });
    }
  } catch (err) {
    console.error("InvokeLLM error:", err);
    return res.status(500).json({ error: err.message });
  }
}
