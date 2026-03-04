import React, { useState } from "react";
import { Check } from "lucide-react";



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

function ColorPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all text-sm"
      >
        <span className="h-5 w-5 rounded-full border border-gray-200 shrink-0" style={{ backgroundColor: selected }} />
        <span className="font-mono text-xs text-gray-600">{selected}</span>
        <svg className="h-3.5 w-3.5 text-gray-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-64">
          {/* Native color wheel */}
          <div className="flex items-center gap-3 mb-3">
            <input
              type="color"
              value={selected}
              onChange={e => onChange(e.target.value)}
              className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200"
            />
            <input
              type="text"
              value={selected}
              onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
              className="text-xs font-mono border border-gray-200 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
              placeholder="#000000"
            />
          </div>
          {/* Quick presets */}
          <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Quick picks</p>
          <div className="flex flex-wrap gap-1.5">
            {["#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6","#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899","#f43f5e","#64748b","#374151","#111827","#ffffff"].map(hex => (
              <button
                key={hex}
                onClick={() => { onChange(hex); setOpen(false); }}
                style={{ backgroundColor: hex }}
                className={`h-6 w-6 rounded-full transition-all hover:scale-110 flex items-center justify-center ring-offset-1 ${selected === hex ? "ring-2 ring-gray-700" : ""}`}
              >
                {selected === hex && <Check className="h-3 w-3 text-white" />}
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(false)} className="mt-3 w-full text-xs text-gray-500 hover:text-gray-800 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Done</button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [primaryColor, setPrimaryColor] = useState(() => localStorage.getItem("pulse_primary") || "#f59e0b");
  const [secondaryColor, setSecondaryColor] = useState(() => localStorage.getItem("pulse_secondary") || "#3b82f6");
  const [weekStart, setWeekStart] = useState(() => localStorage.getItem("pulse_week_start") || "Sunday");
  const [notifications, setNotifications] = useState(() => localStorage.getItem("pulse_notifications") !== "false");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem("pulse_primary", primaryColor);
    localStorage.setItem("pulse_secondary", secondaryColor);
    localStorage.setItem("pulse_week_start", weekStart);
    localStorage.setItem("pulse_notifications", notifications);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Customize your Pulse experience</p>
      </div>

      {/* Appearance */}
      <Section title="Appearance">
        {/* Preview */}
        <div className="flex gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
            <span className="text-white text-xs font-bold">P</span>
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 rounded-full w-3/4" style={{ backgroundColor: primaryColor, opacity: 0.8 }} />
            <div className="h-2 rounded-full w-1/2" style={{ backgroundColor: secondaryColor, opacity: 0.6 }} />
            <div className="h-2 rounded-full w-2/3 bg-gray-200" />
          </div>
          <div className="h-8 w-16 rounded-lg" style={{ backgroundColor: secondaryColor, opacity: 0.9 }} />
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Primary Color</p>
            <p className="text-xs text-gray-400 mt-0.5">Main accent — buttons, highlights, active states</p>
            <ColorPicker selected={primaryColor} onChange={setPrimaryColor} />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-800">Secondary Color</p>
            <p className="text-xs text-gray-400 mt-0.5">Supporting color — badges, tags, secondary elements</p>
            <ColorPicker selected={secondaryColor} onChange={setSecondaryColor} />
          </div>
        </div>
      </Section>

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