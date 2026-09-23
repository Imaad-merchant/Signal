// Markets terminal endpoint. Three actions, all behind the Firebase auth check:
//   getData   — intraday bars for a ticker, with the London-session SD stats and the
//               hourly volatility profile the page charts.
//   weekAhead — the week's event-risk map and directional bias (see below).
//   chat      — the research chat, answering against the current SD levels.
//
// `weekAhead` builds the week's macro + micro event calendar
// from _econCalendar.js (pure, offline) and overlays a market snapshot pulled from
// Yahoo's public chart endpoint to size the expected move and score the directional
// bias. The market overlay is best-effort — if the fetch fails the calendar, the
// day-by-day risk map and the event reaction notes are all still returned.
import { verifyAuth } from "./_auth.js";
import { callLLM } from "./_llm.js";
import {
  weekOf, buildWeekEvents, scoreWeek, computeBias, sessionOf, fomcCoverage,
} from "./_econCalendar.js";

// Instruments behind the snapshot. ES is the anchor (VIX prices SPX/ES, and the
// index future is what the week's event risk actually gets traded in).
const SYMBOLS = {
  price: ["ES=F", "^GSPC"],   // second entry is the fallback
  vix: ["^VIX"],
  vix3m: ["^VIX3M"],
  yield10y: ["^TNX"],
  dollar: ["DX-Y.NYB"],
};

const CACHE_MS = 10 * 60 * 1000;
let cache = { at: 0, market: null };

async function fetchCloses(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + "?range=6mo&interval=1d&includePrePost=false";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === "number");
    const stamps = result?.timestamp || [];
    if (closes.length < 30) return null;
    return { closes, asOf: stamps.length ? new Date(stamps[stamps.length - 1] * 1000).toISOString() : null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Hourly bars for a ticker over the last `days` sessions, for the price chart and
// the session stats. Same public chart endpoint as the daily closes above.
async function fetchIntraday(symbol, days) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?range=${encodeURIComponent(days)}d&interval=1h&includePrePost=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const stamps = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];
    if (!stamps?.length || !quote) return null;
    const rows = stamps.map((ts, i) => ({
      time: new Date(ts * 1000).toISOString(),
      hour: new Date(ts * 1000).getUTCHours(),
      open: quote.open?.[i], high: quote.high?.[i], low: quote.low?.[i],
      close: quote.close?.[i], volume: quote.volume?.[i],
    })).filter((r) => typeof r.close === "number");
    return rows.length ? rows : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// London-session mean and standard deviation (the anchor the page's SD levels hang
// off), the average hourly range, and the NY-open print.
function sessionStats(rows) {
  const london = rows.filter((r) => r.hour >= 2 && r.hour <= 5);
  const closes = (london.length ? london : rows).map((r) => r.close);
  const m = closes.reduce((a, b) => a + b, 0) / closes.length;
  const std = Math.sqrt(closes.reduce((a, b) => a + (b - m) ** 2, 0) / closes.length);

  const byHour = new Map();
  for (const r of rows) {
    if (typeof r.high !== "number" || typeof r.low !== "number") continue;
    if (!byHour.has(r.hour)) byHour.set(r.hour, []);
    byHour.get(r.hour).push(r.high - r.low);
  }
  const hourlyVol = [...byHour.entries()]
    .map(([hour, ranges]) => ({ hour, avgRange: ranges.reduce((a, b) => a + b, 0) / ranges.length }))
    .sort((a, b) => a.hour - b.hour);

  // 14:00 UTC is the 9:30 ET cash open through most of the year.
  const nyRows = rows.filter((r) => r.hour === 14);
  const nyOpenPrice = nyRows.length ? nyRows[nyRows.length - 1].open ?? null : null;

  return { mean: m, std, hourlyVol, nyOpenPrice };
}

