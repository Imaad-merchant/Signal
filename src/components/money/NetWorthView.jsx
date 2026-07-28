// Net Worth — Rocket Money's Net Worth screen: Summary / Assets / Debt, a trend
// chart over the daily snapshots written by the plaid-sync cron, and grouped
// asset/debt rollups that expand to the underlying accounts.
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronDown, ChevronRight, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { fmtMoney } from "@/components/money/money";
import { netWorthBreakdown } from "@/components/money/analytics";
import { Avatar, Card, Empty, StatRow } from "@/components/money/ui";

const TABS = [
  { key: "summary", label: "Summary" },
  { key: "assets", label: "Assets" },
  { key: "debt", label: "Debt" },
];
const RANGES = [
  { key: "1M", days: 30 }, { key: "3M", days: 90 }, { key: "6M", days: 182 },
  { key: "1Y", days: 365 }, { key: "ALL", days: null },
];

export default function NetWorthView({ data, onChange = () => {} }) {
  const { accounts } = data;
  const [tab, setTab] = useState("summary");
  const [range, setRange] = useState("6M");

  const nw = useMemo(() => netWorthBreakdown(accounts), [accounts]);

  // Snapshots are written server-side; the client only reads them.
  const snapsQ = useQuery({
    queryKey: ["money", "networth"],
    queryFn: () => base44.entities.NetWorthSnapshot.list("-date", 400).catch(() => []),
  });
  const snaps = Array.isArray(snapsQ.data) ? snapsQ.data : [];

  const series = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days;
    let rows = snaps.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (days) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
      const iso = cutoff.toISOString().slice(0, 10);
      rows = rows.filter((s) => String(s.date) >= iso);
    }
    return rows.map((s) => ({ date: s.date, net: Number(s.net) || 0 }));
  }, [snaps, range]);

  const change = series.length > 1 ? series[series.length - 1].net - series[0].net : null;

  return (
    <>
      <div className="mt-3 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${tab === t.key ? "bg-white/10 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="text-[11px] uppercase tracking-wide text-gray-400">Total net worth</div>
        <div className="mt-0.5 text-3xl font-bold text-white">{fmtMoney(nw.net)}</div>
        {change != null && (
          <div className={`mt-1 inline-flex items-center gap-1 text-[11px] ${change >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {change >= 0 ? "Up" : "Down"} {fmtMoney(Math.abs(change))} over the last {range}
          </div>
        )}

        <div className="mt-3 h-32">
          {series.length < 2 ? (
            <div className="flex h-full items-center">
              <Empty>
                {snapsQ.isLoading
                  ? "Loading history…"
                  : "No history yet — a net-worth snapshot is recorded each day your banks sync, and the trend appears once there are a couple of days."}
              </Empty>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(d) => String(d).slice(5)} minTickGap={28} />
                <YAxis width={46} tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "#0e1015", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [fmtMoney(Number(v)), "Net worth"]}
                />
                <Area type="monotone" dataKey="net" stroke="#818cf8" strokeWidth={2} fill="url(#netWorthFill)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-2 flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2 py-0.5 text-[10px] ${range === r.key ? "bg-white/10 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </section>

      {tab !== "debt" && (
        <GroupList
          title="Assets"
          groups={nw.assetGroups}
          total={nw.assetTotal}
          onChange={onChange}
          empty="No asset accounts yet."
        />
      )}
      {tab !== "assets" && (
        <GroupList
          title="Debt"
          groups={nw.debtGroups}
          total={nw.debtTotal}
          tone="bad"
          onChange={onChange}
          empty="No debts — nice."
        />
      )}

      {tab === "summary" && (
        <Card title="Summary">
          <p className="mb-1 text-[11px] text-gray-500">This is how your net worth is calculated. Link every account for an accurate picture.</p>
          <div className="flex flex-col divide-y divide-white/[0.05]">
            <StatRow label="Assets" sub={`${nw.assetCount} accounts`} value={nw.assetTotal} tone="good" />
            <StatRow label="Debts" sub={`${nw.debtCount} accounts`} value={nw.debtTotal} tone="bad" />
            <StatRow label="Net worth" sub="Assets − Debts" value={nw.net} />
          </div>
        </Card>
      )}

      {tab === "summary" && <ManualAccount onChange={onChange} />}
    </>
  );
}

function GroupList({ title, groups, total, tone = "good", onChange, empty }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (label) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  const update = async (a, bal) => { await base44.entities.Account.update(a.id, { balance: Number(bal) || 0 }).catch(() => {}); onChange(); };
  const del = async (a) => { await base44.entities.Account.delete(a.id).catch(() => {}); onChange(); };

  return (
    <Card title={title} right={<span className={`text-[11px] font-semibold ${tone === "bad" ? "text-rose-300" : "text-gray-300"}`}>{fmtMoney(total)}</span>}>
      {groups.length === 0 ? <Empty>{empty}</Empty> : (
        <div className="flex flex-col divide-y divide-white/[0.05]">
          {groups.map((g) => {
            const isOpen = open.has(g.label);
            return (
              <div key={g.label}>
                <button onClick={() => toggle(g.label)} className="flex w-full items-center gap-2 py-2 text-left">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-gray-200">{g.label}</span>
                    <span className="block text-[10px] text-gray-500">{g.pct < 1 ? "< 1" : Math.round(g.pct)}% of {title.toLowerCase()}</span>
                  </span>
                  <span className={`shrink-0 text-sm ${tone === "bad" ? "text-rose-300" : "text-gray-200"}`}>{fmtMoney(g.total)}</span>
                </button>
                {isOpen && (
                  <div className="mb-2 flex flex-col gap-1 pl-5">
                    {g.accounts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                        <Avatar name={a.name} />
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {a.name}
                          {a.source === "plaid" && <span className="ml-1.5 rounded bg-white/5 px-1 text-[9px] uppercase text-gray-500">linked</span>}
                          <span className="block text-[10px] text-gray-500">{a.type}</span>
                        </span>
                        {a.source === "plaid"
                          ? <span className={`text-xs ${Number(a.balance) < 0 ? "text-rose-300" : "text-gray-200"}`}>{fmtMoney(a.balance)}</span>
                          : <input defaultValue={a.balance} onBlur={(e) => update(a, e.target.value)} type="number" className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-right text-xs outline-none focus:border-white/25" />}
                        {a.source !== "plaid" && <button onClick={() => del(a)} className="p-1 text-gray-600 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ManualAccount({ onChange }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Checking");
  const [balance, setBalance] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    await base44.entities.Account.create({ name: name.trim(), type, balance: Number(balance) || 0 }).catch(() => {});
    setName(""); setBalance(""); setOpen(false); onChange();
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200">
        <Plus className="h-3 w-3" /> Add manual account
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25" />
      <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
        {["Checking", "Savings", "Credit Card", "Investment", "Cash"].map((x) => <option key={x} className="bg-[#0e1015]">{x}</option>)}
      </select>
      <input value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" type="number" className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
      <button onClick={add} disabled={!name.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
