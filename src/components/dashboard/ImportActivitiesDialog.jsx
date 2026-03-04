import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileImage, CheckCircle2, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ImportActivitiesDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | extracting | creating | done | error
  const [extracted, setExtracted] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef();

  const handleFile = (f) => {
    setFile(f);
    setExtracted([]);
    setStatus("idle");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setStatus("uploading");
    setErrorMsg("");

    // Upload file
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    setStatus("extracting");

    // Use AI to extract tasks with dates
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Look at this image/file which contains a list of activities or tasks with dates. 
Extract all activities/tasks and their associated dates. 
For each item, determine: title, due_date (in YYYY-MM-DD format), and if possible a category (work, personal, health, learning, or creative).
If a year is not specified, use the current year ${new Date().getFullYear()}.
Return only items that have a clear date associated.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                due_date: { type: "string" },
                category: { type: "string" },
                description: { type: "string" }
              }
            }
          }
        }
      }
    });

    const tasks = result?.tasks || [];
    setExtracted(tasks);

    if (tasks.length === 0) {
      setStatus("error");
      setErrorMsg("No tasks with dates found. Try a clearer image or list.");
      return;
    }

    setStatus("creating");

    // Bulk create tasks
    await base44.entities.Task.bulkCreate(
      tasks.map((t) => ({
        title: t.title,
        due_date: t.due_date,
        category: ["work", "personal", "health", "learning", "creative"].includes(t.category)
          ? t.category
          : "work",
        description: t.description || "",
        status: "todo",
        priority: "medium",
      }))
    );

    setStatus("done");
    onImported();
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setStatus("idle");
    setExtracted([]);
    setErrorMsg("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Import Activities</DialogTitle>
        </DialogHeader>

        {status === "done" ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-gray-900">{extracted.length} tasks added!</p>
            <p className="text-xs text-gray-400">They're now on your calendar.</p>
            <Button onClick={handleClose} className="mt-2 bg-gray-900 hover:bg-gray-800 rounded-xl">Done</Button>
          </div>
        ) : (
          <div className="space-y-4 mt-1">
            {/* Drop zone */}
            {!file ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <FileImage className="h-6 w-6 text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Drop your file here</p>
                  <p className="text-xs text-gray-400 mt-0.5">or click to browse · images, PDF, CSV</p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,.pdf,.csv,.xlsx,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
                {preview ? (
                  <img src={preview} alt="preview" className="h-16 w-16 object-cover rounded-xl" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-gray-200 flex items-center justify-center">
                    <FileImage className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                {status === "idle" && (
                  <button onClick={() => { setFile(null); setPreview(null); }} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Status messages */}
            {status === "uploading" && <StatusLine text="Uploading file..." />}
            {status === "extracting" && <StatusLine text="Reading activities & dates with AI..." />}
            {status === "creating" && <StatusLine text={`Adding ${extracted.length} tasks to calendar...`} />}
            {status === "error" && (
              <p className="text-xs text-rose-500 text-center">{errorMsg}</p>
            )}

            {/* Extracted preview */}
            {extracted.length > 0 && status === "creating" && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 max-h-40 overflow-y-auto space-y-1">
                {extracted.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-gray-400 shrink-0">{t.due_date}</span>
                    <span className="truncate">{t.title}</span>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={!file || status !== "idle"}
              className="w-full bg-gray-900 hover:bg-gray-800 rounded-xl h-10 gap-2"
            >
              {status !== "idle" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {status === "idle" ? "Import to Calendar" : "Processing..."}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ text }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
      {text}
    </div>
  );
}