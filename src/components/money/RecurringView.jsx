// Recurring — Rocket Money's Recurring screen: Upcoming / All Recurring / Calendar.
// Rows come from the merged manual + auto-detected subscription list built in the
// section shell, so nothing here re-queries.
import React, { useMemo, useState } from "react";
import { Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { fmtMoney, yearlyCost, nextDue, relDue } from "@/components/money/money";
import { upcomingDays, comingLater, monthKey, shiftMonth, monthLabel, daysInMonth } from "@/components/money/analytics";
import { Avatar, Card, Empty } from "@/components/money/ui";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All Recurring" },
  { key: "calendar", label: "Calendar" },
];

// Rocket Money splits recurring charges into subscriptions, card payments and everything else.
function kindOf(sub) {
  const s = `${sub.merchant || ""} ${sub.category || ""}`.toLowerCase();
  if (/card|visa|amex|american express|mastercard|chase|citi|discover|rewards|payment/.test(s)) return "Credit Card Payments";
  if (/insurance|rent|mortgage|utility|electric|water|internet|phone/.test(s)) return "Bills & Utilities";
  return "Subscriptions";
}

export default function RecurringView({ data, onChange = () => {} }) {
  const { subs, subsMonthly } = data;
  const [tab, setTab] = useState("upcoming");

  return (
    <>
      <div className="mt-3 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${
              tab === t.key ? "bg-white/10 text-gray-100" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "upcoming" && <Upcoming subs={subs} />}
      {tab === "all" && <AllRecurring subs={subs} monthly={subsMonthly} onChange={onChange} />}
      {tab === "calendar" && <CalendarTab subs={subs} />}
    </>
  );
}

function Upcoming({ subs }) {
  const week = useMemo(() => upcomingDays(subs, 14), [subs]);
  const later = useMemo(() => comingLater(subs, 14, 12), [subs]);
  const dueSoon = week.filter((d) => d.items.length > 0);
  const soonTotal = dueSoon.reduce((s, d) => s + d.total, 0);
  const laterTotal = later.reduce((s, x) => s + (Number(x.sub.amount) || 0), 0);

  return (
    <>
      <Card title="Next 14 days" right={dueSoon.length > 0 && <span className="text-[11px] text-gray-400">{fmtMoney(soonTotal)}</span>}>
        <div className="mb-3 grid grid-cols-7 gap-1">
          {week.map((d, i) => (
            <div key={i} className={`rounded-lg border p-1.5 text-center ${i === 0 ? "border-cyan-400/30 bg-cyan-400/5" : "border-white/[0.06]"}`}>
              <div className={`text-[9px] uppercase ${i === 0 ? "text-cyan-300" : "text-gray-500"}`}>
                {d.date.toLocaleDateString(undefined, { weekday: "narrow" })}
              </div>
              <div className="text-xs text-gray-300">{d.date.getDate()}</div>
              <div className="mt-0.5 flex min-h-[6px] justify-center gap-0.5">
                {d.items.slice(0, 3).map((s, j) => <span key={j} className="h-1.5 w-1.5 rounded-full bg-violet-400" title={s.merchant} />)}
              </div>
            </div>
          ))}
        </div>

        {dueSoon.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] py-8 text-center">
            <div className="text-sm font-medium text-gray-300">Nothing due soon</div>
            <div className="mt-0.5 text-[11px] text-gray-500">You can relax — nothing is due in the next 14 days.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {dueSoon.flatMap((d) => d.items.map((s, j) => (
              <Row key={`${d.date.toISOString()}-${j}`} sub={s} due={d.date} />
            )))}
          </div>
        )}
      </Card>

      <Card title="Coming later" right={later.length > 0 && <span className="text-[11px] text-gray-500">{later.length} charges for {fmtMoney(laterTotal)}</span>}>
        {later.length === 0 ? <Empty>Nothing else scheduled.</Empty> : (
          <div className="flex flex-col gap-1">
            {later.map((x, i) => <Row key={i} sub={x.sub} due={x.due} />)}
          </div>
        )}
      </Card>
    </>
  );
}

