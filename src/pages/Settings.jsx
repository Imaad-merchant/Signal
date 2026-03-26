import React, { useState } from "react";
import { Check, ArrowLeft, Trash2, AlertTriangle, Calendar, Loader2, CheckCircle2 } from "lucide-react";
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
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Customize your Pulse experience</p>
        </div>
      </div>

      {/* Google Calendar Sync */}
      <Section title="Google Calendar">
        <Row label="Sync to Google Calendar" description="Push all your tasks with due dates to your Google Calendar">
          <button
            onClick={handleGoogleCalendarSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/20 transition-colors min-h-[44px] disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
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