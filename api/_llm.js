// Anthropic-only LLM helper. Every AI route in the app goes through callLLM so
// there is exactly one place that knows about the provider, the model, retries
// and response parsing.
//
// No secrets are hardcoded — the key comes only from process.env.ANTHROPIC_API_KEY.
// Model defaults to Claude Opus 5; override with ANTHROPIC_MODEL (e.g. claude-sonnet-5).

const DEFAULT_MODEL = "claude-opus-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export function llmConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function llmModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

// Pull a data: URL apart into { mediaType, data } for base64 content blocks.
export function parseDataUrl(url) {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i.exec(String(url || ""));
  return m ? { mediaType: m[1], data: m[2] } : null;
}

// Build an image content block from either a data: URL or an http(s) URL.
export function imageBlock(url) {
  const d = parseDataUrl(url);
  if (d) return { type: "image", source: { type: "base64", media_type: d.mediaType, data: d.data } };
  return { type: "image", source: { type: "url", url: String(url) } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// callLLM({ system, user | content | messages, json, maxTokens, effort }) -> string
//
//   system    system prompt (string)
//   user      a single user turn as plain text
//   content   a single user turn as an array of content blocks (text/image/document)
//   messages  full Anthropic-shaped messages array (multi-turn); wins over user/content
//   json      when true, instructs the model to answer with JSON only (parse with parseJSON)
//   maxTokens output cap (default 8000 — thinking tokens count against it too)
//   effort    "low" | "medium" | "high" — thinking depth; low keeps extraction-style
//             routes well inside the 60s function limit (default "low")
//
// Retries once on rate-limit / server / network errors. Throws on anything else.
export async function callLLM({ system, user, content, messages, json = false, maxTokens = 8000, effort = "low" }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No LLM provider configured (set ANTHROPIC_API_KEY)");

  const sys = json
    ? `${system || ""}\n\nRespond with valid JSON only. No markdown, no code fences, no prose.`.trim()
    : (system || "");

  let msgs = messages;
  if (!Array.isArray(msgs) || !msgs.length) {
    if (Array.isArray(content) && content.length) msgs = [{ role: "user", content }];
    else msgs = [{ role: "user", content: String(user ?? "") }];
  }

  const body = {
    model: llmModel(),
    max_tokens: maxTokens,
    output_config: { effort },
    messages: msgs,
  };
  if (sys) body.system = sys;

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastErr = new Error(`Anthropic request failed (network): ${err.message}`);
      if (attempt === 0) { await sleep(800); continue; }
      throw lastErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      lastErr = new Error(`Anthropic request failed (${response.status}): ${errText.slice(0, 300)}`);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt === 0) { await sleep(800); continue; }
      throw lastErr;
    }

    const data = await response.json();
    if (data?.stop_reason === "refusal") {
      throw new Error(`Anthropic declined the request (${data?.stop_details?.category || "refusal"})`);
    }
    // A truncated answer is worse than none: half-JSON parses to {} and a route
    // would quietly act on nothing. Callers catch and degrade.
    if (data?.stop_reason === "max_tokens") {
      throw new Error("Anthropic response truncated (max_tokens) — raise maxTokens for this call");
    }
    // Thinking is on by default, so the first block may be a thinking block —
    // always pick the text block rather than content[0].
    const text = (data?.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("");
    return text || "";
  }
  throw lastErr || new Error("Anthropic request failed");
}

// Semantic rerank without an embeddings API: ask Claude which candidates best
// answer the query. `items` are short strings (title + excerpt); returns the
// indices of the `top` most relevant, best first. Throws on failure — callers
// catch and fall back.
export async function rerank({ query, items, top = 6 }) {
  if (!Array.isArray(items) || !items.length) return [];
  const list = items.map((t, i) => `[${i}] ${String(t || "").replace(/\s+/g, " ").slice(0, 700)}`).join("\n\n");
  const raw = await callLLM({
    system: "You rank candidate notes by how relevant they are to a question. Judge by meaning, not keyword overlap.",
    user: `QUESTION: ${query}\n\nCANDIDATES:\n${list}\n\nReturn JSON: { "ranked": [indices of the ${Math.min(top, items.length)} most relevant candidates, best first] }. Include ONLY candidates that are actually relevant; an empty list is fine.`,
    json: true,
    maxTokens: 1500,
    effort: "low",
  });
  const parsed = parseJSON(raw);
  const seen = new Set();
  return (Array.isArray(parsed?.ranked) ? parsed.ranked : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < items.length && !seen.has(n) && seen.add(n))
    .slice(0, top);
}

// Parse a model's JSON response defensively: strips accidental code fences and
// falls back to extracting the first {...} block.
export function parseJSON(text) {
  if (!text || typeof text !== "string") return {};
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return {}; }
    }
    return {};
  }
}
export default callLLM;
