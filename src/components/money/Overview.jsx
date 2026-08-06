// Overview — Rocket Money's Dashboard.
// Current-spend hero with a this-month vs last-month cumulative curve, an
// accounts rollup, the 7-day upcoming strip, budget pacing, and recent activity.
import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingDown, TrendingUp, CalendarClock, RefreshCw } from "lucide-react";
import { fmtMoney } from "@/components/money/money";
import {
  monthKey, cumulativeCompare, totalsForMonth, upcomingDays, netWorthBreakdown, lastSyncedLabel,
} from "@/components/money/analytics";
import { resolveCategory } from "@/components/money/rules";
import { Card, catMeta, Empty, Ring } from "@/components/money/ui";

const weekday = (d) => d.toLocaleDateString(undefined, { weekday: "short" });
const todayIso = () => new Date().toISOString().slice(0, 10);

function SpendTooltip({ active = false, payload = null, label = null }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#dcdfe4] bg-white px-2.5 py-1.5 text-[11px] shadow-lg">
      <div className="mb-0.5 text-[#8b929c]">Day {label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.stroke }} />
          <span className="text-[#6b727e]">{p.dataKey === "thisMonth" ? "This month" : "Last month"}</span>
          <span className="ml-auto text-[#16191d]">{fmtMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Overview({ data, onGoToView = () => {} }) {
  const { accounts, transactions, budgets, subs, rules, monthSpend, byCat } = data;
  const key = monthKey();

  const series = useMemo(() => cumulativeCompare(transactions, key), [transactions, key]);
  const lastTotals = useMemo(() => {
    const [y, m] = key.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    return totalsForMonth(transactions, `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
  }, [transactions, key]);
  const upcoming = useMemo(() => upcomingDays(subs, 7), [subs]);
  const nw = useMemo(() => netWorthBreakdown(accounts), [accounts]);
  const synced = lastSyncedLabel(accounts);

  const diff = monthSpend - lastTotals.spend;
  const under = diff < 0;
  const upcomingTotal = upcoming.reduce((s, d) => s + d.total, 0);
  const upcomingCount = upcoming.reduce((s, d) => s + d.items.length, 0);

  const spentByCat = Object.fromEntries(byCat.map((c) => [c.category, c.total]));
  const paced = budgets
    .map((b) => ({ ...b, spent: spentByCat[b.category] || 0, limit: Number(b.amount) || 0 }))
    .sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)))
    .slice(0, 4);

  return (
    // Rocket Money's dashboard is a wide main column plus a right rail;
    // it collapses to a single stacked column below `lg`.
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col">
          {/* Current spend hero */}
        <section className="mt-1 rounded-2xl border border-[#e6e8ec] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#6b727e]">Current spend</div>
              <div className="mt-0.5 text-3xl font-bold text-[#16191d]">{fmtMoney(monthSpend)}</div>
            </div>
            {lastTotals.spend > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ${under ? "bg-emerald-500/10 text-[#0f7b53]" : "bg-rose-500/10 text-[#c01530]"}`}>
                {under ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                {fmtMoney(Math.abs(diff))} {under ? "less" : "more"} than last month
              </span>
            )}
          </div>

          <div className="mt-3 h-36">
            {series.length === 0 ? <Empty>No spending recorded yet this month.</Empty> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="moneySpendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7b8ff7" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7b8ff7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: "#8b929c", fontSize: 10 }} axisLine={false} tickLine={false} interval={6} />
                  <YAxis width={44} tick={{ fill: "#8b929c", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 100) / 10}k`} />
                  <Tooltip content={<SpendTooltip />} cursor={{ stroke: "#c4c9d0" }} />
                  <Area type="monotone" dataKey="lastMonth" stroke="#c4c9d0" strokeWidth={1.5} fill="none" dot={false} connectNulls />
                  <Area type="monotone" dataKey="thisMonth" stroke="#7b8ff7" strokeWidth={2} fill="url(#moneySpendFill)" dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-1 flex items-center gap-4 text-[10px] text-[#8b929c]">
            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-[#7b8ff7]" /> This month</span>
            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-[#c4c9d0]" /> Last month</span>
          </div>
        </section>
        <Card
          title="Recent transactions"
          right={
            <button onClick={() => onGoToView("transactions")} className="text-[11px] text-[#d81b48] hover:text-[#a81438]">
              See all
            </button>
          }
        >
          <RecentTransactions transactions={transactions} rules={rules} />
        </Card>
      </div>

      <aside className="flex min-w-0 flex-col lg:sticky lg:top-4">
          <Card
          title="Accounts"
          right={synced && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#8b929c]">
              <RefreshCw className="h-3 w-3" /> synced {synced}
            </span>
          )}
        >
          {accounts.length === 0 ? <Empty>Connect a bank to see your balances here.</Empty> : (
            <div className="flex flex-col divide-y divide-[#eef0f3]">
              {nw.assetGroups.map((g) => (
                <div key={g.label} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#454b54]">{g.label}<span className="ml-1.5 text-[10px] text-[#8b929c]">{g.accounts.length}</span></span>
                  <span className="text-[#16191d]">{fmtMoney(g.total)}</span>
                </div>
              ))}
              {nw.debtGroups.map((g) => (
                <div key={g.label} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#454b54]">{g.label}<span className="ml-1.5 text-[10px] text-[#8b929c]">{g.accounts.length}</span></span>
                  <span className="text-[#c01530]">{fmtMoney(g.total)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="font-medium text-[#16191d]">Net worth</span>
                <span className="font-semibold text-[#16191d]">{fmtMoney(nw.net)}</span>
              </div>
            </div>
          )}
        </Card>
        {/* Upcoming 7 days */}
        <Card
          title="Upcoming"
          right={<span className="inline-flex items-center gap-1 text-[10px] text-[#8b929c]"><CalendarClock className="h-3 w-3" /> next 7 days</span>}
        >
          <p className="mb-2 text-[11px] text-[#6b727e]">
            {upcomingCount === 0
              ? "Nothing due in the next 7 days."
              : `${upcomingCount} recurring charge${upcomingCount > 1 ? "s" : ""} due for ${fmtMoney(upcomingTotal)}.`}
          </p>
          <div className="grid grid-cols-7 gap-1">
            {upcoming.map((d, i) => (
              <div key={i} className={`rounded-lg border p-1.5 text-center ${i === 0 ? "border-[#d81b48]/35 bg-[#d81b48]/5" : "border-[#e6e8ec]"}`}>
                <div className={`text-[9px] uppercase ${i === 0 ? "text-[#d81b48]" : "text-[#8b929c]"}`}>{i === 0 ? "Today" : weekday(d.date)}</div>
                <div className="text-xs font-medium text-[#454b54]">{d.date.getDate()}</div>
                <div className="mt-1 flex min-h-[10px] flex-wrap justify-center gap-0.5">
                  {d.items.slice(0, 3).map((s, j) => (
                    <span key={j} className="h-1.5 w-1.5 rounded-full bg-[#7b8ff7]" title={s.merchant} />
                  ))}
                </div>
                <div className="mt-0.5 text-[9px] text-[#8b929c]">{d.total > 0 ? `$${Math.round(d.total)}` : ""}</div>
              </div>
            ))}
          </div>
        </Card>
        {/* Budget pacing */}
        <Card title="Budget" right={paced.length > 0 && <span className="text-[10px] text-[#8b929c]">this month</span>}>
          {paced.length === 0 ? <Empty>No budgets set — add one from the Budgets view.</Empty> : (
            <div className="flex flex-col gap-2.5">
              {paced.map((b) => {
                const m = catMeta(b.category);
                const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : 0;
                const over = b.spent > b.limit;
                return (
                  <div key={b.id} className="flex items-center gap-2.5">
                    <Ring pct={pct} over={over} color={m.c} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate text-[#454b54]">{b.category}</span>
                        <span className={over ? "text-[#b54708]" : "text-[#0f7b53]"}>
                          {over ? `${fmtMoney(b.spent - b.limit)} over` : `${fmtMoney(b.limit - b.spent)} left`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(3, pct))}%`, background: over ? "#fb923c" : m.c }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

// Read-only recent activity — editing lives in the Transactions view.
function RecentTransactions({ transactions, rules }) {
  const recent = transactions.slice(0, 12);
  if (recent.length === 0) return <Empty>No transactions yet — connect a bank, or add one from the Transactions view.</Empty>;

  const groups = [];
  const byDate = {};
  for (const t of recent) {
    const d = t.date || "—";
    if (!byDate[d]) { byDate[d] = []; groups.push(d); }
    byDate[d].push(t);
  }
  const label = (d) => {
    if (d === todayIso()) return "Today";
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col gap-3">
      {groups.map((d) => {
        const dayTotal = byDate[d].reduce((s, t) => s + (Number(t.amount) || 0), 0);
        return (
          <div key={d}>
            <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wide text-[#8b929c]">
              <span>{label(d)}</span>
              <span>{fmtMoney(dayTotal)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {byDate[d].map((t) => {
                const c = resolveCategory(t, rules);
                const m = catMeta(c);
                return (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-[#f7f8fa]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${m.c}22` }}>
                      <m.Icon className="h-4 w-4" style={{ color: m.c }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className={t.ignored ? "text-[#8b929c] line-through" : ""}>{t.merchant}</span>
                      <span className="block text-[10px] text-[#8b929c]">{c}{t.pending ? " · pending" : ""}</span>
                    </span>
                    <span className={`shrink-0 text-sm ${Number(t.amount) < 0 ? "text-[#16191d]" : "text-[#0f7b53]"}`}>{fmtMoney(t.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
