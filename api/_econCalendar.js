// Week-ahead economic calendar engine — pure functions, no I/O, so it unit-tests
// standalone (same shape as _logstats.js).
//
// It answers two questions for an index-futures trader:
//   1. WHERE IS THE VOLATILITY — which day/session carries the event risk, and how
//      big a move that day is worth pricing (VIX-implied sigma × an event multiplier).
//   2. WHERE IS THE BIAS — a market-derived tilt (trend, vol regime, term structure,
//      rates, dollar) plus, per event, what a hot vs cool print typically does.
//
// Dates come from each agency's PUBLISHED RULE where one exists (jobless claims are
// always Thursday; payrolls are the third Friday after the reference week; FOMC dates
// are published years ahead) and from its usual monthly pattern otherwise. Every event
// carries `precision`, and the UI marks anything that is not "exact" — this engine is
// a planning tool, not a substitute for the BLS/BEA/Fed calendars.

const ET = "America/New_York";

/* ------------------------------------------------------------------ time */

// Offset (ms) of America/New_York at a given instant — handles EST/EDT.
function tzOffsetMs(ts) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUTC - Math.floor(ts / 1000) * 1000;
}

// An ET wall-clock time ("2026-09-16 14:00 in New York") as a real UTC instant.
export function etWallToUtc(y, m, d, hh = 0, mm = 0) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - tzOffsetMs(guess);
  ts = guess - tzOffsetMs(ts); // second pass fixes a DST-boundary guess
  return new Date(ts);
}

// The civil date in New York for an instant → { y, m, d }.
export function etCivilDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/* -------------------------------------------------- civil-date arithmetic */
// Civil dates are held as UTC-midnight timestamps so day math never trips on DST.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");

export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const toTs = (y, m, d) => Date.UTC(y, m - 1, d);
const fromTs = (ts) => { const dt = new Date(ts); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; };
const dowOf = (y, m, d) => new Date(toTs(y, m, d)).getUTCDay(); // 0 Sun … 6 Sat
const addDays = (c, n) => fromTs(toTs(c.y, c.m, c.d) + n * DAY);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Easter Sunday (Meeus/Jones/Butcher) — only needed for Good Friday.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mth = Math.floor((h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114) / 31);
  const day = ((h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114) % 31) + 1;
  return { y, m: mth, d: day };
}

// nth (1-based) weekday of a month; n = -1 means the last one.
function nthWeekday(y, m, dow, n) {
  if (n < 0) {
    const last = daysInMonth(y, m);
    let d = last;
    while (dowOf(y, m, d) !== dow) d -= 1;
    return { y, m, d };
  }
  let d = 1;
  while (dowOf(y, m, d) !== dow) d += 1;
  return { y, m, d: d + (n - 1) * 7 };
}

/* ------------------------------------------------------------- holidays */

// US equity-market holidays for a year, by rule (NYSE/CME schedule).
function holidaysFor(y) {
  const out = new Map();
  const put = (c, name, earlyClose = false) => out.set(iso(c.y, c.m, c.d), { name, earlyClose });
  // A fixed-date holiday falling on Sat is observed Fri; on Sun, the following Mon.
  const observed = (m, d) => {
    const dow = dowOf(y, m, d);
    if (dow === 6) return addDays({ y, m, d }, -1);
    if (dow === 0) return addDays({ y, m, d }, 1);
    return { y, m, d };
  };
  put(observed(1, 1), "New Year's Day");
  put(nthWeekday(y, 1, 1, 3), "Martin Luther King Jr. Day");
  put(nthWeekday(y, 2, 1, 3), "Presidents' Day");
  put(addDays(easter(y), -2), "Good Friday");
  put(nthWeekday(y, 5, 1, -1), "Memorial Day");
  put(observed(6, 19), "Juneteenth");
  put(observed(7, 4), "Independence Day");
  put(nthWeekday(y, 9, 1, 1), "Labor Day");
  put(nthWeekday(y, 11, 4, 4), "Thanksgiving");
  put(observed(12, 25), "Christmas");
  // Scheduled 1:00pm ET closes.
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  put(addDays(thanksgiving, 1), "Day after Thanksgiving (1pm close)", true);
  if (dowOf(y, 7, 3) >= 1 && dowOf(y, 7, 3) <= 5 && dowOf(y, 7, 4) !== 0 && dowOf(y, 7, 4) !== 6) {
    put({ y, m: 7, d: 3 }, "July 3 (1pm close)", true);
  }
  const xmasEve = { y, m: 12, d: 24 };
  if (dowOf(y, 12, 24) >= 1 && dowOf(y, 12, 24) <= 5) put(xmasEve, "Christmas Eve (1pm close)", true);
  return out;
}

