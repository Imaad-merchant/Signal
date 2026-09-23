// Credit Score — Rocket Money's Credit screen: a score gauge with its band, the
// change since the previous reading, a history line and the standard factor
// rows.
//
// Rocket Money pulls this from Experian (FICO 2). Signal has no bureau
// integration, so a reading is entered by hand and the UI says so plainly
// rather than implying a sync.
import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Trash2, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SCORE_MIN as MIN, SCORE_MAX as MAX, BANDS, bandFor } from "@/components/money/money";
import { Card, Empty, StatRow } from "@/components/money/ui";

// The factors FICO publishes, with the weight each carries. Static reference
// copy — Signal has no report data to score them against.
const FACTORS = [
  { label: "Payment history", weight: "35%", note: "Paying on time is the single biggest lever." },
  { label: "Credit utilization", weight: "30%", note: "Keep balances under 30% of each limit." },
  { label: "Length of credit history", weight: "15%", note: "Older accounts help — closing them hurts." },
  { label: "Credit mix", weight: "10%", note: "A blend of cards and loans scores better." },
  { label: "New credit", weight: "10%", note: "Each hard inquiry dips the score briefly." },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

// Semicircular gauge, 300–850 swept over 180°. A null score draws the empty
// track only — painting the floor value would read as a real (terrible) score.
function Gauge({ score = null }) {
  const has = score != null && Number.isFinite(Number(score));
  const s = has ? Math.max(MIN, Math.min(MAX, Number(score))) : MIN;
  const pct = has ? (s - MIN) / (MAX - MIN) : 0;
  const band = bandFor(s);

  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const arc = Math.PI * r; // half circumference

  // Needle sits on the same arc the track is drawn along.
  const angle = Math.PI * (1 - pct);
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`} role="img" aria-label={has ? `Credit score ${s}, ${band.label}` : "No credit score recorded"}>
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
          fill="none" stroke="#eef0f3" strokeWidth={stroke} strokeLinecap="round"
        />
        {has && (
          <>
            <path
              d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
              fill="none" stroke={band.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={arc} strokeDashoffset={arc - pct * arc}
            />
            <circle cx={nx} cy={ny} r={5} fill="#16191d" />
          </>
        )}
      </svg>
      <div className="-mt-6 text-center">
        <div className={`text-4xl font-bold ${has ? "text-[#16191d]" : "text-[#dcdfe4]"}`}>{has ? s : "—"}</div>
        <div className="text-xs font-medium" style={{ color: has ? band.color : "#8b929c" }}>
          {has ? band.label : "No score yet"}
        </div>
      </div>
      <div className="mt-1 flex w-full max-w-[200px] justify-between text-[10px] text-[#8b929c]">
        <span>{MIN}</span><span>{MAX}</span>
      </div>
    </div>
  );
}

function ScoreTooltip({ active = false, payload = null, label = null }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#dcdfe4] bg-white px-2.5 py-1.5 text-[11px] shadow-lg">
      <div className="text-[#8b929c]">{label}</div>
      <div className="text-[#16191d]">{payload[0].value}</div>
    </div>
  );
}

export default function CreditView({ data, onChange = () => {} }) {
  const { creditScores = [] } = data;
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState("");

  // Newest first for the readings table, oldest first for the chart.
  const sorted = useMemo(
    () => creditScores.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [creditScores],
  );
  const latest = sorted[0] || null;
  const previous = sorted[1] || null;
  const delta = latest && previous ? (Number(latest.score) || 0) - (Number(previous.score) || 0) : null;

  const series = useMemo(
    () => sorted.slice().reverse().map((r) => ({
      date: new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      score: Number(r.score) || 0,
    })),
    [sorted],
  );

  const add = async () => {
    const v = Number(score);
    if (!Number.isFinite(v) || v < MIN || v > MAX) return;
    setBusy("add");
    await base44.entities.CreditScore.create({ date: todayIso(), score: v, source: "manual" }).catch(() => {});
    setBusy(""); setScore("");
    onChange();
  };

  const remove = async (id) => {
    setBusy(id);
    await base44.entities.CreditScore.delete(id).catch(() => {});
    setBusy("");
    onChange();
  };

  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col">
        <section className="mt-1 rounded-2xl border border-[#e6e8ec] bg-white p-4">
          {latest ? (
            <>
              <div className="flex flex-col items-center">
                <Gauge score={latest.score} />
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="text-[#8b929c]">
                    as of {new Date(latest.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  {delta != null && (
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-medium ${
                      delta > 0 ? "bg-emerald-500/10 text-[#0f7b53]" : delta < 0 ? "bg-rose-500/10 text-[#c01530]" : "bg-[#f2f4f7] text-[#6b727e]"
                    }`}>
                      <DeltaIcon className="h-3 w-3" />
                      {delta > 0 ? `+${delta}` : delta} since last check
                    </span>
                  )}
                </div>
              </div>

              {series.length > 1 && (
                <div className="mt-4 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: "#8b929c", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis width={36} domain={["dataMin - 20", "dataMax + 20"]} tick={{ fill: "#8b929c", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ScoreTooltip />} cursor={{ stroke: "#c4c9d0" }} />
                      <Line type="monotone" dataKey="score" stroke="#7b8ff7" strokeWidth={2} dot={{ r: 2.5, fill: "#7b8ff7" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div className="py-6 text-center">
              <Gauge />
              <p className="mx-auto mt-3 max-w-sm text-[11px] text-[#8b929c]">
                No score recorded yet. Signal doesn&apos;t pull from a credit bureau — check your
                score with your bank or card issuer and record it below to start a history.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[#eef0f3] pt-3">
            <input
              type="number"
              inputMode="numeric"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder={`${MIN}–${MAX}`}
              aria-label="Credit score"
              className="w-28 rounded-lg border border-[#dcdfe4] px-2.5 py-1.5 text-xs outline-none focus:border-[#d81b48]"
            />
            <button
              onClick={add}
              disabled={busy === "add" || !score}
              className="inline-flex items-center gap-1 rounded-lg border border-[#dcdfe4] px-2.5 py-1.5 text-[11px] text-[#454b54] hover:border-[#16191d] disabled:opacity-50"
            >
              {busy === "add" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Record today&apos;s score
            </button>
            <span className="ml-auto text-[10px] text-[#8b929c]">Entered by you — not synced from a bureau.</span>
          </div>
        </section>

        <Card title="What moves your score">
          <div className="flex flex-col divide-y divide-[#eef0f3]">
            {FACTORS.map((f) => (
              <StatRow key={f.label} label={f.label} sub={f.note} value={f.weight} tone="muted" />
            ))}
          </div>
        </Card>
      </div>

      <aside className="flex min-w-0 flex-col lg:sticky lg:top-4">
        <Card title="Score history" right={sorted.length > 0 && <span className="text-[10px] text-[#8b929c]">{sorted.length} reading{sorted.length === 1 ? "" : "s"}</span>}>
          {sorted.length === 0 ? <Empty>Record a score to build a history.</Empty> : (
            <div className="flex flex-col divide-y divide-[#eef0f3]">
              {sorted.map((r) => {
                const b = bandFor(r.score);
                return (
                  <div key={r.id} className="flex items-center gap-2.5 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-[#454b54]">
                        {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <span className="block text-[10px] text-[#8b929c]">{b.label}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-[#16191d]">{r.score}</span>
                    <button
                      onClick={() => remove(r.id)}
                      disabled={!!busy}
                      aria-label="Delete reading"
                      className="shrink-0 rounded-lg p-1 text-[#8b929c] hover:bg-[#f7f8fa] hover:text-[#c01530] disabled:opacity-50"
                    >
                      {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Score bands">
          <div className="flex flex-col divide-y divide-[#eef0f3]">
            {BANDS.slice().reverse().map((b, i, arr) => {
              const upper = i === 0 ? MAX : arr[i - 1].at - 1;
              return (
                <div key={b.label} className="flex items-center gap-2.5 py-1.5 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} />
                  <span className="flex-1 text-[#454b54]">{b.label}</span>
                  <span className="text-[#8b929c]">{b.at}–{upper}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </aside>
    </div>
  );
}
