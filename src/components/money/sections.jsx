// The original Money-page cards, moved out of src/pages/Money.jsx unchanged.
// Each view (Overview, Spending, Budgets, Recurring, Transactions, Net Worth)
// composes these; later phases deepen them in place.
import React, { useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Plus, Trash2, Upload, TrendingUp, TrendingDown, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  CATEGORIES, categorize, fmtMoney, yearlyCost, nextDue, relDue, parseTransactionsCsv,
} from "@/components/money/money";
import { Avatar, Card, catMeta, Empty } from "@/components/money/ui";

const today = () => new Date().toISOString().slice(0, 10);

export function AccountRow({ a, onChange }) {
  const update = async (bal) => { await base44.entities.Account.update(a.id, { balance: Number(bal) || 0 }).catch(() => {}); onChange(); };
  const del = async () => { await base44.entities.Account.delete(a.id).catch(() => {}); onChange(); };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
      <Avatar name={a.name} />
      <span className="min-w-0 flex-1 truncate text-sm">{a.name}
        {a.source === "plaid" && <span className="ml-1.5 rounded bg-white/5 px-1 text-[9px] uppercase text-gray-500">linked</span>}
        <span className="block text-[10px] text-gray-500">{a.type}</span>
      </span>
      {a.source === "plaid"
        ? <span className={`text-sm ${Number(a.balance) < 0 ? "text-rose-300" : "text-gray-200"}`}>{fmtMoney(a.balance)}</span>
        : <input defaultValue={a.balance} onBlur={(e) => update(e.target.value)} type="number" className="w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-right text-sm outline-none focus:border-white/25" />}
      {a.source !== "plaid" && <button onClick={del} className="p-1 text-gray-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}

export function Accounts({ accounts, netWorth, onChange }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Checking");
  const [balance, setBalance] = useState("");
  const assets = accounts.filter((a) => (Number(a.balance) || 0) >= 0);
  const debts = accounts.filter((a) => (Number(a.balance) || 0) < 0);
  const assetTotal = assets.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const debtTotal = debts.reduce((s, a) => s + Math.abs(Number(a.balance) || 0), 0);
  const add = async () => {
    if (!name.trim()) return;
    await base44.entities.Account.create({ name: name.trim(), type, balance: Number(balance) || 0 }).catch(() => {});
    setName(""); setBalance(""); setOpen(false); onChange();
  };

  return (
    <Card title="Net worth" right={<span className="text-[11px] font-semibold text-gray-300">{fmtMoney(netWorth)}</span>}>
      <div className="flex flex-col gap-3">
        {accounts.length === 0 && <Empty>Connect a bank or add accounts to see your net worth.</Empty>}

        {assets.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
              <span className="text-emerald-400/80">Assets</span><span>{fmtMoney(assetTotal)}</span>
            </div>
            <div className="flex flex-col gap-1">{assets.map((a) => <AccountRow key={a.id} a={a} onChange={onChange} />)}</div>
          </div>
        )}
        {debts.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
              <span className="text-rose-400/80">Debt</span><span className="text-rose-300">{fmtMoney(debtTotal)}</span>
            </div>
            <div className="flex flex-col gap-1">{debts.map((a) => <AccountRow key={a.id} a={a} onChange={onChange} />)}</div>
          </div>
        )}
        {(assets.length > 0 || debts.length > 0) && (
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
            <span className="text-gray-400">Assets − Debt</span>
            <span className="font-semibold text-white">{fmtMoney(netWorth)}</span>
          </div>
        )}

        {open ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25" />
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
              {["Checking", "Savings", "Credit Card", "Investment", "Cash"].map((x) => <option key={x} className="bg-[#0e1015]">{x}</option>)}
            </select>
            <input value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" type="number" className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
            <button onClick={add} disabled={!name.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="inline-flex w-fit items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"><Plus className="h-3 w-3" /> Add manual account</button>
        )}
      </div>
    </Card>
  );
}

