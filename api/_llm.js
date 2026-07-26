// Provider-abstracted LLM helper.
//
// If ANTHROPIC_API_KEY is set, calls the Anthropic Messages API; otherwise falls
// back to the OpenAI Chat Completions path (the same one api/invoke-llm.js uses).
// This lets routes run today on the already-configured OpenAI key and auto-upgrade
// to Anthropic once ANTHROPIC_API_KEY is added to the environment.
//
// No secrets are hardcoded — keys come only from process.env.

// Call Anthropic's Messages API. Returns the assistant's text content.
async function callAnthropic({ system, user, json }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  // Anthropic has no native JSON response_format; instruct via the system prompt.
  const sys = json
    ? `${system || ""}\n\nRespond with valid JSON only. No markdown, no code fences, no prose.`
    : system || "";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      temperature: 0.4,
      system: sys,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  return data?.content?.[0]?.text || "";
}

// Call OpenAI's Chat Completions API. Returns the assistant's text content.
async function callOpenAI({ system, user, json }) {
  const apiKey = process.env.OPENAI_API_KEY;

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const body = {
    model: "gpt-4o",
    messages,
    temperature: 0.4,
    max_tokens: 4000,
  };
  if (json) body.response_format = { type: "json_object" };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

// callLLM({ system, user, json }) -> string
// Picks Anthropic when ANTHROPIC_API_KEY exists, else OpenAI. Throws if neither key
// is configured. When json is true, returns a string the caller should JSON.parse.
export async function callLLM({ system, user, json = false }) {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  if (!hasAnthropic && !hasOpenAI) {
    throw new Error("No LLM provider configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)");
  }
  // Prefer Anthropic when its key is set, but never let a provider-side failure
  // (missing credits, bad key, model error, outage) take the whole feature down:
  // fall back to OpenAI if it's available. The check-in keeps working on OpenAI
  // and automatically uses Claude again once the Anthropic call succeeds.
  if (hasAnthropic) {
    try {
      return await callAnthropic({ system, user, json });
    } catch (err) {
      if (!hasOpenAI) throw err;
      console.error("Anthropic call failed; falling back to OpenAI:", err.message);
      return await callOpenAI({ system, user, json });
    }
  }
  return callOpenAI({ system, user, json });
}

// Embed one or more strings with OpenAI (text-embedding-3-small). Returns an array
// of vectors. Used for semantic note search. Requires OPENAI_API_KEY.
export async function embed(texts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OPENAI_API_KEY configured for embeddings");
  const input = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || "").slice(0, 8000) || " ");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input }),
  });
  if (!response.ok) throw new Error(`Embeddings failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  return (data.data || []).map((d) => d.embedding);
}

// Cosine similarity between two equal-length vectors.
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Parse a model's JSON response defensively: strips accidental code fences and
// falls back to extracting the first {...} block.
export function parseJSON(text) {
  if (!text || typeof text !== "string") return {};
  let cleaned = text.trim();
  // Strip markdown code fences if present.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

export default callLLM;
