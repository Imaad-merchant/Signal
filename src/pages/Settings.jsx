import React, { useState, useEffect } from "react";
import { Palette, Bell, User, Moon, Sun, Monitor, Check } from "lucide-react";

const ACCENT_COLORS = [
  { name: "Amber", value: "amber", bg: "bg-amber-500", ring: "ring-amber-500" },
  { name: "Blue", value: "blue", bg: "bg-blue-500", ring: "ring-blue-500" },
  { name: "Violet", value: "violet", bg: "bg-violet-500", ring: "ring-violet-500" },
  { name: "Rose", value: "rose", bg: "bg-rose-500", ring: "ring-rose-500" },
  { name: "Emerald", value: "emerald", bg: "bg-emerald-500", ring: "ring-emerald-500" },
  { name: "Sky", value: "sky", bg: "bg-sky-500", ring: "ring-sky-500" },
];

const THEMES = [
  { name: "Light", value: "light", icon: Sun },
  { name: "Dark", value: "dark", icon: Moon },
  { name: "System", value: "system", icon: Monitor },
];

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
    <div className="flex items-center justify-between gap-4">
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
  const [accent, setAccent] = useState(() => localStorage.getItem("pulse_accent") || "amber");
  const [theme, setTheme] = useState(() => localStorage.getItem("pulse_theme") || "light");
  const [weekStart, setWeekStart] = useState(() => localStorage.getItem("pulse_week_start") || "Sunday");
  const [notifications, setNotifications] = useState(() => localStorage.getItem("pulse_notifications") !== "false");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem("pulse_accent", accent);
    localStorage.setItem("pulse_theme", theme);
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
        {/* Theme */}
        <Row label="Theme" description="Choose your preferred color scheme">
          <div className="flex gap-2">
            {THEMES.map(({ name, value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  theme === value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {name}
              </button>
            ))}
          </div>
        </Row>

        {/* Accent color */}
        <Row label="Accent Color" description="Used for highlights and active states">
          <div className="flex gap-2">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setAccent(c.value)}
                title={c.name}
                className={`h-7 w-7 rounded-full ${c.bg} transition-all ring-offset-2 ${
                  accent === c.value ? `ring-2 ${c.ring}` : ""
                }`}
              >
                {accent === c.value && <Check className="h-3 w-3 text-white mx-auto" />}
              </button>
            ))}
          </div>
        </Row>
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