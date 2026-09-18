import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock,
  ChevronLeft, ChevronRight, Loader2, Maximize2, Minus, RefreshCw, Zap,
} from "lucide-react";

// The week-ahead risk map: every scheduled macro and micro event in the trading
// week, scored into a day-by-day volatility profile, next to a market-derived
// directional bias. Answers "which session is the week's risk in, and which way is
// the tape leaning into it".
//
// Two sizes from one component. `compact` is the Donna widget-panel card — the
// headline read, the day rail and what is next, sized for a ~300px rail. Full is
// the half-screen view: filters, the bias factor breakdown, and every event.
//
// Colour follows the data's job: a single-hue blue ramp carries MAGNITUDE (day
// score, event impact), and the fixed status green/red carries DIRECTION (bias) —
// always with an arrow and a word, never colour alone.

// Sequential blue ramp, stepped for this dark surface. Low → high.
const HEAT = ["#16324f", "#184f95", "#256abf", "#3987e5", "#6da7ec"];
const heatStep = (score) => HEAT[Math.min(HEAT.length - 1, Math.floor((score / 100) * HEAT.length))];

// Status palette — reserved for direction, never reused as a series colour.
const TONE = {
  up: { color: "#0ca30c", Icon: ArrowUpRight },
  down: { color: "#d03b3b", Icon: ArrowDownRight },
  flat: { color: "#8a8a80", Icon: Minus },
};

const IMPACT_LABEL = { 3: "High", 2: "Medium", 1: "Low" };
const IMPACT_COLOR = { 3: HEAT[4], 2: HEAT[3], 1: HEAT[1] };

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Date strings are plain civil dates — read them at UTC noon so no timezone can
// nudge them onto the day before.
const civil = (dateStr) => new Date(`${dateStr}T12:00:00Z`);
const dayShort = (dateStr) => DAY_SHORT[civil(dateStr).getUTCDay()];
const dayLong = (dateStr) => DAY_LONG[civil(dateStr).getUTCDay()];
const dayNum = (dateStr) => civil(dateStr).getUTCDate();
const monthShort = (dateStr) =>
  civil(dateStr).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

