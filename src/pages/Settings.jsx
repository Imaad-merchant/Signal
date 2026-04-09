import React, { useState, useRef } from "react";
import { Check, ArrowLeft, Trash2, AlertTriangle, Calendar, Loader2, CheckCircle2, Download, Upload, ListTodo, Unlink, FilePlus2, FileDown, FileUp } from "lucide-react";
import ImportActivitiesDialog from "../components/dashboard/ImportActivitiesDialog";
import ImportTasksDialog from "../components/dashboard/ImportTasksDialog";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";



const WEEK_STARTS = ["Sunday", "Monday"];

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#2d2e30] shadow-sm p-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4 min-h-[44px] py-1">
      <div>
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-white/10"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => localStorage.getItem("pulse_week_start") || "Sunday");
  const [notifications, setNotifications] = useState(() => localStorage.getItem("pulse_notifications") !== "false");
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectResult, setDisconnectResult] = useState(null);
  const [showImportCalendar, setShowImportCalendar] = useState(false);
  const [showImportTasks, setShowImportTasks] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [smartImporting, setSmartImporting] = useState(false);
  const [smartImportResult, setSmartImportResult] = useState(null);
  const [smartImportProgress, setSmartImportProgress] = useState("");
  const smartImportRef = useRef(null);

  const handleSmartImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSmartImporting(true);
    setSmartImportResult(null);
    setSmartImportProgress("Reading file...");

    try {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";

      if (isImage || isPdf) {
        // Convert to base64 and send directly to API (no Firebase Storage needed)
        setSmartImportProgress("Reading file...");
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });

        setSmartImportProgress("AI is reading your file...");
        const token = await (await import("@/api/firebase")).auth.currentUser.getIdToken();

        const res = await fetch("/api/smart-import", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileBase64: base64, fileName: file.name, fileType: file.type }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "AI import failed");
        }
        const { tasks: parsedTasks } = await res.json();

        setSmartImportProgress(`Creating ${parsedTasks.length} tasks...`);
        let count = 0;
        for (const task of parsedTasks) {
          await base44.entities.Task.create({
            title: task.title || "Untitled",
            description: task.description || "",
            due_date: task.due_date || "",
            category: task.category || "work",
            priority: task.priority || "medium",
            status: task.status || "todo",
          });
          count++;
          if (count % 5 === 0) setSmartImportProgress(`Creating tasks... ${count}/${parsedTasks.length}`);
        }
        setSmartImportResult({ success: true, count });
      } else {
        // Text-based files (ICS, CSV, TXT, etc.)
        const text = await file.text();

        // Try ICS parsing first
        if (file.name.endsWith(".ics") || text.includes("BEGIN:VCALENDAR")) {
          setSmartImportProgress("Parsing .ics file...");
          const events = [];
          const blocks = text.split("BEGIN:VEVENT");
          for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i].split("END:VEVENT")[0];
            const get = (key) => { const m = block.match(new RegExp(`${key}[^:]*:(.+)`)); return m ? m[1].trim() : ""; };
            const title = get("SUMMARY");
            const dateStr = get("DTSTART");
            const due_date = dateStr.length >= 8 ? `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}` : "";
            if (title) events.push({ title, description: get("DESCRIPTION") || "", due_date, status: "todo", priority: "medium", category: "work" });
          }
          setSmartImportProgress(`Creating ${events.length} tasks...`);
          for (const task of events) await base44.entities.Task.create(task);
          setSmartImportResult({ success: true, count: events.length });
        } else {
          // Send text to AI for parsing
          setSmartImportProgress("AI is reading your file...");
          const token = await (await import("@/api/firebase")).auth.currentUser.getIdToken();
          const res = await fetch("/api/smart-import", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ textContent: text, fileName: file.name, fileType: file.type }),
          });
          if (!res.ok) throw new Error("AI import failed");
          const { tasks: parsedTasks } = await res.json();

          setSmartImportProgress(`Creating ${parsedTasks.length} tasks...`);
          let count = 0;
          for (const task of parsedTasks) {
            await base44.entities.Task.create({
              title: task.title || "Untitled",
              description: task.description || "",
              due_date: task.due_date || "",
              category: task.category || "work",
              priority: task.priority || "medium",
              status: task.status || "todo",
            });
            count++;
          }
          setSmartImportResult({ success: true, count });
        }
      }
    } catch (err) {
      console.error("Smart import error:", err);
      setSmartImportResult({ success: false, error: err.message });
    }
    setSmartImporting(false);
    setSmartImportProgress("");
    e.target.value = "";
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const user = await base44.auth.me();
      // Delete all user tasks and categories
      const tasks = await base44.entities.Task.filter({ created_by: user.email });
      const cats = await base44.entities.Category.list();
      await Promise.all([
        ...tasks.map(t => base44.entities.Task.delete(t.id)),
        ...cats.map(c => base44.entities.Category.delete(c.id)),
      ]);
      base44.auth.logout();
    } catch (e) {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDownloadCalendar = async () => {
    setDownloading(true);
    const user = await base44.auth.me();
    const tasks = await base44.entities.Task.filter({ created_by: user.email });
    const withDates = tasks.filter(t => t.due_date);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pulse//Calendar//EN',
    ];
    for (const task of withDates) {
      const d = task.due_date.replace(/-/g, '');
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:pulse-${task.id}`);
      lines.push(`SUMMARY:${task.title}`);
      if (task.description) lines.push(`DESCRIPTION:${task.description.replace(/\n/g, '\\n')}`);
      lines.push(`DTSTART;VALUE=DATE:${d}`);
      lines.push(`DTEND;VALUE=DATE:${d}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pulse-calendar.ics'; a.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  };

  const handleGoogleCalendarSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await base44.functions.invoke('pushToGoogleCalendar', {});
      setSyncResult({ success: true, synced: res.data.synced, total: res.data.total });
    } catch (e) {
      setSyncResult({ success: false, error: e.message });
    }
    setSyncing(false);
  };

  const handleDisconnectGoogleCalendar = async () => {
    setDisconnecting(true);
    setDisconnectResult(null);
    try {
      const res = await base44.functions.invoke('disconnectGoogleCalendar', {});
      if (res.data?.success) {
        setDisconnectResult({ success: true, deleted: res.data.deleted });
      } else {
        setDisconnectResult({ success: false, error: res.data?.error || 'Failed to remove events' });
      }
    } catch (e) {
      setDisconnectResult({ success: false, error: e.message });
    }
    setDisconnecting(false);
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const user = await base44.auth.me();
      const tasks = await base44.entities.Task.filter({ created_by: user.email }, "-due_date");
      const sorted = [...tasks].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));

      // Group tasks by date
      const grouped = {};
      for (const t of sorted) {
        const key = t.due_date || 'No Date';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
      }

      const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
      const statusLabels = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      let html = `<!DOCTYPE html><html><head><title>Pulse Calendar Export</title><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 13px; margin-bottom: 32px; }
        .date-group { margin-bottom: 24px; }
        .date-header { font-size: 15px; font-weight: 600; color: #333; padding: 8px 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 8px; }
        .task { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; margin-bottom: 4px; background: #f9fafb; }
        .task.done { opacity: 0.5; text-decoration: line-through; }
        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .title { font-size: 13px; font-weight: 500; flex: 1; }
        .meta { font-size: 11px; color: #888; }
        .badge { font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
        .summary { margin-top: 32px; padding-top: 16px; border-top: 2px solid #e5e7eb; font-size: 13px; color: #666; }
        @media print { body { padding: 20px; } }
      </style></head><body>
        <h1>Pulse Calendar</h1>
        <p class="subtitle">Exported on ${dateStr} · ${tasks.length} tasks</p>`;

      for (const [date, dateTasks] of Object.entries(grouped)) {
        const label = date === 'No Date' ? 'No Due Date' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        html += `<div class="date-group"><div class="date-header">${label}</div>`;
        for (const t of dateTasks) {
          const color = priorityColors[t.priority] || priorityColors.medium;
          const status = statusLabels[t.status] || 'To Do';
          html += `<div class="task ${t.status === 'done' ? 'done' : ''}">
            <span class="dot" style="background:${color}"></span>
            <span class="title">${t.title || 'Untitled'}</span>
            <span class="meta">${status}</span>
            ${t.category ? `<span class="badge" style="background:#f3f4f6">${t.category}</span>` : ''}
          </div>`;
        }
        html += `</div>`;
      }

      const doneCount = tasks.filter(t => t.status === 'done').length;
      const highCount = tasks.filter(t => t.priority === 'high').length;
      html += `<div class="summary">
        <strong>${doneCount}</strong> completed · <strong>${highCount}</strong> high priority · <strong>${tasks.length - doneCount}</strong> remaining
      </div></body></html>`;

      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      w.onload = () => w.print();
    } catch (_) {}
    setDownloadingPdf(false);
  };

  const handleClearAllTasks = async () => {
    setClearing(true);
    try {
      const user = await base44.auth.me();
      const tasks = await base44.entities.Task.filter({ created_by: user.email });
      await Promise.all(tasks.map(t => base44.entities.Task.delete(t.id)));
    } catch (_) {}
    setClearing(false);
    setShowClearConfirm(false);
  };

  const handleSave = () => {
    localStorage.setItem("pulse_week_start", weekStart);
    localStorage.setItem("pulse_notifications", notifications);
    window.dispatchEvent(new Event("focus"));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Customize your Pulse experience</p>
        </div>
      </div>

      {/* Import & Export */}
      <Section title="Import & Export">
        <Row label="Import" description="Upload any file — PDF, image, .ics, spreadsheet — AI will extract your tasks">
          <div className="flex items-center gap-2">
            <button
              onClick={() => smartImportRef.current?.click()}
              disabled={smartImporting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/20 transition-colors min-h-[44px] disabled:opacity-60"
            >
              {smartImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {smartImporting ? smartImportProgress || "Importing..." : "Import File"}
            </button>
            <input ref={smartImportRef} type="file" accept=".pdf,.ics,.csv,.txt,.xlsx,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleSmartImport} />
            {smartImportResult?.success && <span className="text-xs text-emerald-400">{smartImportResult.count} tasks imported!</span>}
            {smartImportResult?.success === false && <span className="text-xs text-red-400">{smartImportResult.error || "Error"}</span>}
          </div>
        </Row>
        <Row label="Start Fresh" description="Clear all tasks and start with a blank task list">
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-colors min-h-[44px]"
          >
            <FilePlus2 className="h-4 w-4" />
            New List
          </button>
        </Row>
        <Row label="Download Calendar" description="Download all your tasks as an .ics file">
          <button
            onClick={handleDownloadCalendar}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors min-h-[44px] disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? 'Preparing…' : 'Download .ics'}
          </button>
        </Row>
        <Row label="Export as PDF" description="Download a formatted PDF view of your calendar and tasks">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors min-h-[44px] disabled:opacity-60"
          >
            {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {downloadingPdf ? 'Preparing…' : 'Export PDF'}
          </button>
        </Row>
      </Section>

      {/* Google Calendar Sync */}
      <Section title="Google Calendar">
        <Row label="Sync to Google Calendar" description="Push all your tasks with due dates to your Google Calendar">
          <div className="flex items-center gap-2">
            <button
              onClick={handleGoogleCalendarSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/20 transition-colors min-h-[44px] disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={handleDisconnectGoogleCalendar}
              disabled={disconnecting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors min-h-[44px] disabled:opacity-60"
            >
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              {disconnecting ? "Removing…" : "Remove Synced"}
            </button>
          </div>
        </Row>
        {syncResult && (
          <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${
            syncResult.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          }`}>
            {syncResult.success
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> {syncResult.synced} of {syncResult.total} tasks synced to Google Calendar</>
              : <><AlertTriangle className="h-3.5 w-3.5" /> Sync failed: {syncResult.error}</>}
          </div>
        )}
        {disconnectResult && (
          <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${
            disconnectResult.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          }`}>
            {disconnectResult.success
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> {disconnectResult.deleted} synced events removed from Google Calendar</>
              : <><AlertTriangle className="h-3.5 w-3.5" /> {disconnectResult.error}</>}
          </div>
        )}
      </Section>

      {/* Calendar */}
      <Section title="Calendar">
        <Row label="Week Starts On" description="First day of the week in calendar views">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {WEEK_STARTS.map((w) => (
              <button
                key={w}
                onClick={() => setWeekStart(w)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
                  weekStart === w ? "bg-[#1e1f20] text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <Row label="Task Reminders" description="Get reminded about upcoming tasks">
          <Toggle checked={notifications} onChange={setNotifications} />
        </Row>
      </Section>

      {/* About */}
      <Section title="About">
        <div className="flex items-center justify-between text-sm min-h-[44px]">
          <span className="text-gray-400">Version</span>
          <span className="text-gray-500">1.0.0</span>
        </div>
        <div className="flex items-center justify-between text-sm min-h-[44px]">
          <span className="text-gray-400">App</span>
          <span className="text-gray-500 font-semibold">Pulse</span>
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone">
        <Row label="Delete Account" description="Permanently delete your account and all data. This cannot be undone.">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors min-h-[44px]"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </Row>
      </Section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
            saved ? "bg-emerald-500 text-white" : "bg-white text-gray-900 hover:bg-gray-100"
          }`}
        >
          {saved && <Check className="h-4 w-4" />}
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      <ImportActivitiesDialog open={showImportCalendar} onOpenChange={setShowImportCalendar} onImported={() => {}} />
      <ImportTasksDialog open={showImportTasks} onOpenChange={setShowImportTasks} onImported={() => {}} />

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-[#2d2e30] border border-white/10 rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <FilePlus2 className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-100">Start Fresh</h3>
                <p className="text-sm text-gray-500">This will delete all your current tasks.</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              All tasks will be permanently removed so you can start with a clean slate. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllTasks}
                disabled={clearing}
                className="flex-1 px-4 py-3 rounded-xl bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors disabled:opacity-60 min-h-[44px]"
              >
                {clearing ? "Clearing…" : "Clear All Tasks"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-[#2d2e30] border border-white/10 rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-100">Delete Account</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              All your tasks, categories, and data will be permanently deleted. Are you sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60 min-h-[44px]"
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}