import { verifyAuth } from "./_auth.js";
import { callLLM, llmConfigured, imageBlock, parseJSON } from "./_llm.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!llmConfigured()) return res.status(500).json({ error: "LLM not configured (ANTHROPIC_API_KEY)" });

  try {
    const { prompt, file_urls, response_json_schema } = req.body;

    let text = String(prompt || "");
    if (response_json_schema) {
      text += `\n\nRespond with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}`;
    }
    // Attach any image URLs so the model can read them alongside the prompt.
    const images = (Array.isArray(file_urls) ? file_urls : [])
      .filter((u) => typeof u === "string" && /\.(png|jpe?g|webp|gif)(\?|$)|^data:image\//i.test(u))
      .map(imageBlock);
    const content = [...images, { type: "text", text }];

    const out = await callLLM({ content, json: !!response_json_schema, maxTokens: 4000 });

    if (response_json_schema) {
      const parsed = parseJSON(out);
      return res.status(200).json(Object.keys(parsed).length ? parsed : { result: out });
    }
    try {
      return res.status(200).json(JSON.parse(out));
    } catch {
      return res.status(200).json({ result: out });
    }
  } catch (err) {
    console.error("InvokeLLM error:", err);
    return res.status(500).json({ error: err.message });
  }
}
