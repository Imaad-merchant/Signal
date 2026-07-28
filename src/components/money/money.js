// Money-tab helpers: category rules, subscription detection, CSV import, formatting.
// Data model (Firestore, owner-scoped):
//   Account      { name, type, balance }
//   Transaction  { date "YYYY-MM-DD", merchant, amount (negative = spend, positive = income), category, account_id }
//   Subscription { merchant, amount, cadence "monthly"|"yearly"|"weekly", active, last_charged }

export const CATEGORIES = [
  "Income", "Groceries", "Food", "Transport", "Shopping", "Bills & Utilities",
  "Subscriptions", "Entertainment", "Health", "Travel", "Other",
];

const RULES = [
  [/salary|payroll|direct dep|deposit|refund|venmo from|zelle from|interest/i, "Income"],
  [/uber eats|doordash|grubhub|chipotle|mcdonald|starbucks|restaurant|cafe|pizza|taco|coffee|dunkin|panera/i, "Food"],
  [/whole foods|trader joe|kroger|safeway|aldi|heb|walmart|costco|grocery|publix|wegmans/i, "Groceries"],
  [/uber|lyft|shell|chevron|exxon|gas|fuel|parking|metro|transit|toll/i, "Transport"],
  [/netflix|spotify|hulu|disney|hbo|max|youtube premium|apple\.com\/bill|prime|patreon|substack|icloud|dropbox|adobe|notion|chatgpt|openai|claude|midjourney|gym|planet fitness|membership/i, "Subscriptions"],
  [/at&t|verizon|t-mobile|comcast|xfinity|electric|water|utility|insurance|rent|mortgage|phone bill/i, "Bills & Utilities"],
  [/amazon|target|best buy|ebay|etsy|nike|apparel|clothing|store/i, "Shopping"],
  [/cinema|amc|movie|steam|playstation|xbox|nintendo|concert|ticketmaster|bar|tavern/i, "Entertainment"],
  [/cvs|walgreens|pharmacy|doctor|clinic|dental|medical|hospital/i, "Health"],
  [/airline|delta|united|american air|hotel|airbnb|expedia|booking\.com|marriott|hilton/i, "Travel"],
];

export function categorize(merchant, amount) {
  const m = String(merchant || "");
  if (Number(amount) > 0) return "Income";
  for (const [re, cat] of RULES) if (re.test(m)) return cat;
  return "Other";
}

