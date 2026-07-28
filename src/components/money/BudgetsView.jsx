// Budgets — Rocket Money's Budgets screen: a month pager over Budget Basics
// (Earnings, Bills & Utilities) and Budget Categories, each row showing
// Budgeted / Actual / Remaining with a ring, plus the Left-to-Spend summary.
//
// A Budget row is a recurring monthly target ({ category, amount }); paging the
// month changes the actuals it is measured against, not the target itself.
import React, { useMemo, useState } from "react";
import { Plus, Trash2, PiggyBank } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CATEGORIES, fmtMoney } from "@/components/money/money";
import { monthKey, monthLabel, spendingWithDelta, totalsForMonth } from "@/components/money/analytics";
import { Card, catMeta, Empty, MonthPager, Ring } from "@/components/money/ui";

const BASIC_CATEGORIES = ["Income", "Bills & Utilities"];

export default function BudgetsView({ data, onChange = () => {} }) {
  const { transactions, budgets } = data;
  const thisKey = monthKey();
  const [key, setKey] = useState(thisKey);
  const [adding, setAdding] = useState(false);

  const totals = useMemo(() => totalsForMonth(transactions, key), [transactions, key]);
  const spentByCat = useMemo(() => {
    const rows = spendingWithDelta(transactions, key);
    return Object.fromEntries(rows.map((r) => [r.category, r.amount]));
  }, [transactions, key]);

  // "Earnings" is measured against income, not spend.
  const actualFor = (category) => (category === "Income" ? totals.income : spentByCat[category] || 0);

  const rows = budgets.map((b) => {
    const budgeted = Number(b.amount) || 0;
    const actual = actualFor(b.category);
    const remaining = isEarningsCategory(b.category) ? actual - budgeted : budgeted - actual;
    return { ...b, budgeted, actual, remaining, isEarnings: isEarningsCategory(b.category) };
  });
  const basics = rows.filter((r) => BASIC_CATEGORIES.includes(r.category));
  const categories = rows.filter((r) => !BASIC_CATEGORIES.includes(r.category));

  const spendBudget = rows.filter((r) => !r.isEarnings).reduce((s, r) => s + r.budgeted, 0);
  const spendActual = rows.filter((r) => !r.isEarnings).reduce((s, r) => s + r.actual, 0);
  const leftToSpend = spendBudget - spendActual;
  const earningsBudget = rows.find((r) => r.isEarnings)?.budgeted || 0;
  const leftForSavings = earningsBudget > 0 ? earningsBudget - spendBudget : null;

  const daysLeft = (() => {
    if (key !== thisKey) return null;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  })();

  const used = budgetedSet(budgets);
  const available = CATEGORIES.filter((c) => !used.has(c));

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#16191d]">{monthLabel(key)} Budget</h2>
        <MonthPager value={key} onChange={setKey} canGoNext={key < thisKey} />
      </div>

      {/* Left to spend */}
      <Card title="Left to spend" right={<span className="text-[10px] text-[#8b929c]">of {fmtMoney(spendBudget)}</span>}>
        {spendBudget === 0 ? <Empty>Set a budget below to track how you&apos;re pacing.</Empty> : (
          <div className="flex items-center gap-4">
            <Ring pct={(spendActual / spendBudget) * 100} over={leftToSpend < 0} size={72} stroke={7} />
            <div className="min-w-0 flex-1">
              <div className={`text-2xl font-bold ${leftToSpend < 0 ? "text-[#b54708]" : "text-[#16191d]"}`}>{fmtMoney(leftToSpend)}</div>
              <div className="mt-0.5 text-[11px] text-[#8b929c]">
                {leftToSpend < 0
                  ? `${fmtMoney(-leftToSpend)} over your ${fmtMoney(spendBudget)} budget`
                  : daysLeft != null
                    ? `That's ${fmtMoney(daysLeft > 0 ? leftToSpend / daysLeft : leftToSpend)}/day for the next ${daysLeft} day${daysLeft === 1 ? "" : "s"} of the month.`
                    : `of ${fmtMoney(spendBudget)} budgeted`}
              </div>
            </div>
          </div>
        )}
      </Card>

      <BudgetTable
        title="Budget basics"
        rows={basics}
        empty="Add an Earnings or Bills & Utilities budget to set your baseline."
        onChange={onChange}
      />

      <BudgetTable title="Budget categories" rows={categories} empty="No category budgets yet." onChange={onChange}>
        {leftForSavings != null && (
          <div className="flex items-center gap-2.5 border-t border-[#e6e8ec] pt-2">
            <PiggyBank className="h-4 w-4 shrink-0 text-[#0f7b53]" />
            <span className="flex-1 text-xs text-[#454b54]">Left for savings</span>
            <span className={`text-sm font-medium ${leftForSavings >= 0 ? "text-[#0f7b53]" : "text-[#b54708]"}`}>{fmtMoney(leftForSavings)}</span>
          </div>
        )}

        {adding ? (
          <AddBudget available={available} onDone={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />
        ) : available.length > 0 && (
          <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-lg border border-[#dcdfe4] py-2 text-[11px] text-[#454b54] hover:border-[#d81b48]/45">
            <Plus className="mr-1 inline h-3 w-3" /> Add Budget
          </button>
        )}
      </BudgetTable>
    </>
  );
}

const isEarningsCategory = (c) => c === "Income";
const budgetedSet = (budgets) => new Set(budgets.map((b) => b.category));

function BudgetTable({ title, rows, empty, onChange, children = null }) {
  const update = async (b, amt) => { await base44.entities.Budget.update(b.id, { amount: Number(amt) || 0 }).catch(() => {}); onChange(); };
  const del = async (b) => { await base44.entities.Budget.delete(b.id).catch(() => {}); onChange(); };

  return (
    <Card title={title}>
      <div className="mb-1 flex items-center gap-2 px-1 text-[9px] uppercase tracking-wide text-[#a8aeb8]">
        <span className="flex-1">Name</span>
        <span className="w-16 text-right">Budgeted</span>
        <span className="w-16 text-right">Actual</span>
        <span className="w-20 text-right">Remaining</span>
        <span className="w-11" />
      </div>

      <div className="flex flex-col divide-y divide-[#eef0f3]">
        {rows.length === 0 && <Empty>{empty}</Empty>}
        {rows.map((b) => {
          const m = catMeta(b.category);
          const pct = b.budgeted > 0 ? (b.actual / b.budgeted) * 100 : 0;
          const short = b.remaining < 0;
          return (
            <div key={b.id} className="flex items-center gap-2 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${m.c}22` }}>
                <m.Icon className="h-3.5 w-3.5" style={{ color: m.c }} />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-[#16191d]">{b.isEarnings ? "Earnings" : b.category}</span>
              <input
                defaultValue={b.budgeted}
                onBlur={(e) => update(b, e.target.value)}
                type="number"
                className="w-16 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right text-xs text-[#454b54] outline-none hover:border-[#dcdfe4] focus:border-[#16191d]"
              />
              <span className="w-16 shrink-0 text-right text-xs text-[#454b54]">{fmtMoney(b.actual)}</span>
              <span className={`w-20 shrink-0 text-right text-xs ${short ? "text-[#b54708]" : "text-[#0f7b53]"}`}>{fmtMoney(b.remaining)}</span>
              <span className="flex w-11 shrink-0 items-center justify-end gap-1">
                <Ring pct={pct} over={short} color={m.c} />
                <button onClick={() => del(b)} className="p-0.5 text-[#a8aeb8] hover:text-[#c01530]"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          );
        })}
      </div>
      {children}
    </Card>
  );
}

function AddBudget({ available, onDone, onCancel }) {
  const [cat, setCat] = useState(available[0] || "Food");
  const [amount, setAmount] = useState("");
  const add = async () => {
    if (!cat || !amount) return;
    await base44.entities.Budget.create({ category: cat, amount: Number(amount) || 0 }).catch(() => {});
    onDone();
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <select value={cat} onChange={(e) => setCat(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#dcdfe4] bg-white px-2 py-1.5 text-xs text-[#454b54] outline-none">
        {available.map((c) => <option key={c} value={c} className="bg-white">{c === "Income" ? "Earnings" : c}</option>)}
      </select>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" type="number" className="w-24 rounded-lg border border-[#dcdfe4] bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-[#16191d]" />
      <button onClick={add} disabled={!cat || !amount} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#16191d] text-white disabled:opacity-40 hover:bg-[#2b3038]"><Plus className="h-4 w-4" /></button>
      <button onClick={onCancel} className="text-[11px] text-[#8b929c] hover:text-[#454b54]">Cancel</button>
    </div>
  );
}
