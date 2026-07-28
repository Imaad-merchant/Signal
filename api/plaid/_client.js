// Minimal Plaid REST helper (raw fetch — no `plaid` dependency, light cold starts).
// Env: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox | development | production).
const ENV = process.env.PLAID_ENV || "sandbox";
const BASE = `https://${ENV}.plaid.com`;

export function plaidConfigured() {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export async function plaidFetch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_message || data.error_code || `Plaid ${res.status}`);
  return data;
}

// Map Plaid's personal-finance-category to our Money-tab categories.
export function mapPlaidCategory(tx) {
  const p = (tx?.personal_finance_category?.primary || "").toUpperCase();
  const m = {
    INCOME: "Income",
    TRANSFER_IN: "Income",
    FOOD_AND_DRINK: "Food",
    GENERAL_MERCHANDISE: "Shopping",
    GROCERIES: "Groceries",
    TRANSPORTATION: "Transport",
    TRAVEL: "Travel",
    RENT_AND_UTILITIES: "Bills & Utilities",
    ENTERTAINMENT: "Entertainment",
    MEDICAL: "Health",
    PERSONAL_CARE: "Health",
    LOAN_PAYMENTS: "Bills & Utilities",
  };
  if (m[p]) return m[p];
  // legacy category array fallback
  const c = Array.isArray(tx?.category) ? tx.category[0] : "";
  if (/food|restaurant/i.test(c)) return "Food";
  if (/travel/i.test(c)) return "Travel";
  if (/transfer|payroll|deposit/i.test(c)) return "Income";
  return ""; // let the client's keyword categorizer decide
}
