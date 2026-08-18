import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Wallet, Plus, Trash2, Upload, Repeat, TrendingUp, TrendingDown, X, Landmark, RefreshCw, Loader2,
  ShoppingBag, Utensils, Car, Home, Film, HeartPulse, Plane, DollarSign, Package, ArrowLeft,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import {
  CATEGORIES, categorize, fmtMoney, detectSubscriptions, monthlyCost, yearlyCost, normMerchant,
  spendingByCategory, parseTransactionsCsv, initials, avatarColor, nextDue, relDue,
} from "@/components/money/money";
import { connectBank, syncBanks } from "@/components/money/plaidLink";

const monthPrefix = (d = new Date()) => d.toISOString().slice(0, 7);
const lastMonthPrefix = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return monthPrefix(d); };
const today = () => new Date().toISOString().slice(0, 10);
const monthName = () => new Date().toLocaleString(undefined, { month: "long" });

const CAT_META = {
  Income: { c: "#10b981", Icon: DollarSign },
  Groceries: { c: "#22c55e", Icon: ShoppingBag },
  Food: { c: "#f97316", Icon: Utensils },
  Transport: { c: "#38bdf8", Icon: Car },
  Shopping: { c: "#a78bfa", Icon: ShoppingBag },
  "Bills & Utilities": { c: "#f43f5e", Icon: Home },
  Subscriptions: { c: "#8b5cf6", Icon: Repeat },
  Entertainment: { c: "#ec4899", Icon: Film },
  Health: { c: "#14b8a6", Icon: HeartPulse },
  Travel: { c: "#eab308", Icon: Plane },
  Other: { c: "#94a3b8", Icon: Package },
};
const catMeta = (c) => CAT_META[c] || CAT_META.Other;

function Avatar({ name, color }) {
  const bg = color || avatarColor(name);
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: bg }}>
      {initials(name)}
    </div>
  );
}

