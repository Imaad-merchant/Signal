// Overview — the Money section's landing view (Rocket Money's "Dashboard").
// Phase 0 composes the original cards; phase 1 replaces the hero with the
// current-spend chart and adds the accounts / upcoming / budget rails.
import React from "react";
import { fmtMoney } from "@/components/money/money";
import { Accounts, SpendingCard, BudgetsCard, SubscriptionsCard, TransactionsCard } from "@/components/money/sections";

const monthName = () => new Date().toLocaleString(undefined, { month: "long" });

export default function Overview({ data, onChange = () => {} }) {
  const { accounts, transactions, budgets, subs, netWorth, monthSpend, monthIncome, subsMonthly, byCat, spendDelta } = data;

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-violet-500/15 p-5">
        <div className="text-[11px] uppercase tracking-wide text-gray-400">Net worth</div>
        <div className="mt-1 text-3xl font-bold text-white">{fmtMoney(netWorth)}</div>
        <div className="mt-3 flex gap-5 text-xs">
          <div><span className="text-gray-400">Spent in {monthName()}</span><div className="text-sm font-semibold text-rose-300">{fmtMoney(monthSpend)}</div></div>
          <div><span className="text-gray-400">Income</span><div className="text-sm font-semibold text-emerald-300">{fmtMoney(monthIncome)}</div></div>
          <div><span className="text-gray-400">Subscriptions</span><div className="text-sm font-semibold text-violet-300">{fmtMoney(subsMonthly)}/mo</div></div>
        </div>
      </div>

      <Accounts accounts={accounts} netWorth={netWorth} onChange={onChange} />
      <SpendingCard byCat={byCat} total={monthSpend} delta={spendDelta} />
      <BudgetsCard budgets={budgets} byCat={byCat} onChange={onChange} />
      <SubscriptionsCard subs={subs} monthly={subsMonthly} onChange={onChange} />
      <TransactionsCard transactions={transactions} accounts={accounts} onChange={onChange} />
    </>
  );
}