// "08:30" (ET wall clock) → "8:30am"
function clockET(time) {
  const h = Number(time.slice(0, 2));
  const m = time.slice(3, 5);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${suffix}`;
}

const fmtPct = (v, digits = 2) => (v == null ? "—" : `${v.toFixed(digits)}%`);
const fmtPts = (v) => (v == null ? null : `${Math.round(v)} pts`);

function Tile({ label, children, hint }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{hint}</p>}
    </div>
  );
}

// Bias: a diverging meter around a neutral midpoint, with the direction also
// carried by an arrow and a word so it never depends on colour.
function BiasTile({ bias }) {
  const tone = TONE[bias?.tone] || TONE.flat;
  const score = bias?.score ?? 0;
  const width = Math.min(50, Math.abs(score) / 2);
  return (
    <Tile label="Week bias">
      <div className="mt-1 flex items-baseline gap-2">
        <tone.Icon className="h-5 w-5 shrink-0" style={{ color: tone.color }} aria-hidden="true" />
        <span className="text-lg font-bold text-gray-100">{bias?.label || "No read"}</span>
        <span className="text-xs font-medium text-gray-500">
          {score > 0 ? "+" : ""}{score}
        </span>
      </div>
      <div className="mt-2.5 h-2 w-full rounded-full bg-white/[0.07]" role="img"
        aria-label={`Bias score ${score} out of 100, ${bias?.label || "no read"}`}>
        <div className="relative h-full">
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/25" />
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              backgroundColor: tone.color,
              width: `${width}%`,
              left: score >= 0 ? "50%" : `${50 - width}%`,
            }}
          />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">
        {bias?.confidence === "none" ? "Waiting on quotes" : `${bias?.confidence} agreement across factors`}
      </p>
    </Tile>
  );
}

function VolTile({ vol, market }) {
  const sigma = vol?.sigmaPct;
  const pts = market?.price && sigma != null ? (sigma / 100) * market.price : null;
  return (
    <Tile label="Expected daily move (1σ)">
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-bold text-gray-100">{sigma == null ? "—" : `±${fmtPct(sigma)}`}</span>
        {pts != null && <span className="text-xs font-medium text-gray-500">±{fmtPts(pts)}</span>}
      </div>
      <p className="mt-2.5 text-[11px] leading-snug text-gray-500">
        {market?.vix != null ? `VIX ${market.vix.toFixed(1)}` : "VIX —"}
        {market?.realizedVol != null && ` · 20d realised ${market.realizedVol.toFixed(1)}`}
        {market?.symbol && ` · ${market.symbol}`}
      </p>
    </Tile>
  );
}

// One day of the week: a heat bar for the event load, with the numbers printed
// beside it rather than hidden in a tooltip.
function DayRow({ day, active, onSelect, maxScore }) {
  const width = maxScore > 0 ? Math.max(day.score > 0 ? 6 : 2, (day.score / maxScore) * 100) : 2;
  const title = day.closed
    ? `${dayLong(day.date)} — market closed (${day.holiday})`
    : `${dayLong(day.date)} — risk score ${day.score}/100, ${day.eventCount} event${day.eventCount === 1 ? "" : "s"}`
      + (day.peakEvent ? `, heaviest ${day.peakEvent.title} at ${clockET(day.peakEvent.time)} ET (${day.peakEvent.session})` : "");
  return (
    <button
      type="button"
      onClick={() => onSelect(active ? null : day.date)}
      title={title}
      aria-pressed={active}
      className={`grid w-full grid-cols-[3.1rem_1fr_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
      }`}
    >
      <span className="text-[11px] font-medium text-gray-400">
        {dayShort(day.date)} {dayNum(day.date)}
      </span>
      <span className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: day.closed ? "#3a3a36" : heatStep(day.score) }}
        />
      </span>
      <span className="flex items-center gap-2 text-[11px] tabular-nums">
        {day.closed ? (
          <span className="text-gray-500">closed</span>
        ) : (
          <>
            <span className="text-gray-300">{day.expectedMovePct == null ? `risk ${day.score}` : `±${fmtPct(day.expectedMovePct, 2)}`}</span>
            <span className="w-16 text-right text-gray-500">
              {day.eventCount === 0
                ? "quiet"
                : day.expectedMovePts != null
                  ? `±${fmtPts(day.expectedMovePts)}`
                  : `${day.eventCount} event${day.eventCount === 1 ? "" : "s"}`}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

function EventRow({ event, dayPrefix = null }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(event.reaction || event.note);
  return (
    <div className="border-b border-white/[0.06] py-2.5 last:border-0">
      <div className="flex items-start gap-2.5">
        <span className="w-14 shrink-0 pt-0.5 text-[11px] tabular-nums text-gray-500">
          {dayPrefix ? `${dayPrefix} ${clockET(event.time)}` : clockET(event.time)}
        </span>
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: IMPACT_COLOR[event.impact] }}
          title={`${IMPACT_LABEL[event.impact]} impact`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => hasDetail && setOpen((v) => !v)}
            className={`block text-left text-[13px] font-medium leading-snug text-gray-100 ${hasDetail ? "hover:text-white" : "cursor-default"}`}
          >
            {event.precision !== "exact" && <span className="text-gray-500" title="Date follows the agency's usual pattern">~ </span>}
            {event.title}
          </button>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {IMPACT_LABEL[event.impact]} impact · {event.source} · {event.session}
          </p>
          {open && (
            <div className="mt-2 space-y-2 rounded-lg bg-white/[0.03] p-2.5">
              <p className="text-[11px] leading-relaxed text-gray-300">{event.why}</p>
              {event.reaction && (
                <div className="space-y-1">
                  <p className="text-[11px] leading-relaxed text-gray-400">
                    <span className="font-semibold" style={{ color: TONE.down.color }}>Hot</span> — {event.reaction.hot}
                  </p>
                  <p className="text-[11px] leading-relaxed text-gray-400">
                    <span className="font-semibold" style={{ color: TONE.up.color }}>Cool</span> — {event.reaction.cool}
                  </p>
                </div>
              )}
              {event.note && <p className="text-[11px] italic leading-relaxed text-gray-500">{event.note}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BiasFactors({ factors }) {
  if (!factors?.length) return null;
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 1);
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      {factors.map((f) => {
        const tone = f.contribution > 0 ? TONE.up : f.contribution < 0 ? TONE.down : TONE.flat;
        const width = (Math.abs(f.contribution) / max) * 46;
        return (
          <div key={f.label} className="grid grid-cols-[1fr_5.5rem] items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-gray-300">{f.label}</p>
              <p className="truncate text-[10px] text-gray-500">{f.detail}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative h-1.5 flex-1 rounded-full bg-white/[0.06]">
                <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    backgroundColor: tone.color,
                    width: `${width}%`,
                    left: f.contribution >= 0 ? "50%" : `${50 - width}%`,
                  }}
                />
              </div>
              <span className="w-6 text-right text-[10px] tabular-nums text-gray-500">
                {f.contribution > 0 ? "+" : ""}{f.contribution}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TABS = [
  { key: "all", label: "All" },
  { key: "macro", label: "Macro" },
  { key: "micro", label: "Micro" },
];

export default function WeekAheadWidget({ className = "", accent = "#f59e0b", compact = false, onExpand = null }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [selectedDay, setSelectedDay] = useState(null);
  const [showFactors, setShowFactors] = useState(false);

  const load = useCallback(async (weekOffset) => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("quantTerminal", { action: "weekAhead", offset: weekOffset });
      const payload = res?.data;
      if (!payload || payload.error || !payload.week) {
        setError(payload?.error || "Couldn't build the week — try again.");
        setData(null);
      } else {
        setData(payload);
      }
    } catch {
      setError("Couldn't reach the calendar service — try again.");
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { setSelectedDay(null); load(offset); }, [offset, load]);

  const events = useMemo(() => {
    if (!data) return [];
    const matching = data.events.filter(
      (e) => (tab === "all" || e.category === tab) && (!selectedDay || e.date === selectedDay),
    );
    if (!compact) return matching;
    // The rail card shows what is still ahead — or the tail of the week once it is
    // all behind us, so the card is never empty on a Friday afternoon.
    const now = Date.now();
    const upcoming = matching.filter((e) => new Date(e.at).getTime() >= now);
    return (upcoming.length ? upcoming : matching.slice(-3)).slice(0, 3);
  }, [data, tab, selectedDay, compact]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }
    return [...map.entries()];
  }, [events]);

  const maxScore = Math.max(...(data?.week.days.map((d) => d.score) || [0]), 1);
  const peak = data?.vol?.peak;
  const weekLabel = data
    ? `${monthShort(data.week.start)} ${dayNum(data.week.start)} – ${
        monthShort(data.week.end) === monthShort(data.week.start) ? "" : `${monthShort(data.week.end)} `
      }${dayNum(data.week.end)}`
    : "";

  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <CalendarClock className="h-4 w-4 shrink-0" style={{ color: accent }} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-100">Week Ahead</h3>
          <p className="truncate text-[11px] text-gray-500">
            {!weekLabel ? "Macro & micro event risk" : compact ? weekLabel : `${weekLabel} · event risk & bias (ET)`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button" onClick={() => setOffset((o) => Math.max(-4, o - 1))}
            title="Previous week" aria-label="Previous week"
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {!compact && (
            <button
              type="button" onClick={() => setOffset(0)}
              className={`whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                offset === 0 ? "text-gray-300" : "text-gray-500 hover:bg-white/5 hover:text-gray-200"
              }`}
            >
              {offset === 0 ? "This week" : offset === 1 ? "Next week" : `${offset > 0 ? "+" : ""}${offset}w`}
            </button>
          )}
          <button
            type="button" onClick={() => setOffset((o) => Math.min(4, o + 1))}
            title="Next week" aria-label="Next week"
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!compact && (
            <button
              type="button" onClick={() => load(offset)} disabled={loading}
              title="Refresh" aria-label="Refresh"
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          {onExpand && (
            <button
              type="button" onClick={onExpand}
              title="Open full size" aria-label="Open full size"
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading && !data && (
        <div className="flex flex-1 items-center justify-center gap-2 px-4 py-16 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Building the week…
        </div>
      )}

      {error && !loading && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-400">{error}</p>
          <button
            type="button" onClick={() => load(offset)}
            className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/5"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Headline read */}
          <div className={`grid gap-2.5 px-4 pt-3.5 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
            <BiasTile bias={data.bias} />
            <VolTile vol={data.vol} market={data.market} />
          </div>

          {!compact && data.bias.factors.length > 0 && (
            <button
              type="button" onClick={() => setShowFactors((v) => !v)}
              className="mx-4 mt-1.5 self-start text-[11px] text-gray-500 underline-offset-2 transition-colors hover:text-gray-300 hover:underline"
            >
              {showFactors ? "Hide what's driving the bias" : "What's driving the bias?"}
            </button>
          )}
          {showFactors && (
            <div className="px-4 pt-2">
              <BiasFactors factors={data.bias.factors} />
            </div>
          )}

          {/* Peak-risk callout */}
          {peak?.peakEvent && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5"
              style={{ borderColor: `${HEAT[4]}55`, backgroundColor: `${HEAT[1]}22` }}>
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: HEAT[4] }} />
              <p className="text-[11px] leading-relaxed text-gray-300">
                <span className="font-semibold text-gray-100">
                  Peak risk — {dayLong(peak.date)} {clockET(peak.peakEvent.time)} ET
                </span>
                {" · "}{peak.peakEvent.title}
                {peak.expectedMovePct != null && (
                  <> · size the session for ±{fmtPct(peak.expectedMovePct)}
                    {peak.expectedMovePts != null && ` (±${fmtPts(peak.expectedMovePts)})`}</>
                )}
              </p>
            </div>
          )}

          {/* Day rail */}
          <div className="px-4 pt-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Where the vol is</p>
              <div className="flex items-center gap-1" aria-hidden="true">
                <span className="text-[10px] text-gray-600">quiet</span>
                {HEAT.map((c) => <span key={c} className="h-2 w-3 rounded-sm" style={{ backgroundColor: c }} />)}
                <span className="text-[10px] text-gray-600">heavy</span>
              </div>
            </div>
            <div className="space-y-0.5">
              {data.week.days.map((day) => (
                <DayRow
                  key={day.date} day={day} maxScore={maxScore}
                  active={selectedDay === day.date} onSelect={setSelectedDay}
                />
              ))}
            </div>
          </div>

          {/* Filters */}
          {!compact && (
          <div className="flex items-center gap-1 px-4 pb-1 pt-4">
            {TABS.map((t) => (
              <button
                key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  tab === t.key ? "bg-white/[0.08] text-gray-100" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
            {selectedDay && (
              <button
                type="button" onClick={() => setSelectedDay(null)}
                className="ml-auto flex items-center gap-1 text-[11px] text-gray-500 transition-colors hover:text-gray-300"
              >
                {dayShort(selectedDay)} only <ArrowRight className="h-3 w-3" /> clear
              </button>
            )}
          </div>
          )}

          {/* Event list */}
          {compact && (
            <p className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {selectedDay ? `${dayLong(selectedDay)}` : "Next up"}
            </p>
          )}
          <div className={`px-4 pb-2 ${compact ? "" : "min-h-0 flex-1 overflow-y-auto"}`}>
            {grouped.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-500">
                Nothing scheduled in this filter — a quiet stretch is a range-trading week.
              </p>
            )}
            {grouped.map(([date, dayEvents]) => (
              <div key={date} className={compact ? "" : "pt-3 first:pt-1"}>
                {!compact && (
                  <p className="sticky top-0 z-10 bg-[#111318] py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {dayLong(date)} {dayNum(date)} {monthShort(date)}
                  </p>
                )}
                {dayEvents.map((e) => (
                  <EventRow key={e.id} event={e} dayPrefix={compact ? dayShort(date) : null} />
                ))}
              </div>
            ))}
          </div>

          {/* Provenance */}
          <div className={`border-t border-white/[0.06] px-4 py-2.5 ${compact ? "hidden" : ""}`}>
            {data.meta.marketNote && (
              <p className="mb-1 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-300/80">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {data.meta.marketNote}
              </p>
            )}
            <p className="text-[10px] leading-relaxed text-gray-600">
              FOMC, expiry and claims dates are exact. Anything marked <span className="text-gray-500">~</span> follows the
              agency's usual release pattern — confirm against the BLS, BEA and Census calendars.
              {!data.meta.fomcCovered && " FOMC dates are only published through " + data.meta.fomcCoveredThrough + "."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