export default function Money() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["money"] }); };

  const accountsQ = useQuery({ queryKey: ["money", "accounts"], queryFn: () => base44.entities.Account.list("-created_date", 100) });
  const txQ = useQuery({ queryKey: ["money", "transactions"], queryFn: () => base44.entities.Transaction.list("-date", 1000) });
  const subsQ = useQuery({ queryKey: ["money", "subscriptions"], queryFn: () => base44.entities.Subscription.list("-created_date", 200) });
  const budgetsQ = useQuery({ queryKey: ["money", "budgets"], queryFn: () => base44.entities.Budget.list("-created_date", 100).catch(() => []) });

  // Surface read failures (the usual cause is Firestore rules not published for
  // the money collections — server writes succeed via Admin, client reads deny).
  const loadError = accountsQ.error || txQ.error || subsQ.error;
  const permDenied = loadError && /permission|insufficient|PERMISSION_DENIED/i.test(String(loadError?.message || loadError));
  const initialLoading = (accountsQ.isLoading || txQ.isLoading) && !loadError;

  const accounts = Array.isArray(accountsQ.data) ? accountsQ.data : [];
  const transactions = Array.isArray(txQ.data) ? txQ.data : [];
  const manualSubs = (Array.isArray(subsQ.data) ? subsQ.data : []).filter((s) => s.active !== false);

  const netWorth = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const mPrefix = monthPrefix();
  const monthTx = transactions.filter((t) => (t.date || "").startsWith(mPrefix));
  const monthSpend = monthTx.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const monthIncome = monthTx.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const lastSpend = transactions.filter((t) => (t.date || "").startsWith(lastMonthPrefix()) && Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const spendDelta = lastSpend > 0 ? ((monthSpend - lastSpend) / lastSpend) * 100 : null;
  const byCat = spendingByCategory(transactions, mPrefix);

  const detected = useMemo(() => detectSubscriptions(transactions), [transactions]);
  const subs = useMemo(() => {
    const seen = new Set(manualSubs.map((s) => normMerchant(s.merchant)));
    const merged = manualSubs.map((s) => ({ ...s, source: "manual" }));
    for (const d of detected) if (!seen.has(normMerchant(d.merchant))) merged.push({ ...d, source: "auto" });
    return merged.sort((a, b) => monthlyCost(b) - monthlyCost(a));
  }, [manualSubs, detected]);
  const subsMonthly = subs.reduce((s, x) => s + monthlyCost(x), 0);

  const [banking, setBanking] = useState("");
  const [bankMsg, setBankMsg] = useState("");
  const doConnect = async () => {
    setBanking("connect"); setBankMsg("");
    try {
      const r = await connectBank();
      if (r && r.ok) { setBankMsg(`Linked — ${r.accounts || 0} accounts, ${r.added || 0} transactions.`); invalidate(); }
    } catch (err) { setBankMsg(err?.message || "Couldn't connect — is Plaid set up on the server?"); }
    setBanking("");
  };
  const doSync = async () => {
    setBanking("sync"); setBankMsg("");
    try { const r = await syncBanks(); if (r && r.error) setBankMsg(r.error); else { setBankMsg(`Synced ${r.added || 0} new, ${r.removed || 0} removed.`); invalidate(); } }
    catch (err) { setBankMsg(err?.message || "Sync failed."); }
    setBanking("");
  };
  const hasPlaid = accounts.some((a) => a.source === "plaid");

  return (
    <div className="h-full overflow-y-auto bg-[#0b0d11] pb-[calc(5rem+env(safe-area-inset-bottom))] text-gray-100">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-1 rounded-full p-1 text-gray-400 hover:bg-white/5 hover:text-gray-100"><ArrowLeft className="h-5 w-5" /></button>
            <Wallet className="h-5 w-5 text-cyan-300" /> Money
          </h1>
          <div className="flex items-center gap-1.5">
            {hasPlaid && (
              <button onClick={doSync} disabled={!!banking} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 hover:border-cyan-400/40 disabled:opacity-50">
                {banking === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync
              </button>
            )}
            <button onClick={doConnect} disabled={!!banking} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              {banking === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />} Connect bank
            </button>
          </div>
        </div>
        {bankMsg && <p className="mb-3 text-[11px] text-cyan-300">{bankMsg}</p>}
        {loadError && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
            {permDenied
              ? "Can't read your money data — your Firestore rules don't allow the accounts/transactions/subscriptions collections yet. Publish the updated rules and refresh; any linked data will appear."
              : `Couldn't load money data: ${String(loadError?.message || loadError)}`}
          </div>
        )}

        {/* Net worth hero (skeleton while the first read is in flight, so a real
            $0.00 never looks the same as "still loading"). */}
        {initialLoading ? (
          <div className="animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="h-3 w-20 rounded bg-white/10" />
            <div className="mt-2 h-8 w-40 rounded bg-white/10" />
            <div className="mt-4 flex gap-5"><div className="h-8 w-16 rounded bg-white/10" /><div className="h-8 w-16 rounded bg-white/10" /><div className="h-8 w-20 rounded bg-white/10" /></div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-violet-500/15 p-5">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">Net worth</div>
            <div className="mt-1 text-3xl font-bold text-white">{fmtMoney(netWorth)}</div>
            <div className="mt-3 flex gap-5 text-xs">
              <div><span className="text-gray-400">Spent in {monthName()}</span><div className="text-sm font-semibold text-rose-300">{fmtMoney(monthSpend)}</div></div>
              <div><span className="text-gray-400">Income</span><div className="text-sm font-semibold text-emerald-300">{fmtMoney(monthIncome)}</div></div>
              <div><span className="text-gray-400">Subscriptions</span><div className="text-sm font-semibold text-violet-300">{fmtMoney(subsMonthly)}/mo</div></div>
            </div>
          </div>
        )}

        <Accounts accounts={accounts} netWorth={netWorth} onChange={invalidate} />
        <Spending byCat={byCat} total={monthSpend} delta={spendDelta} />
        <Budgets budgets={Array.isArray(budgetsQ.data) ? budgetsQ.data : []} byCat={byCat} onChange={invalidate} />
        <Subscriptions subs={subs} monthly={subsMonthly} onChange={invalidate} />
        <Transactions transactions={transactions} accounts={accounts} onChange={invalidate} />
      </div>
    </div>
  );
}