const holidayCache = new Map();
function holidayInfo(c) {
  if (!holidayCache.has(c.y)) holidayCache.set(c.y, holidaysFor(c.y));
  return holidayCache.get(c.y).get(iso(c.y, c.m, c.d)) || null;
}

const isWeekend = (c) => { const w = dowOf(c.y, c.m, c.d); return w === 0 || w === 6; };
const isFullHoliday = (c) => { const h = holidayInfo(c); return !!h && !h.earlyClose; };
const isBusinessDay = (c) => !isWeekend(c) && !isFullHoliday(c);

// n-th business day of a month (1-based).
function nthBusinessDay(y, m, n) {
  let count = 0;
  for (let d = 1; d <= daysInMonth(y, m); d += 1) {
    const c = { y, m, d };
    if (isBusinessDay(c)) { count += 1; if (count === n) return c; }
  }
  return null;
}
function lastBusinessDay(y, m) {
  for (let d = daysInMonth(y, m); d >= 1; d -= 1) {
    const c = { y, m, d };
    if (isBusinessDay(c)) return c;
  }
  return null;
}
function nextBusinessDay(c) {
  let n = addDays(c, 1);
  while (!isBusinessDay(n)) n = addDays(n, 1);
  return n;
}
// Agencies do not publish into a closed market — a rule that lands on a holiday or
// a weekend is pulled back to the business day before it.
function businessify(c) {
  let n = c;
  let guard = 0;
  while (n && !isBusinessDay(n) && guard < 10) { n = addDays(n, -1); guard += 1; }
  return n;
}

/* ----------------------------------------------------------- the week */

// The Mon–Fri trading week containing `now` in New York. `offset` shifts whole
// weeks (+1 = next week). On a weekend we roll forward to the coming week.
export function weekOf(now = new Date(), offset = 0) {
  const today = etCivilDate(now);
  const dow = dowOf(today.y, today.m, today.d);
  let monday = addDays(today, dow === 0 ? 1 : 1 - dow); // Sun → tomorrow's week
  if (dow === 6) monday = addDays(today, 2);
  monday = addDays(monday, offset * 7);
  const days = [];
  for (let i = 0; i < 5; i += 1) {
    const c = addDays(monday, i);
    const h = holidayInfo(c);
    days.push({
      date: iso(c.y, c.m, c.d),
      dow: dowOf(c.y, c.m, c.d),
      closed: !!h && !h.earlyClose,
      earlyClose: !!h && h.earlyClose,
      holiday: h ? h.name : null,
      civil: c,
    });
  }
  return { start: days[0].date, end: days[4].date, days };
}

/* ------------------------------------------------------------- events */

// Impact tiers drive both the badge and the day score. weight is in "event points".
const HIGH = 3, MED = 2, LOW = 1;

// FOMC meeting dates are published years in advance — these are exact.
// Each entry is the DECISION day (second day of the meeting).
const FOMC_DECISIONS = [
  { date: "2026-01-28", sep: false }, { date: "2026-03-18", sep: true },
  { date: "2026-04-29", sep: false }, { date: "2026-06-17", sep: true },
  { date: "2026-07-29", sep: false }, { date: "2026-09-16", sep: true },
  { date: "2026-10-28", sep: false }, { date: "2026-12-09", sep: true },
];
// Last year the table covers; past it the engine says so instead of guessing.
const FOMC_THROUGH = "2026-12-31";

