// Period math and rollups shared by the Money views.
// Everything here is pure: it takes the already-loaded transaction/account
// arrays from the section shell and returns plain objects for rendering.
import { categorize, normMerchant, monthlyCost, nextDue } from "@/components/money/money";

export const monthKey = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};
export const shiftMonth = (key, delta) => {
  const [y, m] = String(key).split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (key, opts = null) => {
  const [y, m] = String(key).split("-").map(Number);
  /** @type {Intl.DateTimeFormatOptions} */
  const fmt = opts || { month: "long", year: "numeric" };
  return new Date(y, m - 1, 1).toLocaleString(undefined, fmt);
};
export const daysInMonth = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const dayOf = (isoDate) => Number(String(isoDate || "").slice(8, 10)) || 0;
const spendAmount = (t) => (Number(t.amount) < 0 ? Math.abs(Number(t.amount)) : 0);

// A transaction counts toward spending unless the user excluded it.
export const isCountedSpend = (t) => !t?.ignored && !t?.hidden_from_spending && Number(t?.amount) < 0;
export const txCategory = (t) => t?.category || categorize(t?.merchant, t?.amount);

export function totalsForMonth(transactions, key) {
  let spend = 0, income = 0, count = 0;
  for (const t of transactions || []) {
    if (!(t.date || "").startsWith(key)) continue;
    count++;
    if (isCountedSpend(t)) spend += spendAmount(t);
    else if (Number(t.amount) > 0 && !t.ignored) income += Number(t.amount);
  }
  return { spend, income, count };
}

// Cumulative daily spend for two months, aligned on day-of-month so Rocket
// Money's "this month vs last month" overlay works on one x-axis.
export function cumulativeCompare(transactions, key) {
  const prev = shiftMonth(key, -1);
  const span = Math.max(daysInMonth(key), daysInMonth(prev));
  const cur = new Array(span + 1).fill(0);
  const old = new Array(span + 1).fill(0);
  for (const t of transactions || []) {
    if (!isCountedSpend(t)) continue;
    const d = dayOf(t.date);
    if (!d || d > span) continue;
    if ((t.date || "").startsWith(key)) cur[d] += spendAmount(t);
    else if ((t.date || "").startsWith(prev)) old[d] += spendAmount(t);
  }
  const isCurrentMonth = key === monthKey();
  const todayDay = new Date().getDate();
  const out = [];
  let a = 0, b = 0;
  for (let d = 1; d <= span; d++) {
    a += cur[d]; b += old[d];
    out.push({
      day: d,
      // Stop the current-month line at today instead of flat-lining to month end.
      thisMonth: isCurrentMonth && d > todayDay ? null : a,
      lastMonth: d <= daysInMonth(prev) ? b : null,
    });
  }
  return out;
}

// Category spend for a month, with the month-over-month change Rocket Money
// shows as a ▲/▼ percentage next to each category.
export function spendingWithDelta(transactions, key) {
  const prev = shiftMonth(key, -1);
  const cur = {}, old = {};
  for (const t of transactions || []) {
    if (!isCountedSpend(t)) continue;
    const c = txCategory(t);
    if ((t.date || "").startsWith(key)) cur[c] = (cur[c] || 0) + spendAmount(t);
    else if ((t.date || "").startsWith(prev)) old[c] = (old[c] || 0) + spendAmount(t);
  }
  const total = Object.values(cur).reduce((s, v) => s + v, 0);
  return Object.entries(cur)
    .map(([category, amount]) => {
      const before = old[category] || 0;
      return {
        category,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        delta: before > 0 ? ((amount - before) / before) * 100 : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

// The "Non-spending" block: money that moved but isn't spending.
export function nonSpendingBuckets(transactions, key) {
  const inMonth = (transactions || []).filter((t) => (t.date || "").startsWith(key));
  const sum = (list) => list.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const internal = inMonth.filter((t) => /transfer|zelle|venmo|withdrawal|deposit to/i.test(String(t.merchant || "")));
  return [
    { label: "Tax Deductible", value: sum(inMonth.filter((t) => t.tax_deductible)) },
    { label: "Reimbursements", value: sum(inMonth.filter((t) => t.reimbursed)) },
    { label: "Ignored", value: sum(inMonth.filter((t) => t.ignored)) },
    { label: "Internal Transfers", value: internal.length, count: true },
  ];
}

// Merchants hit more than once this month — Rocket Money's "Frequent Spend".
export function frequentSpend(transactions, key, limit = 4) {
  const groups = {};
  for (const t of transactions || []) {
    if (!isCountedSpend(t) || !(t.date || "").startsWith(key)) continue;
    const k = normMerchant(t.merchant);
    if (!k) continue;
    groups[k] = groups[k] || { merchant: t.merchant, count: 0, total: 0 };
    groups[k].count++;
    groups[k].total += spendAmount(t);
  }
  return Object.values(groups).filter((g) => g.count > 1).sort((a, b) => b.count - a.count).slice(0, limit);
}

// Next `days` days of expected charges, bucketed per day for the upcoming strip.
export function upcomingDays(subs, days = 7) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    buckets.push({ date: d, items: [], total: 0 });
  }
  for (const s of subs || []) {
    const due = nextDue(s);
    if (!due) continue;
    const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const idx = Math.round((dueMidnight - start.getTime()) / 86400000);
    if (idx < 0 || idx >= days) continue;
    buckets[idx].items.push(s);
    buckets[idx].total += Number(s.amount) || 0;
  }
  return buckets;
}

// Charges beyond the 7-day window, soonest first ("Coming later").
export function comingLater(subs, afterDays = 7, limit = 10) {
  const now = new Date();
  return (subs || [])
    .map((s) => ({ sub: s, due: nextDue(s) }))
    .filter((x) => x.due && (x.due.getTime() - now.getTime()) / 86400000 >= afterDays)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, limit);
}

export const subsMonthlyTotal = (subs) => (subs || []).reduce((s, x) => s + monthlyCost(x), 0);

// Assets/debts split with per-group share, for the Net Worth view and rails.
export function netWorthBreakdown(accounts) {
  const bucket = (a) => {
    const t = String(a.type || "").toLowerCase();
    if (/credit|loan|mortgage/.test(t)) return "Credit Cards";
    if (/invest|brokerage|retire|401|ira|hsa/.test(t)) return "Investments";
    if (/saving/.test(t)) return "Savings";
    if (/check|cash|depository|money market/.test(t)) return "Cash";
    return (Number(a.balance) || 0) < 0 ? "Other Debts" : "Other Assets";
  };
  const assets = [], debts = [];
  const groups = {};
  for (const a of accounts || []) {
    const g = bucket(a);
    groups[g] = groups[g] || { label: g, accounts: [], total: 0 };
    groups[g].accounts.push(a);
    groups[g].total += Number(a.balance) || 0;
    ((Number(a.balance) || 0) < 0 ? debts : assets).push(a);
  }
  const assetTotal = assets.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const debtTotal = debts.reduce((s, a) => s + Math.abs(Number(a.balance) || 0), 0);
  const list = Object.values(groups);
  return {
    assetGroups: list.filter((g) => g.total >= 0).map((g) => ({ ...g, pct: assetTotal > 0 ? (g.total / assetTotal) * 100 : 0 })),
    debtGroups: list.filter((g) => g.total < 0).map((g) => ({ ...g, total: Math.abs(g.total), pct: debtTotal > 0 ? (Math.abs(g.total) / debtTotal) * 100 : 0 })),
    assetTotal,
    debtTotal,
    net: assetTotal - debtTotal,
    assetCount: assets.length,
    debtCount: debts.length,
  };
}

// Most recent Plaid sync across linked accounts, as a relative string.
export function lastSyncedLabel(accounts) {
  const stamps = (accounts || [])
    .filter((a) => a.source === "plaid")
    .map((a) => Date.parse(a.updated_date || a.created_date || ""))
    .filter((n) => Number.isFinite(n));
  if (!stamps.length) return null;
  const mins = Math.round((Date.now() - Math.max(...stamps)) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