function Card({ title, children, right }) {
  return (
    <section className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function AccountRow({ a, onChange }) {
  const update = async (bal) => { await base44.entities.Account.update(a.id, { balance: Number(bal) || 0 }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." })); onChange(); };
  const del = async () => { await base44.entities.Account.delete(a.id).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." })); onChange(); };
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

function Accounts({ accounts, netWorth, onChange }) {
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
    await base44.entities.Account.create({ name: name.trim(), type, balance: Number(balance) || 0 }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." }));
    setName(""); setBalance(""); setOpen(false); onChange();
  };

  return (
    <Card title="Net worth" right={<span className="text-[11px] font-semibold text-gray-300">{fmtMoney(netWorth)}</span>}>
      <div className="flex flex-col gap-3">
        {accounts.length === 0 && <p className="text-[11px] text-gray-500">Connect a bank or add accounts to see your net worth.</p>}

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

function Spending({ byCat, total, delta }) {
  const data = byCat.map((c) => ({ name: c.category, value: c.total, color: catMeta(c.category).c }));
  const up = delta != null && delta > 0;
  return (
    <Card title="Spending this month" right={delta != null && (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-rose-300" : "text-emerald-300"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(delta).toFixed(0)}% vs last mo
      </span>
    )}>
      {byCat.length === 0 ? (
        <p className="text-[11px] text-gray-500">No spending yet this month — add or import transactions below.</p>
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

function Budgets({ budgets, byCat, onChange }) {
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
    await base44.entities.Budget.create({ category: cat, amount: Number(amount) || 0 }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." }));
    setAmount(""); setOpen(false); onChange();
  };
  const update = async (b, amt) => { await base44.entities.Budget.update(b.id, { amount: Number(amt) || 0 }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." })); onChange(); };
  const del = async (b) => { await base44.entities.Budget.delete(b.id).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." })); onChange(); };

  return (
    <Card title="Budgets" right={budgets.length > 0 && <span className="text-[11px] font-semibold text-gray-300">{fmtMoney(totalSpent)} / {fmtMoney(totalBudget)}</span>}>
      <div className="flex flex-col gap-2.5">
        {budgets.length === 0 && !open && <p className="text-[11px] text-gray-500">Set a monthly limit per category to track how you're pacing.</p>}
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

function Subscriptions({ subs, monthly, onChange }) {
  const [open, setOpen] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const add = async () => {
    if (!merchant.trim() || !amount) return;
    await base44.entities.Subscription.create({ merchant: merchant.trim(), amount: Number(amount) || 0, cadence, active: true }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." }));
    setMerchant(""); setAmount(""); setOpen(false); onChange();
  };
  const track = async (d) => { await base44.entities.Subscription.create({ merchant: d.merchant, amount: d.amount, cadence: d.cadence, active: true }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." })); onChange(); };
  const cancel = async (s) => { if (s.id) { await base44.entities.Subscription.update(s.id, { active: false }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." })); onChange(); } };
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
        {subs.length === 0 && <p className="text-[11px] text-gray-500">None yet. Import or link transactions and recurring charges show up automatically, or add one.</p>}
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

function Transactions({ transactions, accounts, onChange }) {
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
    }).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." }));
    setMerchant(""); setAmount(""); setCat(""); setAdding(false); onChange();
  };
  const del = async (t) => { await base44.entities.Transaction.delete(t.id).catch(() => toast({ variant: "destructive", title: "Couldn't save — try again." })); onChange(); };

  const importCsv = async (text) => {
    const parsed = parseTransactionsCsv(text);
    if (!parsed.length) { setMsg("Couldn't read any rows — expected Date, Description, Amount columns."); return; }
    setImporting(true); setMsg("");
    try {
      const rows = parsed.slice(0, 2000).map((p) => ({ ...p, account_id: accounts[0]?.id || null }));
      if (base44.entities.Transaction.bulkCreate) await base44.entities.Transaction.bulkCreate(rows);
      else for (const r of rows) await base44.entities.Transaction.create(r);
      setMsg(`Imported ${rows.length} transactions.`); toast({ title: `Imported ${rows.length} transactions` });
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
  const recent = transactions.slice(0, 60);
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
        {transactions.length === 0 && <p className="text-[11px] text-gray-500">No transactions yet — connect a bank, add one, or import a CSV.</p>}
      </div>
    </Card>
  );
}
