// Transaction detail — Rocket Money's row modal: date, amount, category, a note,
// and the actions column (tax deductible, ignore, split, add rule), with the raw
// bank descriptor at the bottom.
import React, { useState } from "react";
import { X, Receipt, Ban, Split, Wand2, Trash2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CATEGORIES, fmtMoney } from "@/components/money/money";
import { suggestRuleMatch, transactionsMatching } from "@/components/money/rules";
import { catMeta } from "@/components/money/ui";

const rowCls = "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs hover:bg-white/[0.04]";

export default function TransactionDetail({ tx, category, transactions = [], onClose, onChange }) {
  const [busy, setBusy] = useState("");
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitAmount, setSplitAmount] = useState("");
  const [splitCategory, setSplitCategory] = useState(CATEGORIES[1]);
  const [note, setNote] = useState(tx.note || "");
  const [ruleMsg, setRuleMsg] = useState("");

  if (!tx) return null;
  const m = catMeta(category);
  const amt = Number(tx.amount) || 0;

  const patch = async (data) => {
    setBusy("save");
    await base44.entities.Transaction.update(tx.id, data).catch(() => {});
    setBusy("");
    onChange();
  };

  const saveNote = async () => {
    if ((tx.note || "") === note) return;
    await patch({ note });
  };

  const addRule = async () => {
    setBusy("rule"); setRuleMsg("");
    const rule = { match: suggestRuleMatch(tx.merchant), category, scope: "contains" };
    await base44.entities.CategoryRule.create(rule).catch(() => {});
    const affected = transactionsMatching(rule, transactions).length;
    setRuleMsg(`Rule saved — ${affected} transaction${affected === 1 ? "" : "s"} match “${rule.match}”.`);
    setBusy("");
    onChange();
  };

  // A split keeps the original row as the remainder and files the split-off
  // portion as its own transaction, so category totals stay correct.
  const doSplit = async () => {
    const part = Math.abs(Number(splitAmount) || 0);
    const whole = Math.abs(amt);
    if (!part || part >= whole) return;
    setBusy("split");
    const sign = amt < 0 ? -1 : 1;
    await base44.entities.Transaction.create({
      date: tx.date,
      merchant: `${tx.merchant} (split)`,
      amount: sign * part,
      category: splitCategory,
      account_id: tx.account_id || null,
      split_of: tx.id,
    }).catch(() => {});
    await base44.entities.Transaction.update(tx.id, { amount: sign * (whole - part) }).catch(() => {});
    setBusy(""); setSplitOpen(false); setSplitAmount("");
    onChange(); onClose();
  };

  const del = async () => {
    setBusy("del");
    await base44.entities.Transaction.delete(tx.id).catch(() => {});
    setBusy(""); onChange(); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0e1015] p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400">
            {tx.date}{tx.pending ? " · pending" : ""}
          </span>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-white/5 hover:text-gray-200"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="truncate text-lg font-semibold text-white">{tx.merchant}</div>
            <div className={`mt-0.5 text-2xl font-bold ${amt < 0 ? "text-gray-100" : "text-emerald-300"}`}>{fmtMoney(amt)}</div>

            <label className="mt-3 block text-[10px] uppercase tracking-wide text-gray-500">Category</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${m.c}22` }}>
                <m.Icon className="h-4 w-4" style={{ color: m.c }} />
              </span>
              <select
                value={category}
                onChange={(e) => patch({ category: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-cyan-400/40"
              >
                {CATEGORIES.map((c) => <option key={c} value={c} className="bg-[#0e1015]">{c}</option>)}
              </select>
            </div>

            <label className="mt-3 block text-[10px] uppercase tracking-wide text-gray-500">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              rows={3}
              placeholder="Add a note…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-cyan-400/40"
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">Actions</div>

            <button onClick={() => patch({ tax_deductible: !tx.tax_deductible })} className={rowCls}>
              <Receipt className="h-4 w-4 text-gray-500" />
              <span className="flex-1 text-gray-300">Tax deductible</span>
              <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${tx.tax_deductible ? "bg-emerald-500/70" : "bg-white/10"}`}>
                <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${tx.tax_deductible ? "translate-x-3" : ""}`} />
              </span>
            </button>

            <button onClick={() => patch({ ignored: !tx.ignored })} className={rowCls}>
              <Ban className="h-4 w-4 text-gray-500" />
              <span className="flex-1">
                <span className="block text-gray-300">Ignore</span>
                <span className="block text-[10px] text-gray-500">{tx.ignored ? "Excluded from spending" : "Counted in spending"}</span>
              </span>
              <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${tx.ignored ? "bg-orange-500/70" : "bg-white/10"}`}>
                <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${tx.ignored ? "translate-x-3" : ""}`} />
              </span>
            </button>

            <button onClick={() => setSplitOpen((v) => !v)} className={rowCls}>
              <Split className="h-4 w-4 text-gray-500" />
              <span className="flex-1 text-gray-300">Split</span>
            </button>
            {splitOpen && (
              <div className="mb-1 flex flex-wrap items-center gap-1.5 px-2">
                <input
                  value={splitAmount} onChange={(e) => setSplitAmount(e.target.value)} type="number" placeholder="Amount"
                  className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-xs outline-none focus:border-cyan-400/40"
                />
                <select value={splitCategory} onChange={(e) => setSplitCategory(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-gray-300 outline-none">
                  {CATEGORIES.map((c) => <option key={c} className="bg-[#0e1015]">{c}</option>)}
                </select>
                <button
                  onClick={doSplit}
                  disabled={!splitAmount || busy === "split"}
                  className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] text-gray-200 disabled:opacity-40 hover:bg-white/15"
                >
                  {busy === "split" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Split"}
                </button>
              </div>
            )}

            <button onClick={addRule} disabled={busy === "rule"} className={rowCls}>
              <Wand2 className="h-4 w-4 text-gray-500" />
              <span className="flex-1">
                <span className="block text-gray-300">Always categorise as {category}</span>
                <span className="block text-[10px] text-gray-500">Creates a rule for “{suggestRuleMatch(tx.merchant)}”</span>
              </span>
              {busy === "rule" && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
            </button>
            {ruleMsg && <p className="px-2 text-[10px] text-cyan-300">{ruleMsg}</p>}

            {tx.source !== "plaid" && (
              <button onClick={del} disabled={busy === "del"} className={`${rowCls} text-rose-300`}>
                <Trash2 className="h-4 w-4" />
                <span className="flex-1">Delete transaction</span>
              </button>
            )}
          </div>
        </div>

        {(tx.raw_name || tx.merchant) && (
          <div className="mt-4 border-t border-white/[0.06] pt-2 text-center text-[10px] uppercase tracking-wide text-gray-600">
            {tx.raw_name || tx.merchant}
          </div>
        )}
      </div>
    </div>
  );
}
