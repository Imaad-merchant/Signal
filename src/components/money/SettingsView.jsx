// Settings — Rocket Money's gear screen, scoped to what the Money section
// actually owns: linked accounts, display preferences, and a transaction
// export.
//
// Scoped deliberately: Rocket Money's gear also carries display preferences,
// but Signal has nothing behind them yet (no week-bucket helper, and amounts
// are formatted to strings everywhere), so rather than ship toggles that do
// nothing this view sticks to what it can actually change.
import React, { useMemo, useState } from "react";
import { Download, Landmark, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { fmtMoney, toCsv } from "@/components/money/money";
import { lastSyncedLabel } from "@/components/money/analytics";
import { Card, Empty } from "@/components/money/ui";

export default function SettingsView({ data, onChange = () => {} }) {
  const { accounts = [], transactions = [] } = data;
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState("");

  const synced = lastSyncedLabel(accounts);

  // Export the ledger the user can see. The object URL is revoked on the next
  // tick so the download has started but the blob isn't held for the session.
  const exportCsv = () => {
    const csv = toCsv(transactions, accounts);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `signal-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // Removing an account only removes it from Signal. It does not touch the
  // bank: api/plaid/_client.js writes accounts with a deterministic doc id
  // (`<uid>_plaid_<account_id>`), so the next sync of a still-linked item
  // recreates the row.
  const removeAccount = async (id) => {
    setBusy(id);
    await base44.entities.Account.delete(id).catch(() => {});
    setBusy(""); setConfirming("");
    onChange();
  };

  const range = useMemo(() => {
    if (transactions.length === 0) return null;
    const dates = transactions.map((t) => t.date).filter(Boolean).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [transactions]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col">
        <Card
          title="Linked accounts"
          right={synced && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#8b929c]">
              <RefreshCw className="h-3 w-3" /> synced {synced}
            </span>
          )}
        >
          {accounts.length === 0 ? (
            <Empty>No accounts yet — use Add Account in the top bar to link a bank.</Empty>
          ) : (
            <div className="flex flex-col divide-y divide-[#eef0f3]">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 py-2">
                  <Landmark className="h-4 w-4 shrink-0 text-[#8b929c]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-[#454b54]">{a.name}</span>
                    <span className="block truncate text-[10px] text-[#8b929c]">
                      {a.type || "account"}{a.source === "plaid" ? " · linked" : " · manual"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-[#16191d]">{fmtMoney(a.balance)}</span>
                  {confirming === a.id ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => removeAccount(a.id)}
                        disabled={!!busy}
                        className="rounded-lg bg-[#c01530] px-2 py-1 text-[10px] font-medium text-white hover:bg-[#a01126] disabled:opacity-50"
                      >
                        {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Remove"}
                      </button>
                      <button
                        onClick={() => setConfirming("")}
                        className="rounded-lg border border-[#dcdfe4] px-2 py-1 text-[10px] text-[#454b54] hover:border-[#16191d]"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirming(a.id)}
                      disabled={!!busy}
                      aria-label={`Remove ${a.name} from Signal`}
                      className="shrink-0 rounded-lg p-1 text-[#8b929c] hover:bg-[#f7f8fa] hover:text-[#c01530] disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-[#8b929c]">
            Removing an account here only removes it from Signal — it doesn&apos;t close or
            unlink anything at your bank, and a later sync can bring it back.
          </p>
        </Card>

      </div>

      <aside className="flex min-w-0 flex-col lg:sticky lg:top-4">
        <Card title="Export">
          <p className="mb-2 text-[11px] text-[#6b727e]">
            {transactions.length === 0
              ? "Nothing to export yet."
              : `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}${range ? ` from ${range.from} to ${range.to}` : ""}.`}
          </p>
          <button
            onClick={exportCsv}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#16191d] px-4 py-1.5 text-[11px] font-medium text-white hover:bg-[#2b3038] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Download CSV
          </button>
          <p className="mt-2 text-[10px] text-[#8b929c]">
            Date, merchant, category, amount, account, note — the columns most tax and
            spreadsheet tools expect.
          </p>
        </Card>
      </aside>
    </div>
  );
}
