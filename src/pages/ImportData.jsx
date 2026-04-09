import React, { useState } from "react";
import { auth, db } from "@/api/firebase";
import { collection, addDoc } from "firebase/firestore";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";

// Parse ICS file into task objects
function parseICS(text) {
  const events = [];
  const blocks = text.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const get = (key) => {
      const match = block.match(new RegExp(`${key}[^:]*:(.+)`));
      return match ? match[1].trim() : "";
    };
    const title = get("SUMMARY");
    const description = get("DESCRIPTION");
    const dateStr = get("DTSTART");
    // Convert YYYYMMDD to YYYY-MM-DD
    const due_date = dateStr.length >= 8
      ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      : "";

    if (title) {
      events.push({
        title,
        description: description || "",
        due_date,
        status: "todo",
        priority: "medium",
        category: "work",
        estimated_minutes: null,
      });
    }
  }
  return events;
}

export default function ImportData() {
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  const handleImport = async () => {
    const user = auth.currentUser;
    if (!user) { setError("Please sign in first"); return; }

    try {
      // Fetch the ICS file from the known path or use hardcoded data
      const response = await fetch("/pulse-calendar.ics");
      if (!response.ok) {
        setError("Could not load ICS file. Make sure it's in the public folder.");
        return;
      }
      const text = await response.text();
      const tasks = parseICS(text);

      setImporting(true);
      setError("");

      let imported = 0;
      for (const task of tasks) {
        await addDoc(collection(db, "tasks"), {
          ...task,
          userId: user.uid,
          created_by: user.email,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        });
        imported++;
        setCount(imported);
      }

      setDone(true);
      setImporting(false);
    } catch (err) {
      setError(err.message);
      setImporting(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const user = auth.currentUser;
    if (!user) { setError("Please sign in first"); return; }

    const text = await file.text();
    const tasks = parseICS(text);

    setImporting(true);
    setError("");

    let imported = 0;
    for (const task of tasks) {
      await addDoc(collection(db, "tasks"), {
        ...task,
        userId: user.uid,
        created_by: user.email,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });
      imported++;
      setCount(imported);
    }

    setDone(true);
    setImporting(false);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#1e1f20] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
          <h2 className="text-2xl font-bold text-white">Import Complete!</h2>
          <p className="text-gray-400">{count} tasks imported successfully</p>
          <button
            onClick={() => window.location.href = "/"}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1f20] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <h2 className="text-2xl font-bold text-white">Import Your Data</h2>
        <p className="text-gray-400 text-sm">Upload your Base44 calendar export (.ics file) to import all your tasks</p>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {importing ? (
          <div className="space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-400 mx-auto" />
            <p className="text-gray-300">Importing... {count} tasks</p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-white/10 rounded-2xl hover:border-blue-500/30 cursor-pointer transition-colors">
              <Upload className="h-10 w-10 text-gray-500" />
              <span className="text-sm text-gray-400">Click to upload .ics file</span>
              <input type="file" accept=".ics" className="hidden" onChange={handleFile} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
