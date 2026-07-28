import { base44 } from "@/api/base44Client";
import {
  CATEGORIES, categorize, fmtMoney, detectSubscriptions, monthlyCost, yearlyCost, normMerchant, spendingByCategory,
} from "@/components/money/money";

const monthPrefix = (d = new Date()) => d.toISOString().slice(0, 7);
const lastMonthPrefix = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return monthPrefix(d); };
const todayStr = () => new Date().toISOString().slice(0, 10);

// Classify a money question. Returns an intent object, or null if it isn't one.
export function parseMoneyQuery(text) {
  const s = String(text || "").toLowerCase();
  if (/\bnet worth\b/.test(s) || /how much (money )?(do i have|am i worth)\b/.test(s) || /\bwhat.?s my (net worth|balance)\b/.test(s))
    return { kind: "networth" };
  if (/\b(subscriptions?|recurring)\b/.test(s))
    return { kind: "subscriptions" };
  if (/\bspen[dt]\b|how much did i (pay|drop)\b/.test(s)) {
    const period = /\btoday\b/.test(s) ? "today" : /\bthis week\b/.test(s) ? "week" : /\blast month\b/.test(s) ? "lastmonth" : "month";
    // category?
    let category = null;
    for (const c of CATEGORIES) {
      const cl = c.toLowerCase().split(" ")[0];
      if (new RegExp(`\\bon ${cl}\\b|\\b${cl}\\b`).test(s) && c !== "Income") { category = c; break; }
    }
    // merchant? "at X" / "on X"
    let merchant = null;
    const m = s.match(/\b(?:at|on|for)\s+([a-z0-9 &'.-]{2,30})$/);
    if (m && !category) merchant = m[1].trim();
    return { kind: "spend", period, category, merchant };
  }
  if (/\bbudget\b/.test(s)) return { kind: "budget" };
  return null;
}

function periodFilter(period) {
  if (period === "today") { const t = todayStr(); return (d) => d === t; }
  if (period === "week") { const wk = new Date(); wk.setDate(wk.getDate() - 7); const iso = wk.toISOString().slice(0, 10); return (d) => d >= iso; }
  if (period === "lastmonth") { const p = lastMonthPrefix(); return (d) => (d || "").startsWith(p); }
  const p = monthPrefix(); return (d) => (d || "").startsWith(p);
}
const periodLabel = (p) => (p === "today" ? "today" : p === "week" ? "this week" : p === "lastmonth" ? "last month" : "this month");

// Answer a parsed money query by reading the user's data. Returns a spoken string.
export async function answerMoneyQuery(q) {
  const [accounts, transactions, subsRaw] = await Promise.all([
    base44.entities.Account.list("-created_date", 100).catch(() => []),
    base44.entities.Transaction.list("-date", 2000).catch(() => []),
    base44.entities.Subscription.list("-created_date", 200).catch(() => []),
  ]);
  const tx = Array.isArray(transactions) ? transactions : [];

  if (q.kind === "networth") {
    if (!accounts.length) return "You haven't added or linked any accounts yet, so I can't calculate your net worth.";
    const nw = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    return `Your net worth is ${fmtMoney(nw)} across ${accounts.length} account${accounts.length > 1 ? "s" : ""}.`;
  }

  if (q.kind === "subscriptions") {
    const manual = (Array.isArray(subsRaw) ? subsRaw : []).filter((s) => s.active !== false).map((s) => ({ ...s, source: "manual" }));
    const seen = new Set(manual.map((s) => normMerchant(s.merchant)));
    const merged = [...manual];
    for (const d of detectSubscriptions(tx)) if (!seen.has(normMerchant(d.merchant))) merged.push(d);
    if (!merged.length) return "I don't see any subscriptions yet. Link a bank or import transactions and I'll spot the recurring ones.";
    const monthly = merged.reduce((s, x) => s + monthlyCost(x), 0);
    const yearly = merged.reduce((s, x) => s + yearlyCost(x), 0);
    const top = merged.slice().sort((a, b) => monthlyCost(b) - monthlyCost(a))[0];
    return `You have ${merged.length} subscription${merged.length > 1 ? "s" : ""} costing ${fmtMoney(monthly)} a month — about ${fmtMoney(yearly)} a year. The biggest is ${top.merchant} at ${fmtMoney(top.amount)} ${top.cadence}.`;
  }

  if (q.kind === "budget") {
    const spend = spendingByCategory(tx, monthPrefix());
    if (!spend.length) return "No spending recorded this month yet.";
    const top = spend[0];
    const total = spend.reduce((s, c) => s + c.total, 0);
    return `This month you've spent ${fmtMoney(total)}. Your biggest category is ${top.category} at ${fmtMoney(top.total)}. You can set budgets per category on the Money tab.`;
  }

  if (q.kind === "spend") {
    const inPeriod = periodFilter(q.period);
    let spends = tx.filter((t) => Number(t.amount) < 0 && inPeriod(t.date || ""));
    if (q.category) spends = spends.filter((t) => (t.category || categorize(t.merchant, t.amount)) === q.category);
    if (q.merchant) spends = spends.filter((t) => (t.merchant || "").toLowerCase().includes(q.merchant));
    const total = spends.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const where = q.category ? ` on ${q.category}` : q.merchant ? ` at ${q.merchant}` : "";
    if (!spends.length) return `I don't see any spending${where} ${periodLabel(q.period)}.`;
    return `You've spent ${fmtMoney(total)}${where} ${periodLabel(q.period)}, across ${spends.length} transaction${spends.length > 1 ? "s" : ""}.`;
  }

  return "I'm not sure how to answer that about your money.";
}