function ev(o) {
  const c = o.civil;
  return {
    id: o.id,
    date: iso(c.y, c.m, c.d),
    time: o.time,                      // ET wall clock, "HH:MM"
    at: etWallToUtc(c.y, c.m, c.d, Number(o.time.slice(0, 2)), Number(o.time.slice(3, 5))).toISOString(),
    title: o.title,
    source: o.source,
    category: o.category,              // "macro" | "micro"
    impact: o.impact,
    weight: o.weight,
    precision: o.precision,            // "exact" | "rule" | "typical"
    why: o.why,
    reaction: o.reaction || null,      // { hot, cool } — the conditional bias read
    note: o.note || null,
  };
}

// The BLS payrolls rule: released the third Friday after the end of the reference
// week (the week containing the 12th of the reference month). This reproduces the
// "usually the first Friday, sometimes the second" behaviour exactly.
function payrollsDayFor(y, m) {
  const ref = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const twelfth = { y: ref.y, m: ref.m, d: 12 };
  const refWeekEnd = addDays(twelfth, 6 - dowOf(twelfth.y, twelfth.m, twelfth.d)); // Saturday
  let friday = addDays(refWeekEnd, 6); // first Friday after the reference week
  friday = addDays(friday, 14);        // → the third one
  // BLS pushes a week when the rule lands on the New Year holiday. It does NOT push
  // for Good Friday — the report lands with the cash market shut, which is exactly
  // the kind of thing this widget should be flagging.
  if (friday.m === 1 && friday.d <= 2) friday = addDays(friday, 7);
  return friday;
}

// CPI has no published formula: BLS lands it on a Tue/Wed/Thu between the 10th and
// the 15th. Pick that day, preferring the midweek slots BLS uses most.
function cpiDayFor(y, m) {
  const prefer = [3, 4, 2]; // Wed, Thu, Tue
  for (const dow of prefer) {
    for (let d = 10; d <= 15; d += 1) {
      const c = { y, m, d };
      if (d <= daysInMonth(y, m) && isBusinessDay(c) && dowOf(y, m, d) === dow) return c;
    }
  }
  for (let d = 10; d <= 15; d += 1) {
    const c = { y, m, d };
    if (d <= daysInMonth(y, m) && isBusinessDay(c)) return c;
  }
  return null;
}

// Retail sales: Census puts it mid-month, typically the 15th–17th.
function retailSalesDayFor(y, m) {
  for (const d of [16, 17, 15, 18, 14]) {
    const c = { y, m, d };
    if (d <= daysInMonth(y, m) && isBusinessDay(c)) return c;
  }
  return null;
}

// PCE (BEA personal income & outlays): the last Thursday or Friday of the month.
function pceDayFor(y, m) {
  for (const dow of [5, 4]) {
    const c = nthWeekday(y, m, dow, -1);
    if (isBusinessDay(c)) return c;
  }
  return lastBusinessDay(y, m);
}

