// Markets terminal endpoint.
//
// `weekAhead` is the live one: it builds the week's macro + micro event calendar
// from _econCalendar.js (pure, offline) and overlays a market snapshot pulled from
// Yahoo's public chart endpoint to size the expected move and score the directional
// bias. The market overlay is best-effort — if the fetch fails the calendar, the
// day-by-day risk map and the event reaction notes are all still returned.
import { verifyAuth } from "./_auth.js";
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

  const { action, offset } = req.body || {};

  if (action === "weekAhead") {
    try {
      const n = Number.isFinite(Number(offset)) ? Math.max(-4, Math.min(4, Math.trunc(Number(offset)))) : 0;
      return res.status(200).json(await weekAhead(n));
    } catch (err) {
      return res.status(500).json({ error: `Week-ahead build failed: ${String(err?.message || err).slice(0, 200)}` });
    }
  }

  // Price history and the research chat still need a market-data provider wired up.
  return res.status(200).json({
    data: [],
    message: "Market data not configured on this deployment",
  });
}
