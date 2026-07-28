import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Plus, Trash2, Upload, Repeat, PiggyBank, TrendingUp, X, CreditCard } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  CATEGORIES, categorize, fmtMoney, detectSubscriptions, monthlyCost, normMerchant,
  spendingByCategory, parseTransactionsCsv,
} from "@/components/money/money";

const monthPrefix = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

const CAT_COLORS = ["#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#34d399", "#facc15", "#f87171", "#94a3b8"];

export default function Money() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["money"] }); };

  const accountsQ = useQuery({ queryKey: ["money", "accounts"], queryFn: () => base44.entities.Account.list("-created_date", 100).catch(() => []) });
  const txQ = useQuery({ queryKey: ["money", "transactions"], queryFn: () => base44.entities.Transaction.list("-date", 1000).catch(() => []) });
  const subsQ = useQuery({ queryKey: ["money", "subscriptions"], queryFn: () => base44.entities.Subscription.list("-created_date", 200).catch(() => []) });

  const accounts = Array.isArray(accountsQ.data) ? accountsQ.data : [];
  const transactions = Array.isArray(txQ.data) ? txQ.data : [];
  const manualSubs = (Array.isArray(subsQ.data) ? subsQ.data : []).filter((s) => s.active !== false);

  const netWorth = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const mPrefix = monthPrefix();
  const monthTx = transactions.filter((t) => (t.date || "").startsWith(mPrefix));
  const monthSpend = monthTx.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const monthIncome = monthTx.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const byCat = spendingByCategory(transactions, mPrefix);
  const maxCat = byCat.length ? byCat[0].total : 1;

  // Subscriptions = manual + auto-detected (deduped by normalized merchant).
  const detected = useMemo(() => detectSubscriptions(transactions), [transactions]);
  const subs = useMemo(() => {
    const seen = new Set(manualSubs.map((s) => normMerchant(s.merchant)));
    const merged = manualSubs.map((s) => ({ ...s, source: "manual" }));
    for (const d of detected) if (!seen.has(normMerchant(d.merchant))) merged.push({ ...d, source: "auto" });
    return merged.sort((a, b) => monthlyCost(b) - monthlyCost(a));
  }, [manualSubs, detected]);
  const subsMonthly = subs.reduce((s, x) => s + monthlyCost(x), 0);

  return (
    <div className="h-full overflow-y-auto bg-[#0b0d11] pb-[calc(5rem+env(safe-area-inset-bottom))] text-gray-100">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Wallet className="h-5 w-5 text-cyan-300" /> Money</h1>

        {/* Top cards */}
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={PiggyBank} label="Net worth" value={fmtMoney(netWorth)} tone="text-emerald-300" />
          <Stat icon={TrendingUp} label="Spent this month" value={fmtMoney(monthSpend)} tone="text-rose-300" />
          <Stat icon={Repeat} label="Subscriptions / mo" value={fmtMoney(subsMonthly)} tone="text-violet-300" />
        </div>

        <Accounts accounts={accounts} onChange={invalidate} />
        <Spending byCat={byCat} maxCat={maxCat} income={monthIncome} />
        <Subscriptions subs={subs} onChange={invalidate} />
        <Transactions transactions={transactions} accounts={accounts} onChange={invalidate} />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-500"><Icon className="h-3 w-3" /> {label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Card({ title, icon: Icon, children, right }) {
  return (
    <section className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200"><Icon className="h-4 w-4 text-gray-400" /> {title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Accounts({ accounts, onChange }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Checking");
  const [balance, setBalance] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    await base44.entities.Account.create({ name: name.trim(), type, balance: Number(balance) || 0 }).catch(() => {});
    setName(""); setBalance(""); onChange();
  };
  const update = async (a, bal) => { await base44.entities.Account.update(a.id, { balance: Number(bal) || 0 }).catch(() => {}); onChange(); };
  const del = async (a) => { await base44.entities.Account.delete(a.id).catch(() => {}); onChange(); };
  return (
    <Card title="Accounts" icon={CreditCard}>
      <div className="flex flex-col gap-2">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{a.name} <span className="text-[11px] text-gray-500">· {a.type}</span></span>
            <input defaultValue={a.balance} onBlur={(e) => update(a, e.target.value)} type="number"
              className="w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-right text-sm outline-none focus:border-white/25" />
            <button onClick={() => del(a)} className="p-1 text-gray-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {accounts.length === 0 && <p className="text-[11px] text-gray-500">Add your accounts to see net worth.</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
            {["Checking", "Savings", "Credit Card", "Investment", "Cash"].map((x) => <option key={x} className="bg-[#0e1015]">{x}</option>)}
          </select>
          <input value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" type="number" className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
          <button onClick={add} disabled={!name.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function Spending({ byCat, maxCat, income }) {
  return (
    <Card title="Spending this month" icon={TrendingUp} right={income > 0 ? <span className="text-[11px] text-emerald-300">+{fmtMoney(income)} income</span> : null}>
      {byCat.length === 0 && <p className="text-[11px] text-gray-500">No spending yet this month — add or import transactions below.</p>}
      <div className="flex flex-col gap-2">
        {byCat.map((c, i) => (
          <div key={c.category}>
            <div className="mb-0.5 flex items-center justify-between text-xs"><span className="text-gray-300">{c.category}</span><span className="text-gray-400">{fmtMoney(c.total)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.total / maxCat) * 100)}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Subscriptions({ subs, onChange }) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const add = async () => {
    if (!merchant.trim() || !amount) return;
    await base44.entities.Subscription.create({ merchant: merchant.trim(), amount: Number(amount) || 0, cadence, active: true }).catch(() => {});
    setMerchant(""); setAmount(""); onChange();
  };
  const track = async (d) => { await base44.entities.Subscription.create({ merchant: d.merchant, amount: d.amount, cadence: d.cadence, active: true }).catch(() => {}); onChange(); };
  const cancel = async (s) => { if (s.id) { await base44.entities.Subscription.update(s.id, { active: false }).catch(() => {}); onChange(); } };
  return (
    <Card title="Subscriptions" icon={Repeat} right={<span className="text-[11px] text-violet-300">{fmtMoney(subs.reduce((s, x) => s + monthlyCost(x), 0))}/mo</span>}>
      <div className="flex flex-col gap-2">
        {subs.map((s, i) => (
          <div key={s.id || `auto-${i}`} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm capitalize">{s.merchant}
              {s.source === "auto" && <span className="ml-1.5 rounded bg-white/5 px-1 text-[9px] uppercase text-gray-500">auto</span>}
            </span>
            <span className="shrink-0 text-[11px] text-gray-500">{s.cadence}</span>
            <span className="shrink-0 text-sm text-gray-300">{fmtMoney(s.amount)}</span>
            {s.source === "manual"
              ? <button onClick={() => cancel(s)} title="Cancel/hide" className="p-1 text-gray-500 hover:text-red-300"><X className="h-4 w-4" /></button>
              : <button onClick={() => track(s)} title="Track this" className="p-1 text-gray-500 hover:text-cyan-300"><Plus className="h-4 w-4" /></button>}
          </div>
        ))}
        {subs.length === 0 && <p className="text-[11px] text-gray-500">None found. Import transactions and recurring charges show up automatically, or add one below.</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Netflix" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15.99" type="number" className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
          <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
            {["monthly", "yearly", "weekly"].map((x) => <option key={x} className="bg-[#0e1015]">{x}</option>)}
          </select>
          <button onClick={add} disabled={!merchant.trim() || !amount} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
        </div>
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
  const fileRef = useRef(null);

  const addTx = async () => {
    if (!merchant.trim() || !amount) return;
    const amt = Number(amount);
    await base44.entities.Transaction.create({
      date, merchant: merchant.trim(), amount: amt, category: cat || categorize(merchant, amt), account_id: accounts[0]?.id || null,
    }).catch(() => {});
    setMerchant(""); setAmount(""); setCat(""); onChange();
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

  return (
    <Card title="Transactions" icon={Wallet} right={
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:border-cyan-400/40">
        <Upload className="h-3 w-3" /> Import CSV
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
      </label>
    }>
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

      {/* Paste-CSV fallback */}
      <details className="mb-3">
        <summary className="cursor-pointer text-[11px] text-gray-500">…or paste CSV text</summary>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={3} placeholder="Date,Description,Amount&#10;2026-07-01,Netflix,-15.99" className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-white/25" />
        <button onClick={() => importCsv(csv)} disabled={!csv.trim() || importing} className="mt-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-40 hover:bg-blue-500">{importing ? "Importing…" : "Import pasted CSV"}</button>
      </details>
      {msg && <p className="mb-2 text-[11px] text-cyan-300">{msg}</p>}

      <div className="flex flex-col gap-1">
        {transactions.slice(0, 40).map((t) => (
          <div key={t.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
            <span className="w-16 shrink-0 text-[11px] text-gray-500">{(t.date || "").slice(5)}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{t.merchant}</span>
            <span className="shrink-0 text-[10px] text-gray-500">{t.category || categorize(t.merchant, t.amount)}</span>
            <span className={`w-24 shrink-0 text-right text-sm ${Number(t.amount) < 0 ? "text-gray-200" : "text-emerald-300"}`}>{fmtMoney(t.amount)}</span>
            <button onClick={() => del(t)} className="p-1 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {transactions.length === 0 && <p className="text-[11px] text-gray-500">No transactions yet — add one above or import a CSV from your bank.</p>}
      </div>
    </Card>
  );
}