function Row({ sub, due = null, right = null }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2">
      <Avatar name={sub.merchant} />
      <span className="min-w-0 flex-1 truncate text-sm capitalize">
        {sub.merchant}
        {sub.source === "auto" && <span className="ml-1.5 rounded bg-white/5 px-1 text-[9px] uppercase text-gray-500">auto</span>}
        <span className="block text-[10px] capitalize text-gray-500">
          {sub.cadence}{due ? ` · ${relDue(due)}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-sm text-gray-200">{fmtMoney(sub.amount)}</span>
      {right}
    </div>
  );
}

function AllRecurring({ subs, monthly, onChange }) {
  const [open, setOpen] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [showInactive, setShowInactive] = useState(false);
  const [inactive, setInactive] = useState([]);

  const groups = useMemo(() => {
    const g = {};
    for (const s of subs) {
      const k = kindOf(s);
      (g[k] = g[k] || []).push(s);
    }
    return Object.entries(g).map(([label, items]) => ({
      label,
      items: items.slice().sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)),
      yearly: items.reduce((s, x) => s + yearlyCost(x), 0),
    }));
  }, [subs]);

  const add = async () => {
    if (!merchant.trim() || !amount) return;
    await base44.entities.Subscription.create({ merchant: merchant.trim(), amount: Number(amount) || 0, cadence, active: true }).catch(() => {});
    setMerchant(""); setAmount(""); setOpen(false); onChange();
  };
  const track = async (d) => {
    await base44.entities.Subscription.create({ merchant: d.merchant, amount: d.amount, cadence: d.cadence, active: true }).catch(() => {});
    onChange();
  };
  const cancel = async (s) => { if (s.id) { await base44.entities.Subscription.update(s.id, { active: false }).catch(() => {}); onChange(); } };
  const reactivate = async (s) => { await base44.entities.Subscription.update(s.id, { active: true }).catch(() => {}); loadInactive(); onChange(); };

  const loadInactive = async () => {
    const all = await base44.entities.Subscription.list("-created_date", 200).catch(() => []);
    setInactive((Array.isArray(all) ? all : []).filter((s) => s.active === false));
  };
  const toggleInactive = async () => {
    if (!showInactive) await loadInactive();
    setShowInactive((v) => !v);
  };

  const yearlyTotal = subs.reduce((s, x) => s + yearlyCost(x), 0);

  return (
    <Card
      title={`${subs.length} recurring`}
      right={
        <span className="text-right text-[11px] leading-tight">
          <span className="block font-semibold text-violet-300">{fmtMoney(monthly)}/mo</span>
          <span className="block text-gray-500">You spend {fmtMoney(yearlyTotal)}/yearly</span>
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">{g.items.length} {g.label}</span>
              <span className="text-[10px] text-gray-500">You spend {fmtMoney(g.yearly)}/yearly</span>
            </div>
            <div className="flex flex-col gap-1">
              {g.items.map((s, i) => (
                <Row
                  key={s.id || `auto-${i}`}
                  sub={s}
                  due={nextDue(s)}
                  right={s.source === "manual"
                    ? <button onClick={() => cancel(s)} title="Mark inactive" className="p-1 text-gray-500 hover:text-red-300"><X className="h-4 w-4" /></button>
                    : <button onClick={() => track(s)} title="Track this" className="p-1 text-gray-500 hover:text-cyan-300"><Plus className="h-4 w-4" /></button>}
                />
              ))}
            </div>
          </div>
        ))}
        {subs.length === 0 && <Empty>None yet. Link a bank or import transactions and recurring charges appear automatically.</Empty>}

        {open ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Netflix" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25" />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15.99" type="number" className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm outline-none focus:border-white/25" />
            <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-300 outline-none">
              {["monthly", "yearly", "weekly"].map((x) => <option key={x} className="bg-[#0e1015]">{x}</option>)}
            </select>
            <button onClick={add} disabled={!merchant.trim() || !amount} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 disabled:opacity-40 hover:bg-white/15"><Plus className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"><Plus className="h-3 w-3" /> Add subscription</button>
            <button onClick={toggleInactive} className="text-[11px] text-gray-500 hover:text-gray-300">
              {showInactive ? "Hide inactive" : "Show inactive"}
            </button>
          </div>
        )}

        {showInactive && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">{inactive.length} inactive</div>
            {inactive.length === 0 ? <Empty>Nothing inactive.</Empty> : (
              <div className="flex flex-col gap-1">
                {inactive.map((s) => (
                  <Row
                    key={s.id}
                    sub={s}
                    right={<button onClick={() => reactivate(s)} title="Reactivate" className="p-1 text-gray-500 hover:text-emerald-300"><Plus className="h-4 w-4" /></button>}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// Month grid of expected charges — merchant dots per day plus a daily total.
function CalendarTab({ subs }) {
  const [key, setKey] = useState(monthKey());
  const cells = useMemo(() => {
    const [y, m] = key.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const pad = first.getDay();
    const count = daysInMonth(key);

    const byDay = {};
    for (const s of subs) {
      // Project each charge forward from its last charge into this month.
      const due = nextDue(s);
      if (!due) continue;
      const step = s.cadence === "weekly" ? 7 : s.cadence === "yearly" ? 365 : 30;
      const cursor = new Date(due);
      // Walk back so an already-passed charge this month still shows.
      while (cursor > new Date(y, m - 1, 1)) cursor.setDate(cursor.getDate() - step);
      while (cursor < new Date(y, m, 1)) {
        if (cursor.getFullYear() === y && cursor.getMonth() === m - 1) {
          const d = cursor.getDate();
          byDay[d] = byDay[d] || { items: [], total: 0 };
          byDay[d].items.push(s);
          byDay[d].total += Number(s.amount) || 0;
        }
        cursor.setDate(cursor.getDate() + step);
      }
    }

    const out = [];
    for (let i = 0; i < pad; i++) out.push(null);
    for (let d = 1; d <= count; d++) out.push({ day: d, ...(byDay[d] || { items: [], total: 0 }) });
    return out;
  }, [key, subs]);

  const monthTotal = cells.reduce((s, c) => s + (c?.total || 0), 0);
  const isThisMonth = key === monthKey();
  const todayDate = new Date().getDate();

  return (
    <Card
      title={monthLabel(key)}
      right={
        <span className="flex items-center gap-1.5">
          <span className="mr-1 text-[11px] text-gray-500">{fmtMoney(monthTotal)}</span>
          <button onClick={() => setKey(shiftMonth(key, -1))} className="rounded-lg border border-white/10 p-1 text-gray-400 hover:border-cyan-400/40"><ChevronLeft className="h-3 w-3" /></button>
          <button onClick={() => setKey(shiftMonth(key, 1))} className="rounded-lg border border-white/10 p-1 text-gray-400 hover:border-cyan-400/40"><ChevronRight className="h-3 w-3" /></button>
        </span>
      }
    >
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] uppercase text-gray-600">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`min-h-[46px] rounded-lg border p-1 ${
              !c ? "border-transparent"
                : isThisMonth && c.day === todayDate ? "border-cyan-400/30 bg-cyan-400/5"
                : "border-white/[0.06]"
            }`}
          >
            {c && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-gray-400">{c.day}</span>
                  {c.total > 0 && <span className="text-[8px] text-gray-500">${Math.round(c.total)}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {c.items.slice(0, 4).map((s, j) => (
                    <span key={j} className="h-1.5 w-1.5 rounded-full bg-violet-400" title={`${s.merchant} · ${fmtMoney(s.amount)}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
