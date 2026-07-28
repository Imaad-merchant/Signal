// Spending — Rocket Money's Spending screen: period selector, 6-month bar strip,
// donut with total spend, category table with month-over-month deltas, the
// non-spending buckets, and the income/bills/spending summary.
import React, { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip,
} from "recharts";
import { TrendingUp, TrendingDown, Plus, Minus, Sparkles } from "lucide-react";
import { fmtMoney } from "@/components/money/money";
import {
  monthKey, shiftMonth, monthLabel, totalsForMonth, spendingWithDelta,
  nonSpendingBuckets, frequentSpend,
} from "@/components/money/analytics";
import { Card, catMeta, Empty, StatRow } from "@/components/money/ui";

const BAR_MONTHS = 6;

export default function SpendingView({ data }) {
  const { transactions, budgets } = data;
  const thisKey = monthKey();
  const [key, setKey] = useState(thisKey);

  const totals = useMemo(() => totalsForMonth(transactions, key), [transactions, key]);
  const prevTotals = useMemo(() => totalsForMonth(transactions, shiftMonth(key, -1)), [transactions, key]);
  const cats = useMemo(() => spendingWithDelta(transactions, key), [transactions, key]);
  const buckets = useMemo(() => nonSpendingBuckets(transactions, key), [transactions, key]);
  const frequent = useMemo(() => frequentSpend(transactions, key), [transactions, key]);

  const bars = useMemo(() => {
    const out = [];
    for (let i = BAR_MONTHS - 1; i >= 0; i--) {
      const k = shiftMonth(thisKey, -i);
      const t = totalsForMonth(transactions, k);
      out.push({ key: k, label: monthLabel(k, { month: "short" }), spend: t.spend, income: t.income });
    }
    return out;
  }, [transactions, thisKey]);

  const delta = prevTotals.spend > 0 ? ((totals.spend - prevTotals.spend) / prevTotals.spend) * 100 : null;
  const down = delta != null && delta < 0;
  const donut = cats.map((c) => ({ name: c.category, value: c.amount, color: catMeta(c.category).c }));
  const billsBudget = budgets.find((b) => b.category === "Bills & Utilities");
  const billsSpent = cats.find((c) => c.category === "Bills & Utilities")?.amount || 0;
  const saved = totals.income - totals.spend;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setKey(shiftMonth(thisKey, -1))}
          className={`rounded-lg px-2.5 py-1.5 text-[11px] ${key === shiftMonth(thisKey, -1) ? "bg-white/10 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
        >
          Last Month
        </button>
        <button
          onClick={() => setKey(thisKey)}
          className={`rounded-lg px-2.5 py-1.5 text-[11px] ${key === thisKey ? "bg-white/10 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
        >
          This Month
        </button>
        <input
          type="month"
          value={key}
          max={thisKey}
          onChange={(e) => e.target.value && setKey(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-gray-300 outline-none focus:border-cyan-400/40"
        />
      </div>

      {/* 6-month strip */}
      <Card title="Last 6 months" right={<span className="text-[10px] text-gray-500">spend vs income</span>}>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={2}>
              <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#0e1015", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                formatter={(v, n) => [fmtMoney(Number(v)), n === "spend" ? "Spend" : "Income"]}
              />
              <Bar dataKey="income" fill="#10b981" radius={[2, 2, 0, 0]} opacity={0.5} />
              <Bar dataKey="spend" radius={[2, 2, 0, 0]}>
                {bars.map((b) => <Cell key={b.key} fill={b.key === key ? "#22d3ee" : "#3f4756"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Donut + category table */}
      <Card
        title={`Spending — ${monthLabel(key)}`}
        right={delta != null && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${down ? "text-emerald-300" : "text-rose-300"}`}>
            {down ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}% vs prior
          </span>
        )}
      >
        {cats.length === 0 ? <Empty>No spending recorded for {monthLabel(key)}.</Empty> : (
          <>
            <div className="relative mx-auto h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
                    {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0e1015", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                    formatter={(v, n) => [fmtMoney(Number(v)), n]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] uppercase tracking-wide text-gray-500">Total spend</span>
                <span className="text-lg font-bold text-white">{fmtMoney(totals.spend)}</span>
              </div>
            </div>

            <div className="mt-3 flex flex-col divide-y divide-white/[0.05]">
              {cats.map((c) => {
                const m = catMeta(c.category);
                const up = c.delta != null && c.delta > 0;
                return (
                  <div key={c.category} className="flex items-center gap-2.5 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${m.c}22` }}>
                      <m.Icon className="h-3.5 w-3.5" style={{ color: m.c }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-gray-200">{c.category}</span>
                      <span className="block text-[10px] text-gray-500">{c.pct < 1 ? "< 1" : Math.round(c.pct)}% of spend</span>
                    </span>
                    {c.delta != null && (
                      <span className={`inline-flex shrink-0 items-center gap-0.5 text-[10px] ${up ? "text-rose-300" : "text-emerald-300"}`}>
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(Math.round(c.delta))}%
                      </span>
                    )}
                    <span className="w-20 shrink-0 text-right text-sm text-gray-200">{fmtMoney(c.amount)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Summary */}
      <Card title="Summary" right={<span className="text-[10px] text-gray-500">{monthLabel(key)}</span>}>
        <div className="flex flex-col divide-y divide-white/[0.05]">
          <StatRow icon={Plus} label="Income" sub={`${totals.count} transactions`} value={totals.income} tone="good" />
          <StatRow
            icon={Minus}
            label="Bills"
            sub={billsBudget ? `${fmtMoney(Math.max(0, billsSpent - Number(billsBudget.amount)))} over budget` : "no budget set"}
            value={billsSpent}
          />
          <StatRow icon={Minus} label="Spending" sub={prevTotals.spend > 0 ? `${fmtMoney(Math.abs(totals.spend - prevTotals.spend))} ${totals.spend < prevTotals.spend ? "less" : "more"} than prior` : null} value={totals.spend} />
          {totals.income > 0 && (
            <StatRow
              icon={Sparkles}
              label={saved >= 0 ? "Saved" : "Overspent"}
              sub={`${Math.abs(Math.round((saved / totals.income) * 100))}% of income`}
              value={saved}
              tone={saved >= 0 ? "good" : "bad"}
            />
          )}
        </div>
      </Card>

      {/* Non-spending + frequent */}
      <Card title="Non-spending">
        <div className="flex flex-col divide-y divide-white/[0.05]">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center justify-between py-2 text-xs">
              <span className="text-gray-400">{b.label}</span>
              <span className="text-gray-300">{b.count ? b.value : fmtMoney(b.value)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Frequent spend">
        {frequent.length === 0 ? <Empty>No repeat merchants this month.</Empty> : (
          <div className="flex flex-col gap-1.5">
            {frequent.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="min-w-0 flex-1 truncate text-gray-300">
                  You&apos;ve spent at <span className="text-gray-100">{f.merchant}</span> {f.count} times
                </span>
                <span className="shrink-0 text-gray-300">{fmtMoney(f.total)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
