// Transactions — the full ledger: filter bar, search, sort, bulk edit and the
// row detail modal. Rocket Money's Transactions screen, Signal-styled.
import React, { useMemo, useRef, useState } from "react";
import { Plus, Upload, Trash2, Ban, Loader2, CheckSquare, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CATEGORIES, categorize, fmtMoney, parseTransactionsCsv } from "@/components/money/money";
import { resolveCategory } from "@/components/money/rules";
import Filters, { applyFilters, emptyFilters } from "@/components/money/Filters";
import TransactionDetail from "@/components/money/TransactionDetail";
import { Card, catMeta, Empty } from "@/components/money/ui";

const today = () => new Date().toISOString().slice(0, 10);
const PAGE = 100;

export default function TransactionsView({ data, onChange = () => {} }) {
  const { transactions, accounts, rules } = data;
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState(() => new Set());
  const [openTx, setOpenTx] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const categoryOf = useMemo(() => (t) => resolveCategory(t, rules), [rules]);
  const rows = useMemo(() => applyFilters(transactions, filters, categoryOf), [transactions, filters, categoryOf]);
  const visible = rows.slice(0, shown);

  const total = rows.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(visible.map((t) => t.id)));
  };

  const bulk = async (patch) => {
    setBusy("bulk");
    for (const id of selected) await base44.entities.Transaction.update(id, patch).catch(() => {});
    setBusy(""); setSelected(new Set()); onChange();
  };
  const bulkDelete = async () => {
    setBusy("bulk");
    for (const id of selected) {
      const t = transactions.find((x) => x.id === id);
      if (t?.source === "plaid") continue; // linked rows come back on the next sync
      await base44.entities.Transaction.delete(id).catch(() => {});
    }
    setBusy(""); setSelected(new Set()); onChange();
  };

  return (
    <>
      <Card
        title="Transactions"
        right={<span className="text-[11px] text-[#8b929c]">{rows.length} · net {fmtMoney(total)}</span>}
      >
        <Filters filters={filters} onChange={(f) => { setFilters(f); setShown(PAGE); }} accounts={accounts} />

        <div className="mt-3 flex items-center justify-between gap-2">
          <button onClick={toggleAll} className="inline-flex items-center gap-1.5 text-[11px] text-[#6b727e] hover:text-[#16191d]">
            {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {allSelected ? "Clear" : "Select all"}
          </button>
          <AddAndImport accounts={accounts} onChange={onChange} setMsg={setMsg} />
        </div>
        {msg && <p className="mt-1 text-[11px] text-[#d81b48]">{msg}</p>}

        {selected.size > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#d81b48]/25 bg-[#d81b48]/5 p-2">
            <span className="text-[11px] text-[#a81438]">{selected.size} selected</span>
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) { bulk({ category: e.target.value }); e.target.value = ""; } }}
              className="rounded-lg border border-[#dcdfe4] bg-white px-2 py-1 text-[11px] text-[#454b54] outline-none"
            >
              <option value="" className="bg-white">Set category…</option>
              {CATEGORIES.map((c) => <option key={c} value={c} className="bg-white">{c}</option>)}
            </select>
            <button onClick={() => bulk({ ignored: true })} className="inline-flex items-center gap-1 rounded-lg border border-[#dcdfe4] px-2 py-1 text-[11px] text-[#454b54] hover:border-[#b54708]/45">
              <Ban className="h-3 w-3" /> Ignore
            </button>
            <button onClick={bulkDelete} className="inline-flex items-center gap-1 rounded-lg border border-[#dcdfe4] px-2 py-1 text-[11px] text-[#c01530] hover:border-[#c01530]/45">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
            {busy === "bulk" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6b727e]" />}
          </div>
        )}

        <div className="mt-2 flex flex-col">
          {visible.map((t) => {
            const c = categoryOf(t);
            const m = catMeta(c);
            const isSel = selected.has(t.id);
            return (
              <div key={t.id} className={`group flex items-center gap-2 rounded-lg px-1 py-1.5 ${isSel ? "bg-[#d81b48]/5" : "hover:bg-[#f7f8fa]"}`}>
                <button onClick={() => toggle(t.id)} className="p-1 text-[#a8aeb8] hover:text-[#454b54]">
                  {isSel ? <CheckSquare className="h-3.5 w-3.5 text-[#d81b48]" /> : <Square className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setOpenTx(t)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className="w-9 shrink-0 text-[10px] text-[#8b929c]">{String(t.date || "").slice(5)}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${m.c}22` }}>
                    <m.Icon className="h-4 w-4" style={{ color: m.c }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className={t.ignored ? "text-[#8b929c] line-through" : ""}>{t.merchant}</span>
                    <span className="block truncate text-[10px] text-[#8b929c]">
                      {c}{t.pending ? " · pending" : ""}{t.tax_deductible ? " · tax" : ""}{t.note ? ` · ${t.note}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm ${Number(t.amount) < 0 ? "text-[#16191d]" : "text-[#0f7b53]"}`}>{fmtMoney(t.amount)}</span>
                </button>
              </div>
            );
          })}
          {rows.length === 0 && <Empty>No transactions match these filters.</Empty>}
        </div>

        {rows.length > shown && (
          <button onClick={() => setShown((n) => n + PAGE)} className="mt-3 w-full rounded-lg border border-[#dcdfe4] py-2 text-[11px] text-[#454b54] hover:border-[#d81b48]/45">
            Show {Math.min(PAGE, rows.length - shown)} more
          </button>
        )}
      </Card>

      {openTx && (
        <TransactionDetail
          tx={openTx}
          category={categoryOf(openTx)}
          transactions={transactions}
          onClose={() => setOpenTx(null)}
          onChange={onChange}
        />
      )}
    </>
  );
}

// Add-a-transaction and CSV import, kept out of the main body so the ledger stays readable.
function AddAndImport({ accounts, onChange, setMsg }) {
  const [adding, setAdding] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState("");
  const [date, setDate] = useState(today());
  const fileRef = useRef(null);

  const addTx = async () => {
    if (!merchant.trim() || !amount) return;
    const amt = Number(amount);
    await base44.entities.Transaction.create({
      date, merchant: merchant.trim(), amount: amt, category: cat || categorize(merchant, amt), account_id: accounts[0]?.id || null,
    }).catch(() => {});
    setMerchant(""); setAmount(""); setCat(""); setAdding(false); onChange();
  };

  const importCsv = async (text) => {
    const parsed = parseTransactionsCsv(text);
    if (!parsed.length) { setMsg("Couldn't read any rows — expected Date, Description, Amount columns."); return; }
    try {
      const rows = parsed.slice(0, 2000).map((p) => ({ ...p, account_id: accounts[0]?.id || null }));
      if (base44.entities.Transaction.bulkCreate) await base44.entities.Transaction.bulkCreate(rows);
      else for (const r of rows) await base44.entities.Transaction.create(r);
      setMsg(`Imported ${rows.length} transactions.`);
      onChange();
    } catch { setMsg("Import failed — try again."); }
  };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result || ""));
    reader.readAsText(f);
  };

  if (adding) {
    return (
      <div className="flex w-full flex-wrap items-center gap-1.5">
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="rounded-lg border border-[#dcdfe4] bg-white px-2 py-1.5 text-[11px] text-[#454b54] outline-none" />
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant" className="min-w-0 flex-1 rounded-lg border border-[#dcdfe4] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#16191d]" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-12.50" type="number" className="w-24 rounded-lg border border-[#dcdfe4] bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-[#16191d]" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-[#dcdfe4] bg-white px-2 py-1.5 text-[11px] text-[#454b54] outline-none">
          <option value="" className="bg-white">Auto</option>
          {CATEGORIES.map((c) => <option key={c} className="bg-white">{c}</option>)}
        </select>
        <button onClick={addTx} disabled={!merchant.trim() || !amount} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#16191d] text-white disabled:opacity-40 hover:bg-[#2b3038]"><Plus className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] text-[#d81b48] hover:text-[#a81438]"><Plus className="h-3 w-3" /> Add</button>
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#dcdfe4] px-2 py-1 text-[11px] text-[#454b54] hover:border-[#d81b48]/45">
        <Upload className="h-3 w-3" /> Import CSV
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
      </label>
    </div>
  );
}
