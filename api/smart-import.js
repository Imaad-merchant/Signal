import { verifyAuth } from "./_auth.js";
import { callLLM, llmConfigured, imageBlock, parseJSON } from "./_llm.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!llmConfigured()) return res.status(500).json({ error: "LLM not configured (ANTHROPIC_API_KEY)" });

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

    let userContent = null;
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
        userContent = [
          imageBlock(fileBase64),
          { type: "text", text: `Extract ALL tasks/events from this image (${fileName}). Return every single task as JSON.` },
        ];
      }
    }

    if (contentToSend && !userContent) {
      userContent = [{ type: "text", text: `Extract all tasks from this file (${fileName}):\n\n${contentToSend.slice(0, 30000)}` }];
    }

    if (!userContent) {
      return res.status(400).json({ error: "No parseable content found" });
    }

    let content;
    try {
      content = await callLLM({ system: systemPrompt, content: userContent, json: true, maxTokens: 16000 });
    } catch (err) {
      console.error("Smart import LLM error:", err.message);
      return res.status(500).json({ error: "AI processing failed" });
    }

    const parsed = parseJSON(content);
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : Array.isArray(parsed) ? parsed : [];

    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("Smart import error:", err);
    return res.status(500).json({ error: err.message });
  }
}
