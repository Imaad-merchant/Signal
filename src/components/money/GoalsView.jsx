// Goals — Rocket Money's Goals screen: a savings summary rail over a list of
// goal cards, each with a progress ring, a target date pace line and the
// contribution history behind a disclosure.
//
// A Goal is { name, target, saved, target_date, kind, contributions[] }.
// Contributions live on the goal doc (append-only {date, amount}) rather than
// in their own collection — the list is short and is only ever read alongside
// the goal it belongs to.
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Target, PiggyBank, ChevronDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { writeFailed } from "@/components/money/writes";
import { fmtMoney, savedFor, paceFor, contributionsOf } from "@/components/money/money";
import { Card, Empty, Ring, StatRow } from "@/components/money/ui";

// Rocket Money splits goals into Smart Savings (it moves the money for you) and
// Custom Savings (you transfer it yourself). Signal has no transfer rail, so
// both are tracked the same way and the label is the only difference.
export const GOAL_KINDS = [
  { key: "custom", label: "Custom Savings", hint: "You transfer the money yourself." },
  { key: "smart", label: "Smart Savings", hint: "A recurring amount you set aside." },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function GoalsView({ data, onChange = () => {} }) {
  const { goals = [] } = data;
  const [adding, setAdding] = useState(false);

  const totals = useMemo(() => {
    const saved = goals.reduce((s, g) => s + savedFor(g), 0);
    const target = goals.reduce((s, g) => s + (Number(g.target) || 0), 0);
    const monthly = goals.reduce((s, g) => s + (paceFor(g)?.perMonth || 0), 0);
    return { saved, target, monthly, pct: target > 0 ? (saved / target) * 100 : 0 };
  }, [goals]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col">
        <div className="mt-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#16191d]">Your goals</h2>
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full bg-[#16191d] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#2b3038]"
          >
            <Plus className="h-3.5 w-3.5" /> New goal
          </button>
        </div>

        {adding && <GoalForm onDone={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />}

        {goals.length === 0 && !adding ? (
          <Card title="No goals yet">
            <Empty>
              Create a goal to set money aside for something specific — an emergency fund,
              a trip, a down payment. Signal tracks the balance and the monthly pace; it
              does not move money between your accounts.
            </Empty>
          </Card>
        ) : (
          goals.map((g) => <GoalCard key={g.id} goal={g} onChange={onChange} />)
        )}
      </div>

      <aside className="flex min-w-0 flex-col lg:sticky lg:top-4">
        <Card title="Savings summary">
          {goals.length === 0 ? <Empty>Nothing tracked yet.</Empty> : (
            <>
              <div className="flex items-center gap-4">
                <Ring pct={totals.pct} size={72} stroke={7} color="#10b981" />
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-bold text-[#16191d]">{fmtMoney(totals.saved)}</div>
                  <div className="mt-0.5 text-[11px] text-[#8b929c]">
                    saved of {fmtMoney(totals.target)} across {goals.length} goal{goals.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-col divide-y divide-[#eef0f3]">
                <StatRow icon={PiggyBank} label="Still to save" value={Math.max(0, totals.target - totals.saved)} />
                <StatRow
                  icon={Target}
                  label="Pace to stay on track"
                  sub="across goals with a target date"
                  value={totals.monthly > 0 ? `${fmtMoney(totals.monthly)}/mo` : "—"}
                />
              </div>
            </>
          )}
        </Card>
      </aside>
    </div>
  );
}

function GoalCard({ goal, onChange }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");

  const saved = savedFor(goal);
  const target = Number(goal.target) || 0;
  const pct = target > 0 ? (saved / target) * 100 : 0;
  const done = target > 0 && saved >= target;
  const pace = paceFor(goal);
  const history = contributionsOf(goal).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // A contribution appends to the history and moves the running total in the
  // same write, so the card stays correct even if the history is later trimmed.
  const contribute = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0) return;
    setBusy("add");
    await base44.entities.Goal.update(goal.id, {
      saved: saved + amt,
      contributions: [...contributionsOf(goal), { date: todayIso(), amount: amt }],
    }).catch(writeFailed);
    setBusy(""); setAmount("");
    onChange();
  };

  const remove = async () => {
    setBusy("del");
    await base44.entities.Goal.delete(goal.id).catch(writeFailed);
    setBusy("");
    onChange();
  };

  return (
    <section className="mt-4 rounded-2xl border border-[#e6e8ec] bg-white p-4">
      <div className="flex items-start gap-4">
        <Ring pct={pct} size={56} stroke={6} color={done ? "#10b981" : "#7b8ff7"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[#16191d]">{goal.name}</h3>
              <p className="mt-0.5 text-[11px] text-[#8b929c]">
                {GOAL_KINDS.find((k) => k.key === goal.kind)?.label || "Custom Savings"}
                {goal.target_date ? ` · by ${new Date(goal.target_date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : ""}
              </p>
            </div>
            <button
              onClick={remove}
              disabled={!!busy}
              aria-label={`Delete goal ${goal.name}`}
              className="shrink-0 rounded-lg p-1.5 text-[#8b929c] hover:bg-[#f7f8fa] hover:text-[#c01530] disabled:opacity-50"
            >
              {busy === "del" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-[#16191d]">{fmtMoney(saved)}</span>
            <span className="text-[11px] text-[#8b929c]">of {fmtMoney(target)}</span>
          </div>

          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f2f4f7]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: done ? "#10b981" : "#7b8ff7" }}
            />
          </div>

          <p className="mt-1.5 text-[11px] text-[#6b727e]">
            {done
              ? "Goal reached."
              : pace
                ? pace.late
                  ? `Target date has passed — ${fmtMoney(pace.remaining)} still to go.`
                  : `${fmtMoney(pace.perMonth)}/mo for ${pace.months} month${pace.months === 1 ? "" : "s"} to finish on time.`
                : `${fmtMoney(Math.max(0, target - saved))} to go.`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#eef0f3] pt-3">
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Add amount"
          aria-label={`Contribution to ${goal.name}`}
          className="w-32 rounded-lg border border-[#dcdfe4] px-2.5 py-1.5 text-xs outline-none focus:border-[#d81b48]"
        />
        <button
          onClick={contribute}
          disabled={!!busy || !amount}
          className="inline-flex items-center gap-1 rounded-lg border border-[#dcdfe4] px-2.5 py-1.5 text-[11px] text-[#454b54] hover:border-[#16191d] disabled:opacity-50"
        >
          {busy === "add" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Contribute
        </button>
        {history.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#6b727e] hover:text-[#16191d]"
          >
            {history.length} contribution{history.length === 1 ? "" : "s"}
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col divide-y divide-[#eef0f3]">
          {history.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-[#6b727e]">
                {new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className={Number(c.amount) < 0 ? "text-[#c01530]" : "text-[#0f7b53]"}>{fmtMoney(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GoalForm({ onDone, onCancel }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("custom");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amt = Number(target);
    if (!name.trim() || !Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    await base44.entities.Goal.create({
      name: name.trim(),
      target: amt,
      saved: 0,
      target_date: date || null,
      kind,
      contributions: [],
    }).catch(writeFailed);
    setBusy(false);
    onDone();
  };

  const field = "rounded-lg border border-[#dcdfe4] px-2.5 py-1.5 text-xs outline-none focus:border-[#d81b48]";

  return (
    <section className="mt-4 rounded-2xl border border-[#e6e8ec] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#16191d]">New goal</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" aria-label="Goal name" className={`min-w-[160px] flex-1 ${field}`} />
        <input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target amount" aria-label="Target amount" className={`w-36 ${field}`} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Target date" className={`w-40 ${field}`} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Goal type" className={field}>
          {GOAL_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      <p className="mt-2 text-[11px] text-[#8b929c]">{GOAL_KINDS.find((k) => k.key === kind)?.hint}</p>
      <div className="mt-3 flex items-center gap-1.5">
        <button
          onClick={save}
          disabled={busy || !name.trim() || !target}
          className="inline-flex items-center gap-1 rounded-full bg-[#16191d] px-4 py-1.5 text-[11px] font-medium text-white hover:bg-[#2b3038] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />} Create goal
        </button>
        <button onClick={onCancel} className="rounded-full border border-[#dcdfe4] px-4 py-1.5 text-[11px] text-[#454b54] hover:border-[#16191d]">
          Cancel
        </button>
      </div>
    </section>
  );
}