// Every macro release the engine knows how to place, as date-rules.
function macroEventsForMonth(y, m) {
  const out = [];
  const push = (o) => { if (o.civil) out.push(ev(o)); };

  push({
    id: `nfp-${y}-${m}`, civil: payrollsDayFor(y, m), time: "08:30", precision: "rule",
    title: "Nonfarm Payrolls", source: "BLS", category: "macro", impact: HIGH, weight: 12,
    why: "The month's single biggest scheduled move for index futures — jobs, unemployment rate and average hourly earnings in one print.",
    reaction: {
      hot: "Strong jobs + hot wages → yields up, rate cuts priced out. Knee-jerk ES down, but a strong-growth read can be bought back.",
      cool: "Soft payrolls → cuts priced in, ES up. A sharply negative surprise flips it: growth scare, ES down with yields.",
    },
    note: "Third Friday after the reference week — usually the first Friday of the month.",
  });
  push({
    id: `cpi-${y}-${m}`, civil: cpiDayFor(y, m), time: "08:30", precision: "typical",
    title: "CPI — Consumer Price Index", source: "BLS", category: "macro", impact: HIGH, weight: 11,
    why: "The inflation print the front end of the curve trades off. Core MoM is the number that matters.",
    reaction: {
      hot: "Core above consensus → yields and the dollar up, ES down. The first 15 minutes usually overshoot.",
      cool: "Core in line or below → duration rallies, ES up, high-beta and small caps lead.",
    },
    note: "BLS lands CPI on a Tue–Thu between the 10th and 15th; confirm the exact day.",
  });
  const cpi = cpiDayFor(y, m);
  push({
    id: `ppi-${y}-${m}`, civil: cpi ? nextBusinessDay(cpi) : null, time: "08:30", precision: "typical",
    title: "PPI — Producer Price Index", source: "BLS", category: "macro", impact: MED, weight: 5,
    why: "Feeds the PCE components the Fed actually targets, so it moves rate expectations more than its headline suggests.",
    reaction: { hot: "Hot services PPI → PCE revisions up, ES fades.", cool: "Soft PPI → cut odds firm, ES bid." },
    note: "Usually the day after CPI.",
  });
  push({
    id: `retail-${y}-${m}`, civil: retailSalesDayFor(y, m), time: "08:30", precision: "typical",
    title: "Retail Sales", source: "Census", category: "macro", impact: HIGH, weight: 8,
    why: "The cleanest monthly read on the consumer — the control group is what the desk trades.",
    reaction: { hot: "Strong control group → growth bid, cyclicals lead, ES up with yields.", cool: "Weak control group → growth scare, defensives lead, ES down." },
  });
  push({
    id: `pce-${y}-${m}`, civil: businessify(pceDayFor(y, m)), time: "08:30", precision: "typical",
    title: "Core PCE — Personal Income & Outlays", source: "BEA", category: "macro", impact: HIGH, weight: 9,
    why: "The Fed's preferred inflation gauge. Largely pre-computed from CPI/PPI, so it only moves things on a surprise.",
    reaction: { hot: "Core PCE above 0.3% MoM → cuts repriced out, ES down.", cool: "0.1–0.2% MoM → soft-landing trade, ES up." },
  });
  push({
    id: `ism-mfg-${y}-${m}`, civil: nthBusinessDay(y, m, 1), time: "10:00", precision: "typical",
    title: "ISM Manufacturing PMI", source: "ISM", category: "macro", impact: MED, weight: 6,
    why: "First business day of the month — the first hard look at the new month, and prices-paid is an early inflation tell.",
    reaction: { hot: "Above 50 with prices paid up → cyclicals up, but yields up with it.", cool: "Sub-48 → growth worry, ES sold." },
  });
  push({
    id: `ism-svc-${y}-${m}`, civil: nthBusinessDay(y, m, 3), time: "10:00", precision: "typical",
    title: "ISM Services PMI", source: "ISM", category: "macro", impact: MED, weight: 7,
    why: "Services is ~70% of the economy — a bigger ES mover than the manufacturing survey.",
    reaction: { hot: "Strong services + hot prices → hawkish, ES fades.", cool: "Sub-50 services → recession chatter, ES down hard." },
  });
  push({
    id: `umich-p-${y}-${m}`, civil: businessify(nthWeekday(y, m, 5, 2)), time: "10:00", precision: "typical",
    title: "U. Michigan Sentiment (prelim)", source: "U. Michigan", category: "macro", impact: MED, weight: 4,
    why: "Watched for the 1-year and 5–10-year inflation expectations, not the sentiment headline.",
    reaction: { hot: "Inflation expectations jumping → hawkish repricing, ES down.", cool: "Expectations anchored → ES relief bid." },
  });
  push({
    id: `conf-${y}-${m}`, civil: businessify(nthWeekday(y, m, 2, -1)), time: "10:00", precision: "typical",
    title: "Consumer Confidence", source: "Conference Board", category: "macro", impact: LOW, weight: 3,
    why: "Labour-differential sub-index leads the unemployment rate — a quiet early warning on the jobs cycle.",
  });
  push({
    id: `gdp-${y}-${m}`, civil: businessify(nthWeekday(y, m, 4, -1)), time: "08:30", precision: "typical",
    title: "GDP (estimate)", source: "BEA", category: "macro", impact: MED, weight: 5,
    why: "Backward-looking, so it rarely moves ES on its own — but the price deflator inside it can.",
  });
  return out.filter((e) => e.weight > 0);
}

