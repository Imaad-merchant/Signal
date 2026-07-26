import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CalendarClock, ListChecks, Sparkles, GraduationCap, Mail, Cpu, Loader2,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

// The dark "matrix" status grid that frames the orb on /cowork.
// Each tile reads existing entities and degrades gracefully: loading → empty → value.
// The overlay is pointer-events-none so it never eats orb taps; tiles re-enable
// pointer events for their own links.

const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// A relative-time label ("2h", "3d") for a signal/grade timestamp.
function ago(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function useTileData() {
  const today = todayKey();

  const tasks = useQuery({
    queryKey: ["grid", "tasks", today],
    queryFn: () => base44.entities.Task.list("-created_date", 200).catch(() => []),
    staleTime: 60_000,
  });
  const commitments = useQuery({
    queryKey: ["grid", "commitments"],
    queryFn: () => base44.entities.Commitment.filter({ status: "open" }, "-created_date", 50).catch(() => []),
    staleTime: 60_000,
  });
  const checkins = useQuery({
    queryKey: ["grid", "checkins"],
    queryFn: () => base44.entities.CheckIn.list("-created_date", 1).catch(() => []),
    staleTime: 60_000,
  });
  const insights = useQuery({
    queryKey: ["grid", "insights"],
    queryFn: () => base44.entities.Insight.list("-created_date", 1).catch(() => []),
    staleTime: 60_000,
  });
  const grades = useQuery({
    queryKey: ["grid", "grades"],
    queryFn: () => base44.entities.Grade.list("-created_date", 5).catch(() => []),
    staleTime: 60_000,
  });
  const signals = useQuery({
    queryKey: ["grid", "signals"],
    queryFn: () => base44.entities.Signal.list("-created_date", 5).catch(() => []),
    staleTime: 60_000,
  });
  const telemetry = useQuery({
    queryKey: ["grid", "telemetry"],
    queryFn: () => base44.entities.Telemetry.list("-updated_date", 1).catch(() => []),
    staleTime: 60_000,
  });

  const todayTasks = (Array.isArray(tasks.data) ? tasks.data : []).filter(
    (t) => t && (t.due_date === today) && t.status !== "done" && t.status !== "completed"
  );
  const openCommitments = Array.isArray(commitments.data) ? commitments.data : [];
  // Open list items = open tasks (the add/complete list feature stores items as Tasks).
  const openTasks = (Array.isArray(tasks.data) ? tasks.data : []).filter(
    (t) => t && t.status !== "done" && t.status !== "completed"
  );
  const openTotal = openCommitments.length + openTasks.length;
  const latestCheckin = (Array.isArray(checkins.data) ? checkins.data : [])[0] || null;
  const latestInsight = (Array.isArray(insights.data) ? insights.data : [])[0] || null;
  const gradeRows = Array.isArray(grades.data) ? grades.data : [];
  const signalRows = Array.isArray(signals.data) ? signals.data : [];
  const machine = (Array.isArray(telemetry.data) ? telemetry.data : [])[0] || null;

  // Compact uptime label from seconds.
  const uptime = machine?.uptime_s != null
    ? (machine.uptime_s >= 86400 ? `${Math.floor(machine.uptime_s / 86400)}d`
      : machine.uptime_s >= 3600 ? `${Math.floor(machine.uptime_s / 3600)}h`
      : `${Math.max(1, Math.floor(machine.uptime_s / 60))}m`)
    : "";

  return {
    tiles: [
      {
        key: "today",
        label: "Today",
        icon: CalendarClock,
        to: "/Dashboard",
        loading: tasks.isLoading,
        value: todayTasks.length ? String(todayTasks.length) : "0",
        unit: todayTasks.length === 1 ? "task" : "tasks",
        sub: todayTasks[0]?.title || "Nothing due",
        tone: todayTasks.length ? "cyan" : "muted",
      },
      {
        key: "commitments",
        label: "Open",
        icon: ListChecks,
        to: "/Tasks",
        loading: commitments.isLoading || tasks.isLoading,
        value: String(openTotal),
        unit: openTotal === 1 ? "item" : "items",
        sub: openCommitments[0]?.text || openTasks[0]?.title || "All clear",
        tone: openTotal ? "blue" : "muted",
      },
      {
        key: "signal",
        label: "Signal",
        icon: Sparkles,
        loading: checkins.isLoading || insights.isLoading,
        value: latestCheckin ? "Check-in" : latestInsight ? "Insight" : "—",
        unit: latestCheckin?.created_date ? ago(latestCheckin.created_date) : latestInsight?.created_date ? ago(latestInsight.created_date) : "",
        sub: latestCheckin?.summary || latestInsight?.content || "No recent signal",
        tone: (latestCheckin || latestInsight) ? "violet" : "muted",
      },
      {
        key: "grades",
        label: "Grades",
        icon: GraduationCap,
        loading: grades.isLoading,
        value: gradeRows.length ? String(gradeRows[0].score ?? gradeRows[0].value ?? "—") : "—",
        unit: gradeRows[0]?.course || gradeRows[0]?.assignment || "",
        sub: gradeRows.length ? (gradeRows[0].assignment || gradeRows[0].course || "Latest grade") : "Say “paste grades”",
        tone: gradeRows.length ? "emerald" : "muted",
      },
      {
        key: "google",
        label: "Inbox",
        icon: Mail,
        loading: signals.isLoading,
        value: signalRows.length ? String(signalRows.length) : "—",
        unit: signalRows.length ? "signals" : "",
        sub: signalRows.length ? (signalRows[0].title || signalRows[0].summary || "New highlight") : "Connect Google",
        tone: signalRows.length ? "amber" : "muted",
        onClick: signalRows.length ? undefined : connectGoogle,
      },
      {
        key: "machine",
        label: "Machine",
        icon: Cpu,
        loading: telemetry.isLoading,
        value: machine?.mem_used_pct != null ? `${machine.mem_used_pct}%` : "—",
        unit: machine?.host || "",
        sub: machine
          ? `up ${uptime}${machine.sampled_at ? ` · ${ago(machine.sampled_at)}` : ""}`
          : "Run the worker",
        tone: machine ? "emerald" : "muted",
      },
    ],
  };
}

const TONE = {
  cyan: "text-cyan-300",
  blue: "text-blue-300",
  violet: "text-violet-300",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  muted: "text-gray-500",
};

// Kick off the Google OAuth connect flow: ask the server for the consent URL
// (owner-scoped), then navigate to it.
async function connectGoogle() {
  try {
    const res = await base44.functions.invoke("jarvis", { route: "google-connect" });
    const url = res?.data?.url || res?.url;
    if (url) window.location.href = url;
  } catch {
    // Server not configured yet — nothing to do; the tile stays "Connect Google".
  }
}

function Card({ tile, compact }) {
  const Icon = tile.icon;
  const body = (
    <div
      className={`group flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm transition-colors hover:border-white/15 ${
        compact ? "min-w-[8.5rem] px-3 py-2.5" : "px-3.5 py-3"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        <Icon className={`h-3 w-3 ${TONE[tile.tone]}`} />
        {tile.label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        {tile.loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
        ) : (
          <span className={`text-xl font-semibold leading-none ${TONE[tile.tone]}`}>{tile.value}</span>
        )}
        {tile.unit && <span className="text-[10px] text-gray-600 truncate">{tile.unit}</span>}
      </div>
      <p className="mt-1 text-[11px] text-gray-500 truncate">{tile.sub}</p>
    </div>
  );
  if (tile.to) return <Link to={tile.to} className="pointer-events-auto no-underline">{body}</Link>;
  if (tile.onClick)
    return (
      <button type="button" onClick={tile.onClick} className="pointer-events-auto text-left">{body}</button>
    );
  return <div className="pointer-events-auto">{body}</div>;
}

export default function StatusGrid() {
  const { tiles } = useTileData();
  const left = tiles.slice(0, 3);
  const right = tiles.slice(3);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {/* Mobile / tablet: a horizontally scrollable strip below the header. */}
      <div className="lg:hidden pointer-events-auto absolute top-14 left-0 right-0 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {tiles.map((t) => (
          <Card key={t.key} tile={t} compact />
        ))}
      </div>

      {/* Desktop: two columns flanking the orb. */}
      <div className="hidden lg:flex absolute left-8 top-1/2 -translate-y-1/2 w-52 flex-col gap-3">
        {left.map((t) => (
          <Card key={t.key} tile={t} />
        ))}
      </div>
      <div className="hidden lg:flex absolute right-8 top-1/2 -translate-y-1/2 w-52 flex-col gap-3">
        {right.map((t) => (
          <Card key={t.key} tile={t} />
        ))}
      </div>
    </div>
  );
}
