// User-defined category rules ("always file Anthropic under Software & Tech").
// These layer over the built-in regex rules in money.js: an explicit category on
// the transaction wins, then a user rule, then the built-in guess.
//
// CategoryRule { match "anthropic", category "Subscriptions", scope "contains"|"exact" }
import { categorize, normMerchant } from "@/components/money/money";

export function ruleMatches(rule, merchant) {
  const needle = String(rule?.match || "").toLowerCase().trim();
  if (!needle) return false;
  const hay = String(merchant || "").toLowerCase();
  return rule.scope === "exact" ? normMerchant(merchant) === normMerchant(needle) : hay.includes(needle);
}

// Resolve a transaction's category, honouring an explicit override first.
export function resolveCategory(tx, rules) {
  if (tx?.category) return tx.category;
  for (const r of rules || []) if (ruleMatches(r, tx?.merchant)) return r.category;
  return categorize(tx?.merchant, tx?.amount);
}

// Transactions a rule would apply to — shown as "this will recategorise N others".
export function transactionsMatching(rule, transactions) {
  return (transactions || []).filter((t) => ruleMatches(rule, t.merchant));
}

// Suggest the rule text for a merchant: the normalised two-word stem, which is
// what makes "ANTHROPIC* CLAUDE SUB 8829" and "Anthropic" collapse together.
export const suggestRuleMatch = (merchant) => normMerchant(merchant) || String(merchant || "").toLowerCase();