export function SpendingCard({ byCat, total, delta, title = "Spending this month" }) {
  const data = byCat.map((c) => ({ name: c.category, value: c.total, color: catMeta(c.category).c }));
  const up = delta != null && delta > 0;
  return (
    <Card title={title} right={delta != null && (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-rose-300" : "text-emerald-300"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(delta).toFixed(0)}% vs last mo
      </span>
    )}>
      {byCat.length === 0 ? (
        <Empty>No spending yet this month — add or import transactions below.</Empty>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={68} paddingAngle={2} stroke="none">
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[9px] uppercase tracking-wide text-gray-500">Total spend</span>
              <span className="text-base font-bold text-white">{fmtMoney(total)}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            {byCat.slice(0, 6).map((c) => {
              const m = catMeta(c.category);
              const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
              return (
                <div key={c.category} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.c }} />
                  <m.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: m.c }} />
                  <span className="min-w-0 flex-1 truncate text-gray-300">{c.category}</span>
                  <span className="shrink-0 text-gray-500">{pct}%</span>
                  <span className="w-16 shrink-0 text-right text-gray-300">{fmtMoney(c.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

export function BudgetsCard({ budgets, byCat, onChange }) {
  const [open, setOpen] = useState(false);
  const spentByCat = Object.fromEntries(byCat.map((c) => [c.category, c.total]));
  const budgetCats = new Set(budgets.map((b) => b.category));
  const available = CATEGORIES.filter((c) => c !== "Income" && !budgetCats.has(c));
  const [cat, setCat] = useState(available[0] || "Food");
  const [amount, setAmount] = useState("");
  const totalBudget = budgets.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (spentByCat[b.category] || 0), 0);

  const add = async () => {
    if (!cat || !amount) return;
    await base44.entities.Budget.create({ category: cat, amount: Number(amount) || 0 }).catch(() => {});
    setAmount(""); setOpen(false); onChange();
  };
  const update = async (b, amt) => { await base44.entities.Budget.update(b.id, { amount: Number(amt) || 0 }).catch(() => {}); onChange(); };
  const del = async (b) => { await base44.entities.Budget.delete(b.id).catch(() => {}); onChange(); };

  return (
    <Card title="Budgets" right={budgets.length > 0 && <span className="text-[11px] font-semibold text-gray-300">{fmtMoney(totalSpent)} / {fmtMoney(totalBudget)}</span>}>
      <div className="flex flex-col gap-2.5">
        {budgets.length === 0 && !open && <Empty>Set a monthly limit per category to track how you&apos;re pacing.</Empty>}
        {budgets.slice().sort((a, b) => (spentByCat[b.category] || 0) / (b.amount || 1) - (spentByCat[a.category] || 0) / (a.amount || 1)).map((b) => {
          const m = catMeta(b.category);
          const spent = spentByCat[b.category] || 0;
          const limit = Number(b.amount) || 0;
          const pct = limit > 0 ? (spent / limit) * 100 : 0;
          const over = spent > limit;
          const remaining = limit - spent;
          return (
            <div key={b.id} className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${m.c}22` }}>
                <m.Icon className="h-4 w-4" style={{ color: m.c }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center justify-between text-xs">
                  <span className="text-gray-300">{b.category}</span>
                  <span className={over ? "text-orange-300" : "text-emerald-300"}>{over ? `${fmtMoney(spent - limit)} over` : `${fmtMoney(remaining)} left`}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(3, pct))}%`, background: over ? "#fb923c" : m.c }} />
                </div>
                <div className="mt-0.5 text-[10px] text-gray-500">{fmtMoney(spent)} of {fmtMoney(limit)}</div>
              </div>
              <input defaultValue={b.amount} onBlur={(e) => update(b, e.target.value)} type="number" className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-right text-xs outline-none focus:border-white/25" />
              <button onClick={() => del(b)} className="p-1 text-gray-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}

        {open ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
              {available.map((c) => <option key={c} className="bg-[#0e1015]">{c}</option>)}
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" type="number" className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
            <button onClick={add} disabled={!cat || !amount} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
          </div>
        ) : available.length > 0 && (
          <button onClick={() => setOpen(true)} className="inline-flex w-fit items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"><Plus className="h-3 w-3" /> Add budget</button>
        )}
      </div>
    </Card>
  );
}

export function SubscriptionsCard({ subs, monthly, onChange }) {
  const [open, setOpen] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const add = async () => {
    if (!merchant.trim() || !amount) return;
    await base44.entities.Subscription.create({ merchant: merchant.trim(), amount: Number(amount) || 0, cadence, active: true }).catch(() => {});
    setMerchant(""); setAmount(""); setOpen(false); onChange();
  };
  const track = async (d) => { await base44.entities.Subscription.create({ merchant: d.merchant, amount: d.amount, cadence: d.cadence, active: true }).catch(() => {}); onChange(); };
  const cancel = async (s) => { if (s.id) { await base44.entities.Subscription.update(s.id, { active: false }).catch(() => {}); onChange(); } };
  const yearly = subs.reduce((s, x) => s + yearlyCost(x), 0);
  return (
    <Card title="Recurring & subscriptions" right={
      <span className="text-right text-[11px] leading-tight">
        <span className="block font-semibold text-violet-300">{fmtMoney(monthly)}/mo</span>
        <span className="block text-gray-500">{subs.length} · {fmtMoney(yearly)}/yr</span>
      </span>
    }>
      <div className="flex flex-col gap-1.5">
        {subs.map((s, i) => {
          const due = nextDue(s);
          return (
            <div key={s.id || `auto-${i}`} className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2">
              <Avatar name={s.merchant} />
              <span className="min-w-0 flex-1 truncate text-sm capitalize">{s.merchant}
                {s.source === "auto" && <span className="ml-1.5 rounded bg-white/5 px-1 text-[9px] uppercase text-gray-500">auto</span>}
                <span className="block text-[10px] text-gray-500 capitalize">{s.cadence}{due ? ` · ${relDue(due)}` : ""}</span>
              </span>
              <span className="shrink-0 text-sm text-gray-200">{fmtMoney(s.amount)}</span>
              {s.source === "manual"
                ? <button onClick={() => cancel(s)} title="Cancel/hide" className="p-1 text-gray-500 hover:text-red-300"><X className="h-4 w-4" /></button>
                : <button onClick={() => track(s)} title="Track this" className="p-1 text-gray-500 hover:text-cyan-300"><Plus className="h-4 w-4" /></button>}
            </div>
          );
        })}
        {subs.length === 0 && <Empty>None yet. Import or link transactions and recurring charges show up automatically, or add one.</Empty>}
        {open ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Netflix" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25" />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15.99" type="number" className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
            <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
              {["monthly", "yearly", "weekly"].map((x) => <option key={x} className="bg-[#0e1015]">{x}</option>)}
            </select>
            <button onClick={add} disabled={!merchant.trim() || !amount} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"><Plus className="h-3 w-3" /> Add subscription</button>
        )}
      </div>
    </Card>
  );
}

export function TransactionsCard({ transactions, accounts, onChange, limit = 60 }) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState("");
  const [date, setDate] = useState(today());
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const fileRef = useRef(null);

  const addTx = async () => {
    if (!merchant.trim() || !amount) return;
    const amt = Number(amount);
    await base44.entities.Transaction.create({
      date, merchant: merchant.trim(), amount: amt, category: cat || categorize(merchant, amt), account_id: accounts[0]?.id || null,
    }).catch(() => {});
    setMerchant(""); setAmount(""); setCat(""); setAdding(false); onChange();
  };
  const del = async (t) => { await base44.entities.Transaction.delete(t.id).catch(() => {}); onChange(); };

  const importCsv = async (text) => {
    const parsed = parseTransactionsCsv(text);
    if (!parsed.length) { setMsg("Couldn't read any rows — expected Date, Description, Amount columns."); return; }
    setImporting(true); setMsg("");
    try {
      const rows = parsed.slice(0, 2000).map((p) => ({ ...p, account_id: accounts[0]?.id || null }));
      if (base44.entities.Transaction.bulkCreate) await base44.entities.Transaction.bulkCreate(rows);
      else for (const r of rows) await base44.entities.Transaction.create(r);
      setMsg(`Imported ${rows.length} transactions.`);
      setCsv(""); onChange();
    } catch { setMsg("Import failed — try again."); }
    setImporting(false);
  };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result || ""));
    reader.readAsText(f);
  };

  // Group recent transactions by date.
  const recent = transactions.slice(0, limit);
  const groups = [];
  const byDate = {};
  for (const t of recent) { const d = t.date || "—"; if (!byDate[d]) { byDate[d] = []; groups.push(d); } byDate[d].push(t); }
  const dateLabel = (d) => {
    if (d === today()) return "Today";
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <Card title="Transactions" right={
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:border-cyan-400/40">
        <Upload className="h-3 w-3" /> Import CSV
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
      </label>
    }>
      {adding ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none" />
          <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-12.50" type="number" className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
            <option value="" className="bg-[#0e1015]">Auto</option>
            {CATEGORIES.map((c) => <option key={c} className="bg-[#0e1015]">{c}</option>)}
          </select>
          <button onClick={addTx} disabled={!merchant.trim() || !amount} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mb-3 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"><Plus className="h-3 w-3" /> Add transaction</button>
      )}

      <details className="mb-3">
        <summary className="cursor-pointer text-[11px] text-gray-500">…or paste CSV text</summary>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={3} placeholder="Date,Description,Amount&#10;2026-07-01,Netflix,-15.99" className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-white/25" />
        <button onClick={() => importCsv(csv)} disabled={!csv.trim() || importing} className="mt-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-40 hover:bg-blue-500">{importing ? "Importing…" : "Import pasted CSV"}</button>
      </details>
      {msg && <p className="mb-2 text-[11px] text-cyan-300">{msg}</p>}

      <div className="flex flex-col gap-3">
        {groups.map((d) => (
          <div key={d}>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">{dateLabel(d)}</div>
            <div className="flex flex-col gap-0.5">
              {byDate[d].map((t) => {
                const c = t.category || categorize(t.merchant, t.amount);
                const m = catMeta(c);
                return (
                  <div key={t.id} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.03]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${m.c}22` }}>
                      <m.Icon className="h-4 w-4" style={{ color: m.c }} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm">{t.merchant}<span className="block text-[10px] text-gray-500">{c}{t.pending ? " · pending" : ""}</span></span>
                    <span className={`shrink-0 text-sm ${Number(t.amount) < 0 ? "text-gray-200" : "text-emerald-300"}`}>{fmtMoney(t.amount)}</span>
                    {t.source !== "plaid" && <button onClick={() => del(t)} className="p-1 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {transactions.length === 0 && <Empty>No transactions yet — connect a bank, add one, or import a CSV.</Empty>}
      </div>
    </Card>
  );
}