const fmtMoney = (n) => {
  const v = Number(n) || 0;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export { fmtMoney };

// Normalize a merchant string for grouping ("NETFLIX.COM 8663" → "netflix").
export function normMerchant(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[0-9]{2,}/g, " ")
    .replace(/\b(inc|llc|co|com|purchase|payment|recurring|autopay|pos|debit|card|ach)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").slice(0, 2).join(" ");
}

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

// Detect recurring charges from transactions → [{ merchant, amount, cadence, count, last_charged }].
// A merchant with ≥2 similar-amount charges at ~weekly/monthly/yearly spacing is a subscription.
export function detectSubscriptions(transactions) {
  const groups = {};
  for (const t of transactions || []) {
    if (!t || Number(t.amount) >= 0) continue; // spends only
    const key = normMerchant(t.merchant);
    if (!key) continue;
    (groups[key] = groups[key] || []).push(t);
  }
  const out = [];
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    const amts = list.map((t) => Math.abs(Number(t.amount) || 0)).sort((a, b) => a - b);
    const med = amts[Math.floor(amts.length / 2)];
    if (med <= 0) continue;
    // amounts must be consistent (within 15% of the median)
    const consistent = amts.filter((a) => Math.abs(a - med) <= med * 0.15).length >= 2;
    if (!consistent) continue;
    const dates = list.map((t) => t.date).filter(Boolean).sort();
    let cadence = "monthly";
    if (dates.length >= 2) {
      const gaps = [];
      for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i], dates[i - 1]));
      const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      cadence = avg <= 10 ? "weekly" : avg >= 200 ? "yearly" : "monthly";
    }
    out.push({
      merchant: list[0].merchant || key,
      amount: Math.round(med * 100) / 100,
      cadence,
      count: list.length,
      last_charged: dates[dates.length - 1] || "",
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

// --- Presentation helpers (Rocket-Money-style avatars + grouping) ---
export function initials(name) {
  const w = String(name || "?").trim().split(/\s+/);
  return (((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase()) || "?";
}
const AVATARS = ["#0ea5e9", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#eab308", "#ef4444", "#14b8a6", "#6366f1", "#f43f5e"];
export function avatarColor(name) {
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
// Group accounts into Rocket-Money-style sections with signed subtotals.
export function groupAccounts(accounts) {
  const g = { Cash: [], Credit: [], Investments: [], Other: [] };
  for (const a of accounts || []) {
    const t = String(a.type || "").toLowerCase();
    if (/credit|loan/.test(t)) g.Credit.push(a);
    else if (/invest|brokerage|retire|401|ira|hsa/.test(t)) g.Investments.push(a);
    else if (/check|saving|cash|depository|money market/.test(t)) g.Cash.push(a);
    else g.Other.push(a);
  }
  return g;
}

// Monthly-equivalent cost of a subscription.
export function monthlyCost(sub) {
  const a = Number(sub.amount) || 0;
  return sub.cadence === "yearly" ? a / 12 : sub.cadence === "weekly" ? a * 4.33 : a;
}

// Spending by category for a given YYYY-MM prefix → [{ category, total }] (spends only, positive totals).
export function spendingByCategory(transactions, monthPrefix) {
  const byCat = {};
  for (const t of transactions || []) {
    if (!t || Number(t.amount) >= 0) continue;
    if (monthPrefix && !(t.date || "").startsWith(monthPrefix)) continue;
    const c = t.category || categorize(t.merchant, t.amount);
    byCat[c] = (byCat[c] || 0) + Math.abs(Number(t.amount) || 0);
  }
  return Object.entries(byCat).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

// Parse a bank-export CSV into [{ date, merchant, amount, category }]. Best-effort header
// detection (Date / Description|Merchant|Name / Amount, or separate Debit/Credit columns).
export function parseTransactionsCsv(text) {
  const rows = csvRows(String(text || ""));
  if (!rows.length) return [];
  let header = rows[0].map((h) => h.toLowerCase().trim());
  let start = 1;
  const looksHeader = header.some((h) => /date|amount|description|debit|credit|merchant/.test(h));
  if (!looksHeader) { header = null; start = 0; }
  const idx = (names) => header ? header.findIndex((h) => names.some((n) => h.includes(n))) : -1;
  const di = header ? idx(["date"]) : 0;
  const mi = header ? idx(["description", "merchant", "name", "payee"]) : 1;
  const ai = header ? idx(["amount"]) : 2;
  const debiti = header ? idx(["debit", "withdrawal"]) : -1;
  const crediti = header ? idx(["credit", "deposit"]) : -1;

  const out = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;
    const rawDate = (row[di < 0 ? 0 : di] || "").trim();
    const merchant = (row[mi < 0 ? 1 : mi] || "").trim();
    let amount;
    if (ai >= 0 && row[ai] !== undefined && row[ai] !== "") amount = parseAmount(row[ai]);
    else if (debiti >= 0 || crediti >= 0) {
      const debit = debiti >= 0 ? parseAmount(row[debiti]) : 0;
      const credit = crediti >= 0 ? parseAmount(row[crediti]) : 0;
      amount = credit ? Math.abs(credit) : -Math.abs(debit);
    } else amount = parseAmount(row[2]);
    if (!merchant || !Number.isFinite(amount) || amount === 0) continue;
    const date = normDate(rawDate);
    out.push({ date, merchant, amount, category: categorize(merchant, amount) });
  }
  return out;
}

function parseAmount(s) {
  const neg = /^\(.*\)$/.test(String(s).trim()) || /-/.test(String(s));
  const n = parseFloat(String(s).replace(/[(),$\s]/g, "").replace(/-/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}
function normDate(s) {
  const t = String(s).trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/.exec(t))) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10);
}
// Minimal CSV row splitter (handles quoted fields with commas).
function csvRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}