// Weekly and one-off macro events that are tied to a specific date.
// Jobless claims print every Thursday — or the business day before it when that
// Thursday is a holiday.
function claimsEventForWeek(week) {
  const thursday = week.days.find((d) => d.dow === 4);
  if (!thursday) return [];
  const civil = businessify(thursday.civil);
  const shifted = iso(civil.y, civil.m, civil.d) !== thursday.date;
  return [ev({
    id: `claims-${week.start}`, civil, time: "08:30", precision: shifted ? "typical" : "exact",
    title: "Initial Jobless Claims", source: "DOL", category: "macro", impact: MED, weight: 4,
    why: "The highest-frequency labour read there is. Only moves the tape when it breaks its recent range.",
    reaction: { hot: "Claims spiking → growth scare, ES down, yields down.", cool: "Claims low and steady → labour market fine, ES drifts up." },
    note: shifted ? "Pulled forward from Thursday because of the holiday." : null,
  })];
}

function macroEventsForDate(day) {
  const c = day.civil;
  const out = [];
  const fomc = FOMC_DECISIONS.find((f) => f.date === day.date);
  if (fomc) {
    out.push(ev({
      id: `fomc-${day.date}`, civil: c, time: "14:00", precision: "exact",
      title: fomc.sep ? "FOMC decision + dot plot (SEP)" : "FOMC decision",
      source: "Federal Reserve", category: "macro", impact: HIGH, weight: fomc.sep ? 15 : 13,
      why: "The week's centre of gravity. Statement at 2:00, then the press conference at 2:30 — the second move is usually the bigger one.",
      reaction: {
        hot: "Hawkish hold / hawkish dots → front-end yields up, ES down into the close.",
        cool: "Dovish guidance → ES squeezes, small caps and long duration lead.",
      },
      note: "Expect a two-way whipsaw between 2:00 and 2:45 ET — the first move reverses more often than not.",
    }));
    out.push(ev({
      id: `fomc-presser-${day.date}`, civil: c, time: "14:30", precision: "exact",
      title: "Fed Chair press conference", source: "Federal Reserve", category: "macro", impact: HIGH, weight: 6,
      why: "Where the statement gets re-priced. The Q&A, not the prepared remarks, is what moves it.",
    }));
  }
  // Minutes land three weeks after each decision.
  for (const f of FOMC_DECISIONS) {
    const fc = { y: Number(f.date.slice(0, 4)), m: Number(f.date.slice(5, 7)), d: Number(f.date.slice(8, 10)) };
    const minutesDay = addDays(fc, 21);
    if (iso(minutesDay.y, minutesDay.m, minutesDay.d) === day.date) {
      out.push(ev({
        id: `minutes-${day.date}`, civil: c, time: "14:00", precision: "exact",
        title: "FOMC minutes", source: "Federal Reserve", category: "macro", impact: MED, weight: 4,
        why: "Three weeks stale, but the dissent count and the balance-sheet language still move the front end.",
      }));
    }
  }
  return out;
}

