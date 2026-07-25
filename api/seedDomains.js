// Domain seed route.
//
// Owner-scoped: requires a valid Firebase ID token. Clusters the user's existing
// tasks into 6-10 candidate life/work "domains". Idempotent-friendly — it only
// returns candidates; the client decides whether to insert them.
//
// Body: { tasks: [...] }
// Returns: { domains: [{ key, label, sort_order }] }
import { verifyAuth } from "./_auth.js";
import { callLLM, parseJSON } from "./_llm.js";

// A sensible default set used when there are no tasks to cluster (cold start).
const DEFAULT_DOMAINS = [
  { key: "work", label: "Work", sort_order: 1 },
  { key: "health", label: "Health", sort_order: 2 },
  { key: "learning", label: "Learning", sort_order: 3 },
  { key: "personal", label: "Personal", sort_order: 4 },
  { key: "finance", label: "Finance", sort_order: 5 },
  { key: "social", label: "Social", sort_order: 6 },
];

// Normalize an arbitrary label into a slug key.
function slugify(str, fallback) {
  const s = String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || fallback;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body || {};
    const tasks = Array.isArray(body.tasks) ? body.tasks : [];

    // Cold start: no tasks -> return the default 6 domains.
    if (tasks.length === 0) {
      return res.status(200).json({ domains: DEFAULT_DOMAINS });
    }

    // Slim the tasks to just the signal we need for clustering.
    const slim = tasks.slice(0, 300).map((t) => ({
      title: (t && t.title) || "",
      category: (t && t.category) || "",
    }));

    const system = `You cluster a user's tasks into 6-10 broad life/work "domains" (e.g. Work, Health, Learning, Finance, Personal, Social, Side Projects).
Group by category and title theme. Each domain: { "key": short_snake_case_slug, "label": Title Case string, "sort_order": integer starting at 1 }.
Return between 6 and 10 domains. Return JSON: { "domains": [ ... ] }.`;

    const user = `TASKS (JSON array of {title, category}):
${JSON.stringify(slim)}

Cluster them into 6-10 domains now.`;

    const raw = await callLLM({ system, user, json: true });
    const parsed = parseJSON(raw);
    let domains = Array.isArray(parsed?.domains) ? parsed.domains : [];

    domains = domains
      .filter((d) => d && (d.label || d.key))
      .map((d, i) => ({
        key: slugify(d.key || d.label, `domain_${i + 1}`),
        label: String(d.label || d.key || `Domain ${i + 1}`),
        sort_order: Number.isFinite(d.sort_order) ? d.sort_order : i + 1,
      }));

    // Enforce the 6-10 bound; fall back to defaults if the model under-delivered.
    if (domains.length < 6) {
      const existingKeys = new Set(domains.map((d) => d.key));
      for (const def of DEFAULT_DOMAINS) {
        if (domains.length >= 6) break;
        if (!existingKeys.has(def.key)) {
          domains.push({ ...def, sort_order: domains.length + 1 });
          existingKeys.add(def.key);
        }
      }
    }
    if (domains.length > 10) domains = domains.slice(0, 10);

    return res.status(200).json({ domains });
  } catch (err) {
    console.error("Seed domains error:", err);
    return res.status(500).json({ error: err.message || "Seed domains failed" });
  }
}