// First symbol in the list that returns usable data.
async function firstAvailable(symbols) {
  for (const s of symbols) {
    const data = await fetchCloses(s);
    if (data) return { symbol: s, ...data };
  }
  return null;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sma = (xs, n) => (xs.length >= n ? mean(xs.slice(-n)) : null);
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
// Annualised realised volatility (%) from the last n daily closes.
function realizedVol(closes, n = 20) {
  const rets = [];
  for (let i = closes.length - n; i < closes.length; i += 1) {
    if (i <= 0) continue;
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 5) return null;
  const m = mean(rets);
  const variance = rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// The market snapshot the bias and expected-move maths run on.
async function loadMarket() {
  if (cache.market && Date.now() - cache.at < CACHE_MS) return cache.market;

  const [price, vix, vix3m, tnx, dxy] = await Promise.all([
    firstAvailable(SYMBOLS.price),
    firstAvailable(SYMBOLS.vix),
    firstAvailable(SYMBOLS.vix3m),
    firstAvailable(SYMBOLS.yield10y),
    firstAvailable(SYMBOLS.dollar),
  ]);

  const market = { available: !!price };
  if (price) {
    const c = price.closes;
    market.symbol = price.symbol;
    market.price = c[c.length - 1];
    market.sma20 = sma(c, 20);
    market.sma50 = sma(c, 50);
    market.return5d = c.length > 5 ? ((c[c.length - 1] / c[c.length - 6]) - 1) * 100 : null;
    market.realizedVol = realizedVol(c);
    market.asOf = price.asOf;
  }
  if (vix) {
    const c = vix.closes;
    market.vix = c[c.length - 1];
    market.vixMedian = median(c.slice(-60));
  }
  if (vix3m) market.vix3m = vix3m.closes[vix3m.closes.length - 1];
  if (tnx) {
    const c = tnx.closes;
    // Yahoo has quoted ^TNX both as the yield and as ten times the yield.
    const scale = c[c.length - 1] > 20 ? 0.1 : 1;
    market.yield10y = c[c.length - 1] * scale;
    if (c.length > 5) market.yield5dBps = (c[c.length - 1] - c[c.length - 6]) * scale * 100;
  }
  if (dxy) {
    const c = dxy.closes;
    market.dollar = c[c.length - 1];
    if (c.length > 5) market.dollar5dPct = ((c[c.length - 1] / c[c.length - 6]) - 1) * 100;
  }

  cache = { at: Date.now(), market };
  return market;
}

async function weekAhead(offset) {
  const week = weekOf(new Date(), offset);
  const events = buildWeekEvents(week).map((e) => ({ ...e, session: sessionOf(e.time) }));
  const market = await loadMarket();
  const vol = scoreWeek(events, week, market);
  const bias = computeBias(market);
  const fomc = fomcCoverage(week);

  return {
    week: { start: week.start, end: week.end, offset, days: vol.days },
    events,
    vol: { sigmaPct: vol.sigmaPct, weekScore: vol.weekScore, peak: vol.peak },
    bias,
    market,
    meta: {
      generatedAt: new Date().toISOString(),
      timezone: "America/New_York",
      fomcCoveredThrough: fomc.through,
      fomcCovered: fomc.covered,
      marketNote: market.available
        ? null
        : "Live quotes unavailable — expected-move sizing and the bias read are off until the feed returns.",
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { action, offset, symbol, days, messages, context } = req.body || {};

  if (action === "weekAhead") {
    try {
      const n = Number.isFinite(Number(offset)) ? Math.max(-4, Math.min(4, Math.trunc(Number(offset)))) : 0;
      return res.status(200).json(await weekAhead(n));
    } catch (err) {
      return res.status(500).json({ error: `Week-ahead build failed: ${String(err?.message || err).slice(0, 200)}` });
    }
  }

  if (action === "getData") {
    const ticker = String(symbol || "ES=F").trim().slice(0, 20) || "ES=F";
    const range = Math.max(1, Math.min(60, Number(days) || 30));
    const rows = await fetchIntraday(ticker, range);
    if (!rows) {
      return res.status(200).json({ error: `No data returned for ${ticker} — check the ticker and try again.` });
    }
    return res.status(200).json({
      stats: sessionStats(rows),
      chartData: rows.slice(-200).map((r) => ({ time: r.time, open: r.open, high: r.high, low: r.low, close: r.close })),
    });
  }

  if (action === "chat") {
    const turns = (Array.isArray(messages) ? messages : []).slice(-12)
      .map((m) => `${m.role === "user" ? "You" : "Analyst"}: ${String(m.content || "").slice(0, 2000)}`)
      .join("\n");
    try {
      const answer = await callLLM({
        system: "You are a quantitative futures analyst talking to an experienced index-futures trader. "
          + "Answer from the levels and stats you are given — concise, concrete, no hedging boilerplate and no "
          + "financial-advice disclaimers. Say plainly when the data does not support an answer.",
        user: `Current session data:\n${String(context || "").slice(0, 2000)}\n\nConversation:\n${turns}`,
      });
      return res.status(200).json({ answer });
    } catch (err) {
      return res.status(200).json({
        error: String(err?.message || err).includes("No LLM provider")
          ? "The research chat needs an LLM key on this deployment (ANTHROPIC_API_KEY or OPENAI_API_KEY)."
          : "The research chat is unavailable right now — try again.",
      });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${String(action).slice(0, 40)}` });
}
