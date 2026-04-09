export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const { fileBase64, textContent, fileName, fileType } = req.body;

    const systemPrompt = `You extract tasks/events from files. Parse the content and return a JSON object with a "tasks" array. Each task should have:
- "title": string (required)
- "due_date": string in "YYYY-MM-DD" format (if a date is found)
- "description": string (optional details)
- "category": string (infer from context, use short labels like "acct", "busi", "govt", "fa", "school", "home", "arts", "work", "personal" if they appear in the data)
- "priority": "high", "medium", or "low" (default "medium", use "high" for exams/finals/deadlines)
- "status": "todo"

Be thorough — extract EVERY task/event you can find. Respond with valid JSON only, no markdown.`;

    const messages = [{ role: "system", content: systemPrompt }];
    let contentToSend = "";

    if (textContent) {
      contentToSend = textContent;
    } else if (fileBase64) {
      const isPdf = fileType === "application/pdf" || fileName?.endsWith(".pdf");
      const isImage = fileType?.startsWith("image/");

      if (isPdf) {
        // Extract text from PDF
        try {
          const pdfParse = (await import("pdf-parse")).default;
          const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const pdfData = await pdfParse(buffer);
          contentToSend = pdfData.text;
        } catch (pdfErr) {
          console.error("PDF parse error:", pdfErr.message);
          // Fallback: try sending the raw base64 as text prompt
          const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, "");
          const rawText = Buffer.from(base64Data, "base64").toString("utf-8");
          // Filter out binary garbage, keep readable text
          contentToSend = rawText.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ");
        }
      } else if (isImage) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: `Extract ALL tasks/events from this image (${fileName}). Return every single task as JSON.` },
            { type: "image_url", image_url: { url: fileBase64, detail: "high" } },
          ],
        });
      }
    }

    if (contentToSend && messages.length === 1) {
      messages.push({
        role: "user",
        content: `Extract all tasks from this file (${fileName}):\n\n${contentToSend.slice(0, 30000)}`,
      });
    }

    if (messages.length < 2) {
      return res.status(400).json({ error: "No parseable content found" });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.2,
        max_tokens: 16000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return res.status(500).json({ error: `AI processing failed (${response.status})` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"tasks":[]}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { tasks: [] };
    }

    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : Array.isArray(parsed) ? parsed : [];

    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("Smart import error:", err);
    return res.status(500).json({ error: err.message });
  }
}
