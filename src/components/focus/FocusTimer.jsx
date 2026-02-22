import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const PRESETS = [
  { label: "25m", minutes: 25 },
  { label: "45m", minutes: 45 },
  { label: "60m", minutes: 60 },
  { label: "90m", minutes: 90 },
];

export default function FocusTimer({ task, onComplete, onCancel }) {
  const [duration, setDuration] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isStarted) {
      setSecondsLeft(duration * 60);
    }
  }, [duration, isStarted]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setIsRunning(false);
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const handleComplete = useCallback(async () => {
    const actualMinutes = duration - Math.floor(secondsLeft / 60);
    await base44.entities.FocusSession.create({
      task_id: task?.id || "",
      task_title: task?.title || "Free focus",
      duration_minutes: actualMinutes > 0 ? actualMinutes : duration,
      session_type: "focus",
      completed: true,
    });
    onComplete();
  }, [task, duration, secondsLeft, onComplete]);

  const handleFinishEarly = async () => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    const elapsed = duration * 60 - secondsLeft;
    const actualMinutes = Math.max(1, Math.round(elapsed / 60));
    await base44.entities.FocusSession.create({
      task_id: task?.id || "",
      task_title: task?.title || "Free focus",
      duration_minutes: actualMinutes,
      session_type: "focus",
      completed: true,
    });
    onComplete();
  };

  const toggleTimer = () => {
    if (!isStarted) setIsStarted(true);
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    setIsStarted(false);
    setSecondsLeft(duration * 60);
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = isStarted ? 1 - secondsLeft / (duration * 60) : 0;
  const circumference = 2 * Math.PI * 120;

  return (
    <div className="flex flex-col items-center">
      {task && (
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-600">Focusing on</p>
          <p className="text-sm font-semibold text-gray-800 mt-1">{task.title}</p>
        </div>
      )}

      {/* Timer Circle */}
      <div className="relative w-64 h-64 mb-8">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 256 256">
          <circle cx="128" cy="128" r="120" fill="none" stroke="#f3f4f6" strokeWidth="6" />
          <motion.circle
            cx="128"
            cy="128"
            r="120"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            initial={false}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ duration: 0.5 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-light text-gray-900 tabular-nums tracking-tight">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
          <span className="text-xs text-gray-400 mt-1">
            {isRunning ? "Focusing..." : isStarted ? "Paused" : "Ready"}
          </span>
        </div>
      </div>

      {/* Presets */}
      {!isStarted && (
        <div className="flex gap-2 mb-6">
          {PRESETS.map((p) => (
            <button
              key={p.minutes}
              onClick={() => setDuration(p.minutes)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                duration === p.minutes
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {isStarted && (
          <Button variant="outline" size="icon" onClick={resetTimer} className="rounded-full h-10 w-10">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Button
          onClick={toggleTimer}
          className="rounded-full h-14 w-14 bg-gray-900 hover:bg-gray-800 shadow-lg"
        >
          {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>
        {isStarted && (
          <Button variant="outline" size="icon" onClick={handleFinishEarly} className="rounded-full h-10 w-10">
            <CheckCircle className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isStarted && (
        <button onClick={onCancel} className="mt-4 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Cancel session
        </button>
      )}
    </div>
  );
}