// Market-structure and company-level events — the "micro" layer.
function microEventsForDate(day) {
  const c = day.civil;
  const out = [];
  const { y, m, d } = c;
  const third = nthWeekday(y, m, 5, 3);
  const isQuarterMonth = [3, 6, 9, 12].includes(m);

  if (third.d === d) {
    out.push(ev({
      id: `opex-${day.date}`, civil: c, time: "16:00", precision: "exact",
      title: isQuarterMonth ? "Quad witching + S&P index rebalance" : "Monthly options expiry (OpEx)",
      source: "CME / Cboe", category: "micro", impact: isQuarterMonth ? HIGH : MED,
      weight: isQuarterMonth ? 8 : 5,
      why: isQuarterMonth
        ? "Index futures, index options, single-stock futures and single-stock options all expire, and the S&P rebalance prints at the close — the year's heaviest volume days."
        : "Dealer gamma rolls off at the open. Ranges are usually pinned into the morning and loosen sharply after.",
      note: "Pin risk into 10:00, then the post-expiry week tends to trend as gamma clears.",
    }));
  }
  const lastBiz = lastBusinessDay(y, m);
  if (lastBiz && lastBiz.d === d) {
    out.push(ev({
      id: `month-end-${day.date}`, civil: c, time: "15:00", precision: "exact",
      title: isQuarterMonth ? "Quarter-end rebalance (MOC)" : "Month-end rebalance (MOC)",
      source: "Market structure", category: "micro", impact: isQuarterMonth ? MED : LOW,
      weight: isQuarterMonth ? 5 : 3,
      why: "Pension and target-date flows hit the closing auction. The direction is set by the quarter's equity/bond spread, and the imbalance prints at 15:50.",
    }));
  }
  // Treasury refunding auctions cluster in the week containing the 10th.
  if (d >= 8 && d <= 13 && [2, 3, 4].includes(day.dow) && isBusinessDay(c)) {
    const tenor = day.dow === 2 ? "3-year" : day.dow === 3 ? "10-year" : "30-year";
    out.push(ev({
      id: `auction-${day.date}`, civil: c, time: "13:00", precision: "typical",
      title: `${tenor} Treasury auction`, source: "US Treasury", category: "micro",
      impact: tenor === "3-year" ? LOW : MED, weight: tenor === "3-year" ? 2 : 4,
      why: "A tailing auction sends yields up and equities down within minutes — the 1:00pm risk nobody has on their calendar.",
      reaction: { hot: "Tail + weak indirects → yields up, ES sold into 2pm.", cool: "Strong bid-to-cover → yields down, ES bid." },
    }));
  }
  return out;
}

// Earnings season, placed once on the week's heaviest reporting day (Wednesday)
// rather than repeated daily.
function earningsEventForWeek(week) {
  const mid = week.days.find((d) => d.dow === 3 && !d.closed)
    || week.days.find((d) => d.dow >= 2 && d.dow <= 4 && !d.closed);
  if (!mid) return [];
  const season = earningsPhase(mid.civil);
  if (!season) return [];
  return [ev({
    id: `earnings-${week.start}`, civil: mid.civil, time: "16:05", precision: "typical",
    title: `Earnings season — ${season.cohort}`, source: "Earnings season", category: "micro",
    impact: season.impact, weight: season.weight,
    why: season.why,
    note: "Reports cluster Tuesday–Thursday after the 16:00 cash close, so the gap shows up in the overnight ES session.",
  })];
}

// Which part of earnings season a date sits in. Seasons start around the 10th of
// January, April, July and October and run about six weeks.
function earningsPhase(c) {
  const starts = [1, 4, 7, 10].map((m) => ({ y: c.y, m, d: 10 }));
  starts.push({ y: c.y - 1, m: 10, d: 10 }); // a January date belongs to the Q4 season
  let best = null;
  for (const s0 of starts) {
    const offset = Math.round((toTs(c.y, c.m, c.d) - toTs(s0.y, s0.m, s0.d)) / DAY);
    if (offset >= 0 && offset <= 41 && (best === null || offset < best)) best = offset;
  }
  if (best === null) return null;
  if (best <= 9) return { cohort: "banks & financials", impact: MED, weight: 4, why: "The banks open the season. Credit provisions and net interest margin set the tone for the whole cycle." };
  if (best <= 24) return { cohort: "mega-cap tech", impact: HIGH, weight: 7, why: "The handful of names carrying most of the index weight report here — a single-stock gap translates straight into ES." };
  return { cohort: "retail & the long tail", impact: LOW, weight: 2, why: "Retailers and the remaining two-thirds of the index. Matters for breadth, rarely for the index level." };
}

