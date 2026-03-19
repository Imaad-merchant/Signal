import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import OpenAI from 'npm:openai';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

async function fetchStockData(symbol, days) {
  const interval = "1h";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${days}d&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No data returned for symbol: " + symbol);

  const timestamps = result.timestamp;
  const quotes = result.indicators.quote[0];
  const rows = timestamps.map((ts, i) => ({
    time: new Date(ts * 1000),
    hour: new Date(ts * 1000).getUTCHours(),
    open: quotes.open[i],
    high: quotes.high[i],
    low: quotes.low[i],
    close: quotes.close[i],
    volume: quotes.volume[i],
  })).filter(r => r.close != null);

  return rows;
}

function calcStats(rows) {
  // London session: 2am-5am UTC
  const london = rows.filter(r => r.hour >= 2 && r.hour <= 5);
  const closes = london.map(r => r.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const std = Math.sqrt(closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / closes.length);

  // Hourly volatility (HL range)
  const hourlyMap = {};
  for (const r of rows) {
    if (!hourlyMap[r.hour]) hourlyMap[r.hour] = [];
    hourlyMap[r.hour].push(r.high - r.low);
  }
  const hourlyVol = Object.entries(hourlyMap).map(([hour, ranges]) => ({
    hour: parseInt(hour),
    avgRange: ranges.reduce((a, b) => a + b, 0) / ranges.length,
  })).sort((a, b) => a.hour - b.hour);

  // NY open price (hour 9 UTC = 9am UTC, approx 9:30 ET open)
  const nyRows = rows.filter(r => r.hour === 14); // 14 UTC = 9am CT / 10am ET
  const nyOpenPrice = nyRows.length > 0 ? nyRows[nyRows.length - 1].open : null;

  return { mean, std, hourlyVol, nyOpenPrice };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, symbol, days, messages, context } = body;

    if (action === "getData") {
      const rows = await fetchStockData(symbol || "NQ=F", days || 30);
      const stats = calcStats(rows);
      // Return recent price data for chart (last 100 points)
      const chartData = rows.slice(-200).map(r => ({
        time: r.time,
        close: r.close,
        high: r.high,
        low: r.low,
        open: r.open,
      }));
      return Response.json({ stats, chartData });
    }

    if (action === "chat") {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are a Quant analyst. Use these exact numbers to answer:\n${context}` },
          ...messages
        ]
      });
      return Response.json({ answer: response.choices[0].message.content });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});