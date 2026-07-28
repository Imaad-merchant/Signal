// The five non-Overview views. Phase 0 gives each one its matching card so the
// section navigates end to end; phases 2–6 replace these bodies in place with
// the fuller Rocket-Money-shaped screens (filters, sub-tabs, month pagers).
import React from "react";
import { Accounts, SpendingCard, BudgetsCard } from "@/components/money/sections";


export function SpendingView({ data }) {
  const { byCat, monthSpend, spendDelta } = data;
  return <SpendingCard byCat={byCat} total={monthSpend} delta={spendDelta} />;
}

export function BudgetsView({ data, onChange }) {
  const { budgets, byCat } = data;
  return <BudgetsCard budgets={budgets} byCat={byCat} onChange={onChange} />;
}

export function NetWorthView({ data, onChange }) {
  const { accounts, netWorth } = data;
  return <Accounts accounts={accounts} netWorth={netWorth} onChange={onChange} />;
}
