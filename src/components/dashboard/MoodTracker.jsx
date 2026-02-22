import React, { useState } from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

const moods = [
  { value: "great", emoji: "🔥", label: "Great" },
  { value: "good", emoji: "😊", label: "Good" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "low", emoji: "😔", label: "Low" },
  { value: "bad", emoji: "😩", label: "Bad" },
];

const energyLevels = [
  { value: "high", label: "High", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "medium", label: "Medium", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "low", label: "Low", color: "bg-rose-100 text-rose-700 border-rose-200" },
];

export default function MoodTracker({ todayLog, onSave }) {
  const [mood, setMood] = useState(todayLog?.mood || "good");
  const [energy, setEnergy] = useState(todayLog?.energy_level || "medium");
  const [score, setScore] = useState(todayLog?.productivity_score || 5);
  const [notes, setNotes] = useState(todayLog?.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const data = {
      date: today,
      mood,
      energy_level: energy,
      productivity_score: score,
      notes,
      tasks_completed: todayLog?.tasks_completed || 0,
      focus_minutes: todayLog?.focus_minutes || 0,
    };

    if (todayLog?.id) {
      await base44.entities.DailyLog.update(todayLog.id, data);
    } else {
      await base44.entities.DailyLog.create(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-900">Daily Check-in</h3>
      </div>

      <div className="space-y-5">
        {/* Mood */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2.5">How are you feeling?</p>
          <div className="flex gap-2">
            {moods.map((m) => (
              <motion.button
                key={m.value}
                whileTap={{ scale: 0.9 }}
                onClick={() => setMood(m.value)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all ${
                  mood === m.value
                    ? "border-amber-300 bg-amber-50 shadow-sm"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <span className="text-lg">{m.emoji}</span>
                <span className="text-[10px] font-medium text-gray-500">{m.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Energy */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2.5">Energy Level</p>
          <div className="flex gap-2">
            {energyLevels.map((e) => (
              <button
                key={e.value}
                onClick={() => setEnergy(e.value)}
                className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-all ${
                  energy === e.value ? e.color : "border-gray-100 text-gray-400 hover:border-gray-200"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Productivity Score */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-medium text-gray-500">Productivity Score</p>
            <span className="text-sm font-bold text-amber-600">{score}/10</span>
          </div>
          <Slider
            value={[score]}
            onValueChange={(v) => setScore(v[0])}
            min={1}
            max={10}
            step={1}
            className="py-1"
          />
        </div>

        {/* Notes */}
        <Textarea
          placeholder="Quick notes about your day..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="resize-none h-16 text-sm border-gray-100 focus:border-amber-300 focus:ring-amber-200"
        />

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-10"
        >
          {saving ? "Saving..." : todayLog?.id ? "Update Check-in" : "Save Check-in"}
        </Button>
      </div>
    </div>
  );
}