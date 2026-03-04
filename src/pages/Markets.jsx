import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { format } from "date-fns";
import { Loader2, Send, Bot, User } from "lucide-react";

const accentColor = () => localStorage.getItem("pulse_secondary") || "#f59e0b";

function MetricCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value ?? "—"}</p>
    </div>
  );
}

function PriceChart({ data }) {
  if (!data || data.length === 0) return null;
  const accent = accentColor();
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Price (Close)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={accent} stopOpacity={0.2} />
              <stop offset="95%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
          <Tooltip
            contentStyle={{ fontSize: 12, border: "none", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
            formatter={(v) => [v?.toFixed(2), "Close"]}
          />
          <Area type="monotone" dataKey="close" stroke={accent} strokeWidth={2} fill="url(#priceGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function VolHeatmap({ data }) {
  if (!data || data.length === 0) return null;
  const accent = accentColor();
  const maxRange = Math.max(...data.map(d => d.avgRange));
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">🔥 Hourly Volatility (Avg H-L Range)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={h => `${h}:00`} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
          <Tooltip
            contentStyle={{ fontSize: 12, border: "none", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
            formatter={(v) => [v?.toFixed(2), "Avg Range"]}
            labelFormatter={h => `Hour: ${h}:00 UTC`}
          />
          <Bar dataKey="avgRange" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={`rgba(245,158,11,${0.3 + 0.7 * (entry.avgRange / maxRange)})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-4 w-4 text-amber-600" />
        </div>
      )}
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser ? "bg-gray-900 text-white" : "bg-white border border-gray-100 text-gray-800"
      }`}>
        {msg.content}
      </div>
      {isUser && (
        <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4 text-gray-500" />
        </div>
      )}
    </div>
  );
}

export default function Markets() {
  const [symbol, setSymbol] = useState("NQ=F");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const accent = accentColor();

  const fetchData = async () => {
    setLoading(true);
    setError("");
    setStats(null);
    setChartData([]);
    const res = await base44.functions.invoke("quantTerminal", { action: "getData", symbol, days });
    if (res.data.error) {
      setError(res.data.error);
    } else {
      setStats(res.data.stats);
      const formatted = res.data.chartData.map(d => ({
        ...d,
        label: format(new Date(d.time), "MM/dd HH:mm"),
      }));
      setChartData(formatted);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const buildContext = () => {
    if (!stats) return "";
    const { mean, std, nyOpenPrice } = stats;
    return `Ticker: ${symbol}
London Mean Price: ${mean?.toFixed(2)}
London StdDev: ${std?.toFixed(2)}
NY Open Price: ${nyOpenPrice?.toFixed(2) ?? "N/A"}
SD Levels anchored to London Mean:
+1.0 SD: ${(mean + std)?.toFixed(2)}
+1.5 SD: ${(mean + 1.5 * std)?.toFixed(2)}
+2.0 SD: ${(mean + 2.0 * std)?.toFixed(2)}
+2.5 SD: ${(mean + 2.5 * std)?.toFixed(2)}`;
  };

  const sendMessage = async () => {
    if (!input.trim() || chatLoading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setChatLoading(true);
    const res = await base44.functions.invoke("quantTerminal", {
      action: "chat",
      messages: newMessages,
      context: buildContext(),
    });
    if (res.data.answer) {
      setMessages([...newMessages, { role: "assistant", content: res.data.answer }]);
    }
    setChatLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚡ Alpha Quant Terminal</h1>
          <p className="text-sm text-gray-400 mt-0.5">London SD levels & volatility analysis</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="Ticker (e.g. NQ=F)"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            {[7, 14, 30, 60].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: accent }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Loading..." : "Analyze"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Metrics */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="London Mean" value={stats.mean?.toFixed(2)} />
          <MetricCard label="+1.5 SD Level" value={(stats.mean + 1.5 * stats.std)?.toFixed(2)} />
          <MetricCard label="+2.5 SD Level" value={(stats.mean + 2.5 * stats.std)?.toFixed(2)} />
          <MetricCard label="NY Open Price" value={stats.nyOpenPrice?.toFixed(2) ?? "N/A"} />
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && <PriceChart data={chartData} />}
      {stats?.hourlyVol?.length > 0 && <VolHeatmap data={stats.hourlyVol} />}

      {/* AI Chat */}
      {stats && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Bot className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-800">AI Quant Researcher</h3>
          </div>
          <div className="h-72 overflow-y-auto p-5 space-y-4 bg-gray-50/50">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center pt-10">Ask about SD reversals, levels, or market structure...</p>
            )}
            {messages.map((m, i) => <ChatMessage key={i} msg={m} />)}
            {chatLoading && (
              <div className="flex gap-3 justify-start">
                <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-400">Thinking...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask about the SD reversals..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              onClick={sendMessage}
              disabled={chatLoading || !input.trim()}
              className="p-2 rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}