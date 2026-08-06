// Money — a section (like Donna) rather than a single page. One route, six views
// switched from MoneyNav. The shell owns the shared queries and derived totals so
// every view reads from one cached copy of accounts/transactions/subs/budgets.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Landmark, RefreshCw, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { detectSubscriptions, monthlyCost, normMerchant } from "@/components/money/money";
import { monthKey, spendingWithDelta, totalsForMonth, shiftMonth } from "@/components/money/analytics";
import { connectBank, syncBanks } from "@/components/money/plaidLink";
import MoneyNav, { isView, viewLabel } from "@/components/money/MoneyNav";
import Overview from "@/components/money/Overview";
import BudgetsView from "@/components/money/BudgetsView";
import NetWorthView from "@/components/money/NetWorthView";
import SpendingView from "@/components/money/SpendingView";
import RecurringView from "@/components/money/RecurringView";
import TransactionsView from "@/components/money/TransactionsView";

const VIEW_KEY = "money_view";

// View lives in the URL (?view=budgets) so back/forward and deep links work, and
// is mirrored to localStorage so returning to /Money lands where you left off.
function useMoneyView() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("view");
  const view = isView(fromUrl) ? fromUrl : "overview";

  // The remembered view is a landing default only. It is applied once, on
  // mount, by rewriting the URL — after that the URL is authoritative, so
  // navigating back to the Dashboard isn't immediately undone by the memory.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (fromUrl) return;
    let stored = null;
    try { stored = localStorage.getItem(VIEW_KEY); } catch { /* private mode */ }
    if (isView(stored) && stored !== "overview") {
      const p = new URLSearchParams(params);
      p.set("view", stored);
      setParams(p, { replace: true });
    }
    // `params`/`setParams` are stable enough here; this runs once by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ }
  }, [view]);

  const setView = (next) => {
    const p = new URLSearchParams(params);
    if (next === "overview") p.delete("view"); else p.set("view", next);
    setParams(p, { replace: false });
  };
  return [view, setView];
}

export default function Money() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["money"] }); };
  const [view, setView] = useMoneyView();

  const accountsQ = useQuery({ queryKey: ["money", "accounts"], queryFn: () => base44.entities.Account.list("-created_date", 100) });
  const txQ = useQuery({ queryKey: ["money", "transactions"], queryFn: () => base44.entities.Transaction.list("-date", 1000) });
  const subsQ = useQuery({ queryKey: ["money", "subscriptions"], queryFn: () => base44.entities.Subscription.list("-created_date", 200) });
  const budgetsQ = useQuery({ queryKey: ["money", "budgets"], queryFn: () => base44.entities.Budget.list("-created_date", 100).catch(() => []) });
  const rulesQ = useQuery({ queryKey: ["money", "rules"], queryFn: () => base44.entities.CategoryRule.list("-created_date", 200).catch(() => []) });

  // Surface read failures (the usual cause is Firestore rules not published for
  // the money collections — server writes succeed via Admin, client reads deny).
  const loadError = accountsQ.error || txQ.error || subsQ.error;
  const permDenied = loadError && /permission|insufficient|PERMISSION_DENIED/i.test(String(loadError?.message || loadError));

  const accounts = useMemo(() => (Array.isArray(accountsQ.data) ? accountsQ.data : []), [accountsQ.data]);
  const transactions = useMemo(() => (Array.isArray(txQ.data) ? txQ.data : []), [txQ.data]);
  const budgets = useMemo(() => (Array.isArray(budgetsQ.data) ? budgetsQ.data : []), [budgetsQ.data]);
  const rules = useMemo(() => (Array.isArray(rulesQ.data) ? rulesQ.data : []), [rulesQ.data]);
  const manualSubs = useMemo(
    () => (Array.isArray(subsQ.data) ? subsQ.data : []).filter((s) => s.active !== false),
    [subsQ.data],
  );

  const detected = useMemo(() => detectSubscriptions(transactions), [transactions]);
  const subs = useMemo(() => {
    const seen = new Set(manualSubs.map((s) => normMerchant(s.merchant)));
    const merged = manualSubs.map((s) => ({ ...s, source: "manual" }));
    for (const d of detected) if (!seen.has(normMerchant(d.merchant))) merged.push({ ...d, source: "auto" });
    return merged.sort((a, b) => monthlyCost(b) - monthlyCost(a));
  }, [manualSubs, detected]);

  const data = useMemo(() => {
    const key = monthKey();
    const netWorth = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const { spend: monthSpend, income: monthIncome } = totalsForMonth(transactions, key);
    const lastSpend = totalsForMonth(transactions, shiftMonth(key, -1)).spend;
    // Ignored/excluded rows are already filtered out by the analytics helpers.
    const byCat = spendingWithDelta(transactions, key)
      .map((c) => ({ category: c.category, total: c.amount, pct: c.pct, delta: c.delta }));
    return {
      accounts, transactions, budgets, subs, rules,
      netWorth, monthSpend, monthIncome, byCat,
      subsMonthly: subs.reduce((s, x) => s + monthlyCost(x), 0),
      spendDelta: lastSpend > 0 ? ((monthSpend - lastSpend) / lastSpend) * 100 : null,
    };
  }, [accounts, transactions, budgets, subs, rules]);

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
    // Full-bleed two-column app frame: fixed left rail, scrolling content — the
    // Money section owns the whole viewport (registered in Layout's isFullHeight).
    <div className="flex h-full w-full overflow-hidden bg-[#f5f6f8] text-[#16191d]">
      <MoneyNav view={view} onChange={setView} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e6e8ec] bg-white px-4 py-3 md:px-8">
          <h1 className="flex items-center gap-2 text-[17px] font-semibold">
            <Wallet className="h-4 w-4 text-[#d81b48] md:hidden" />
            {viewLabel(view)}
          </h1>
          <div className="flex items-center gap-1.5">
            {hasPlaid && (
              <button onClick={doSync} disabled={!!banking} className="inline-flex items-center gap-1 rounded-full border border-[#dcdfe4] px-3 py-1.5 text-xs text-[#454b54] hover:border-[#16191d] disabled:opacity-50">
                {banking === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now
              </button>
            )}
            <button onClick={doConnect} disabled={!!banking} className="inline-flex items-center gap-1.5 rounded-full bg-[#16191d] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2b3038] disabled:opacity-50">
              {banking === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />} Add Account
            </button>
          </div>
        </header>

        {/* Scrolling content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:pb-8">
          <div className="w-full py-4">
            {bankMsg && <p className="mb-3 text-[11px] text-[#d81b48]">{bankMsg}</p>}
            {loadError && (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-800">
                {permDenied
                  ? "Can't read your money data — your Firestore rules don't allow the accounts/transactions/subscriptions collections yet. Publish the updated rules and refresh; any linked data will appear."
                  : `Couldn't load money data: ${String(loadError?.message || loadError)}`}
              </div>
            )}

            {view === "overview" && <Overview data={data} onGoToView={setView} />}
            {view === "recurring" && <RecurringView data={data} onChange={invalidate} />}
            {view === "spending" && <SpendingView data={data} onChange={invalidate} />}
            {view === "budgets" && <BudgetsView data={data} onChange={invalidate} />}
            {view === "networth" && <NetWorthView data={data} onChange={invalidate} />}
            {view === "transactions" && <TransactionsView data={data} onChange={invalidate} />}
          </div>
        </div>
      </div>
    </div>
  );
}
