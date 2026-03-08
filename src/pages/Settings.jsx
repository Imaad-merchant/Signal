import React, { useState } from "react";
import { Check, ArrowLeft, Trash2, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";



const WEEK_STARTS = ["Sunday", "Monday"];

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-gray-900" : "bg-gray-200"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
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
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Customize your Pulse experience</p>
        </div>
      </div>

      {/* Calendar */}
      <Section title="Calendar">
        <Row label="Week Starts On" description="First day of the week in calendar views">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {WEEK_STARTS.map((w) => (
              <button
                key={w}
                onClick={() => setWeekStart(w)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  weekStart === w ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Version</span>
          <span className="text-gray-400">1.0.0</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">App</span>
          <span className="text-gray-400 font-semibold">Pulse</span>
        </div>
      </Section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            saved ? "bg-emerald-500 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
          }`}
        >
          {saved && <Check className="h-4 w-4" />}
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}