// Every event in the week, sorted by time.
export function buildWeekEvents(week) {
  const months = new Set();
  for (const day of week.days) months.add(`${day.civil.y}-${day.civil.m}`);
  const byDate = new Map(week.days.map((d) => [d.date, d]));

  let events = [];
  for (const key of months) {
    const [y, m] = key.split("-").map(Number);
    events = events.concat(macroEventsForMonth(y, m).filter((e) => byDate.has(e.date)));
  }
  for (const day of week.days) {
    if (day.closed) continue;
    events = events.concat(macroEventsForDate(day), microEventsForDate(day));
  }
  events = events.concat(claimsEventForWeek(week), earningsEventForWeek(week));
  const seen = new Set();
  return events
    .filter((e) => byDate.has(e.date) && !seen.has(e.id) && seen.add(e.id) !== false)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// True when the week runs past the published FOMC table, so the UI can say so
// instead of implying the week is meeting-free.
export function fomcCoverage(week) {
  return { through: FOMC_THROUGH, covered: week.end <= FOMC_THROUGH };
}

/* ------------------------------------------------------------- scoring */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Which session an ET time falls in — so "where in the day" is answerable.
export function sessionOf(time) {
  const mins = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  if (mins < 8 * 60) return "Overnight / London";
  if (mins < 9 * 60 + 30) return "Pre-market";
  if (mins < 11 * 60) return "NY open";
  if (mins < 14 * 60) return "Midday";
  if (mins < 16 * 60) return "Afternoon";
  return "After the close";
}

// Per-day volatility score (0–100) plus the move to price for that day.
//
// The score saturates — a day with two high-impact prints is not twice as risky as
// a day with one, it is just "clear the decks" either way.
export function scoreWeek(events, week, market) {
  const sigmaPct = impliedDailySigmaPct(market);
  const days = week.days.map((day) => {
    const dayEvents = events.filter((e) => e.date === day.date);
    const raw = dayEvents.reduce((sum, e) => sum + e.weight, 0);
    // A closed day still scores — a payrolls print on Good Friday is exactly the
    // kind of risk worth knowing about — but there is no session to size a move in.
    const score = Math.round(100 * (1 - Math.exp(-raw / 12)));
    // Event risk widens the day's distribution; an empty day trades below its own
    // baseline sigma, a heavy one well above it.
    const multiplier = 0.85 + 0.75 * (score / 100);
    const movePct = sigmaPct == null || day.closed ? null : sigmaPct * multiplier;
    const top = dayEvents.slice().sort((a, b) => b.weight - a.weight)[0] || null;
    return {
      ...day,
      score,
      eventCount: dayEvents.length,
      highImpact: dayEvents.filter((e) => e.impact === HIGH).length,
      expectedMovePct: movePct,
      expectedMovePts: movePct != null && market.price ? (movePct / 100) * market.price : null,
      peakEvent: top ? { id: top.id, title: top.title, time: top.time, session: sessionOf(top.time) } : null,
    };
  });
  const busiest = days.slice().sort((a, b) => b.score - a.score)[0] || null;
  return {
    days,
    sigmaPct,
    peak: busiest && busiest.score > 0 ? busiest : null,
    weekScore: Math.round(days.reduce((s, d) => s + d.score, 0) / days.length),
  };
}

// One-day 1-sigma move in percent: from VIX when we have it, else from realized vol.
function impliedDailySigmaPct(market) {
  const annual = market.vix ?? market.realizedVol;
  if (annual == null) return null;
  return annual / Math.sqrt(252);
}

/* ---------------------------------------------------------------- bias */

// Market-derived directional tilt. Every factor is normalised to −1…+1 (positive =
// supportive of equities) and carries a fixed weight, so the widget can show its work.
export function computeBias(market) {
  const f = [];
  const add = (label, value, weight, detail) => {
    if (value == null || !Number.isFinite(value)) return;
    f.push({ label, score: clamp(value, -1, 1), weight, detail });
  };

  if (market.price != null && market.sma20 != null && market.sma50 != null) {
    const vs20 = (market.price - market.sma20) / market.sma20;
    add("Trend (vs 20d / 50d)", clamp(vs20 * 60, -1, 1) * 0.7 + (market.sma20 > market.sma50 ? 0.3 : -0.3), 0.26,
      `${market.price > market.sma20 ? "Above" : "Below"} the 20-day (${market.sma20.toFixed(0)}), 20d ${market.sma20 > market.sma50 ? "over" : "under"} 50d`);
  }
  if (market.return5d != null) {
    add("5-day momentum", clamp(market.return5d / 2.5, -1, 1), 0.16, `${market.return5d >= 0 ? "+" : ""}${market.return5d.toFixed(2)}% over five sessions`);
  }
  if (market.vix != null && market.vixMedian != null) {
    add("Vol regime (VIX vs 60d median)", clamp((market.vixMedian - market.vix) / 5, -1, 1), 0.18,
      `VIX ${market.vix.toFixed(1)} vs ${market.vixMedian.toFixed(1)} median`);
  }
  if (market.vix != null && market.vix3m != null) {
    const slope = (market.vix3m - market.vix) / market.vix3m;
    // Roughly 6% contango is the resting state, so score the deviation from it
    // rather than the raw slope — otherwise a normal tape pins the factor at +1.
    add("VIX term structure", clamp((slope - 0.06) * 10, -1, 1), 0.16,
      slope >= 0 ? `Contango (${(slope * 100).toFixed(1)}%) — no stress bid` : `Backwardation (${(slope * 100).toFixed(1)}%) — hedging demand at the front`);
  }
  if (market.yield5dBps != null) {
    add("Rates impulse (10y, 5d)", clamp(-market.yield5dBps / 25, -1, 1), 0.12,
      `${market.yield5dBps >= 0 ? "+" : ""}${market.yield5dBps.toFixed(0)}bps on the 10-year`);
  }
  if (market.dollar5dPct != null) {
    add("Dollar impulse (5d)", clamp(-market.dollar5dPct / 1.5, -1, 1), 0.12,
      `DXY ${market.dollar5dPct >= 0 ? "+" : ""}${market.dollar5dPct.toFixed(2)}% over five sessions`);
  }

  if (f.length === 0) return { score: 0, label: "No read", tone: "flat", confidence: "none", factors: [] };

  const totalWeight = f.reduce((s, x) => s + x.weight, 0);
  const score = Math.round((f.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight) * 100);
  const sign = Math.sign(score);
  const agreeing = f.filter((x) => Math.sign(x.score) === sign && x.score !== 0).reduce((s, x) => s + x.weight, 0);
  const agreement = agreeing / totalWeight;
  const confidence = Math.abs(score) < 10 ? "low" : agreement > 0.75 ? "high" : agreement > 0.5 ? "medium" : "low";

  const label =
    score >= 35 ? "Risk-on" : score >= 12 ? "Lean long" :
    score <= -35 ? "Risk-off" : score <= -12 ? "Lean short" : "Balanced";
  const tone = score >= 12 ? "up" : score <= -12 ? "down" : "flat";

  return {
    score, label, tone, confidence,
    factors: f.map((x) => ({ ...x, contribution: Math.round((x.score * x.weight / totalWeight) * 100) })),
  };
}

export const IMPACT = { HIGH, MED, LOW };
