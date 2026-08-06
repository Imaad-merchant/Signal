import { base44 } from "@/api/base44Client";
import {
  CATEGORIES, fmtMoney, detectSubscriptions, monthlyCost, yearlyCost, normMerchant,
} from "@/components/money/money";
import { resolveCategory } from "@/components/money/rules";
import { monthKey, spendingWithDelta, upcomingDays, netWorthBreakdown } from "@/components/money/analytics";

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
  if (/\b(upcoming|due soon|coming up|bills? due)\b/.test(s)) return { kind: "upcoming" };
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
  const [accounts, transactions, subsRaw, budgetsRaw, rulesRaw] = await Promise.all([
    base44.entities.Account.list("-created_date", 100).catch(() => []),
    base44.entities.Transaction.list("-date", 2000).catch(() => []),
    base44.entities.Subscription.list("-created_date", 200).catch(() => []),
    base44.entities.Budget.list("-created_date", 100).catch(() => []),
    base44.entities.CategoryRule.list("-created_date", 200).catch(() => []),
  ]);
  const tx = Array.isArray(transactions) ? transactions : [];
  const budgets = Array.isArray(budgetsRaw) ? budgetsRaw : [];
  const rules = Array.isArray(rulesRaw) ? rulesRaw : [];

  if (q.kind === "networth") {
    if (!accounts.length) return "You haven't added or linked any accounts yet, so I can't calculate your net worth.";
    const nw = netWorthBreakdown(accounts);
    return `Your net worth is ${fmtMoney(nw.net)} — ${fmtMoney(nw.assetTotal)} in assets across ${nw.assetCount} account${nw.assetCount === 1 ? "" : "s"}${nw.debtTotal > 0 ? `, less ${fmtMoney(nw.debtTotal)} of debt` : ""}.`;
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
    const spend = spendingWithDelta(tx, monthKey());
    const total = spend.reduce((s, c) => s + c.amount, 0);
    if (!budgets.length) {
      if (!spend.length) return "No spending recorded this month yet, and you haven't set any budgets.";
      return `This month you've spent ${fmtMoney(total)}, mostly on ${spend[0].category} at ${fmtMoney(spend[0].amount)}. You haven't set any budgets yet — you can add them in the Budgets view.`;
    }
    const spentByCat = Object.fromEntries(spend.map((c) => [c.category, c.amount]));
    const limit = budgets.filter((b) => b.category !== "Income").reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const used = budgets.filter((b) => b.category !== "Income").reduce((s, b) => s + (spentByCat[b.category] || 0), 0);
    const over = budgets
      .filter((b) => b.category !== "Income" && (spentByCat[b.category] || 0) > (Number(b.amount) || 0))
      .map((b) => b.category);
    const left = limit - used;
    return `You've used ${fmtMoney(used)} of your ${fmtMoney(limit)} budget this month, so ${left >= 0 ? `${fmtMoney(left)} left` : `${fmtMoney(-left)} over`}.${over.length ? ` You're over on ${over.join(" and ")}.` : ""}`;
  }

  if (q.kind === "upcoming") {
    const manual = (Array.isArray(subsRaw) ? subsRaw : []).filter((s) => s.active !== false).map((s) => ({ ...s, source: "manual" }));
    const seen = new Set(manual.map((s) => normMerchant(s.merchant)));
    const merged = [...manual];
    for (const d of detectSubscriptions(tx)) if (!seen.has(normMerchant(d.merchant))) merged.push(d);
    const week = upcomingDays(merged, 7);
    const items = week.flatMap((d) => d.items);
    const total = week.reduce((s, d) => s + d.total, 0);
    if (!items.length) return "Nothing is due in the next 7 days.";
    const soonest = week.find((d) => d.items.length > 0);
    return `You have ${items.length} charge${items.length > 1 ? "s" : ""} due in the next 7 days, totalling ${fmtMoney(total)}. The next is ${soonest.items[0].merchant} on ${soonest.date.toLocaleDateString(undefined, { weekday: "long" })}.`;
  }

  if (q.kind === "spend") {
    const inPeriod = periodFilter(q.period);
    let spends = tx.filter((t) => Number(t.amount) < 0 && !t.ignored && inPeriod(t.date || ""));
    if (q.category) spends = spends.filter((t) => resolveCategory(t, rules) === q.category);
    if (q.merchant) spends = spends.filter((t) => (t.merchant || "").toLowerCase().includes(q.merchant));
    const total = spends.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const where = q.category ? ` on ${q.category}` : q.merchant ? ` at ${q.merchant}` : "";
    if (!spends.length) return `I don't see any spending${where} ${periodLabel(q.period)}.`;
    return `You've spent ${fmtMoney(total)}${where} ${periodLabel(q.period)}, across ${spends.length} transaction${spends.length > 1 ? "s" : ""}.`;
  }

  return "I'm not sure how to answer that about your money.";
}
