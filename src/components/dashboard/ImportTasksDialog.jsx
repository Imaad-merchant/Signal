import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileImage, CheckCircle2, Loader2, X, Pencil, ListTodo } from "lucide-react";
import { base44 } from "@/api/base44Client";

const COLORS = [
  "bg-blue-100 text-blue-700","bg-purple-100 text-purple-700","bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700","bg-pink-100 text-pink-700","bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700","bg-indigo-100 text-indigo-700",
];

const mapToAppCategory = (name) => {
  const n = name.toLowerCase();
  if (n.includes("work") || n.includes("job") || n.includes("office")) return "work";
  if (n.includes("health") || n.includes("doctor") || n.includes("medical") || n.includes("fitness") || n.includes("gym")) return "health";
  if (n.includes("learn") || n.includes("school") || n.includes("study") || n.includes("class") || n.includes("course")) return "learning";
  if (n.includes("creat") || n.includes("art") || n.includes("design")) return "creative";
  return "personal";
};

export default function ImportTasksDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("idle");
  const [extracted, setExtracted] = useState([]);
  const [categoryMap, setCategoryMap] = useState({});
  const [editingCat, setEditingCat] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef();
  const accentColor = localStorage.getItem("pulse_secondary") || "#f59e0b";

  const handleFile = (f) => {
    setFile(f); setExtracted([]); setCategoryMap({}); setStatus("idle");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else setPreview(null);
  };

  const handleExtract = async () => {
    if (!file) return;
    setStatus("uploading"); setErrorMsg("");
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setStatus("extracting");
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this file and extract a list of tasks or to-dos. 
For each task, determine a category (work, personal, health, learning, creative, etc.).
Include a due_date if one is mentioned, otherwise leave it empty.
Use year ${new Date().getFullYear()} if no year specified.`,
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
                due_date: { type: "string", description: "YYYY-MM-DD or empty" },
                suggested_category: { type: "string" },
                description: { type: "string" }
              }
            }
          }
        }
      }
    });
    const tasks = result?.tasks || [];
    if (tasks.length === 0) { setStatus("error"); setErrorMsg("No tasks found. Try a clearer file."); return; }
    const uniqueCats = [...new Set(tasks.map(t => t.suggested_category || "general"))];
    const map = {}; uniqueCats.forEach(c => { map[c] = c; });
    setCategoryMap(map); setExtracted(tasks); setStatus("review");
  };

  const startEditCat = (key) => { setEditingCat(key); setEditValue(categoryMap[key]); };
  const saveEditCat = () => {
    if (editValue.trim()) setCategoryMap(prev => ({ ...prev, [editingCat]: editValue.trim() }));
    setEditingCat(null);
  };

  const handleConfirm = async () => {
    setStatus("creating");
    await base44.entities.Task.bulkCreate(
      extracted.map(t => ({
        title: t.title,
        due_date: t.due_date || undefined,
        category: mapToAppCategory(categoryMap[t.suggested_category] || t.suggested_category || "work"),
        description: t.description || "",
        status: "todo",
        priority: "medium",
      }))
    );
    setStatus("done"); onImported();
  };

  const handleClose = () => {
    setFile(null); setPreview(null); setStatus("idle");
    setExtracted([]); setCategoryMap({}); setEditingCat(null); setErrorMsg("");
    onOpenChange(false);
  };

  const groupedTasks = extracted.reduce((acc, t) => {
    const key = t.suggested_category || "general";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t); return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ListTodo className="h-4 w-4" style={{ color: accentColor }} />
            Import Tasks
          </DialogTitle>
        </DialogHeader>

        {status === "done" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-gray-900">{extracted.length} tasks imported!</p>
            <Button onClick={handleClose} className="mt-2 bg-gray-900 hover:bg-gray-800 rounded-xl">Done</Button>
          </div>
        )}

        {["idle","uploading","extracting","error"].includes(status) && (
          <div className="space-y-4 mt-1">
            {!file ? (
              <div
                onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-gray-300 hover:bg-gray-50/50 transition-all"
                style={{ "--hover-border": accentColor }}
              >
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <FileImage className="h-6 w-6 text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Drop your task list here</p>
                  <p className="text-xs text-gray-400 mt-0.5">images, PDF, CSV, text files</p>
                </div>
                <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx,.txt" className="hidden"
                  onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
                {preview ? <img src={preview} alt="preview" className="h-16 w-16 object-cover rounded-xl" /> :
                  <div className="h-16 w-16 rounded-xl bg-gray-200 flex items-center justify-center"><FileImage className="h-6 w-6 text-gray-400" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                {status === "idle" && <button onClick={() => { setFile(null); setPreview(null); }} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400"><X className="h-4 w-4" /></button>}
              </div>
            )}
            {status === "uploading" && <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: accentColor }} />Uploading...</div>}
            {status === "extracting" && <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: accentColor }} />AI is reading tasks...</div>}
            {status === "error" && <p className="text-xs text-rose-500 text-center">{errorMsg}</p>}
            <Button onClick={handleExtract} disabled={!file || status !== "idle"} className="w-full bg-gray-900 hover:bg-gray-800 rounded-xl h-10 gap-2">
              {status !== "idle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {status === "idle" ? "Analyze File" : "Processing..."}
            </Button>
          </div>
        )}

        {status === "review" && (
          <div className="space-y-4 mt-1">
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold text-gray-700 mb-0.5">Found {extracted.length} tasks in {Object.keys(groupedTasks).length} categories</p>
              <p className="text-xs text-gray-500">Rename categories if needed, then confirm.</p>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {Object.entries(groupedTasks).map(([catKey, catTasks], idx) => {
                const color = COLORS[idx % COLORS.length];
                const displayName = categoryMap[catKey] || catKey;
                const isEditing = editingCat === catKey;
                return (
                  <div key={catKey} className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className={`flex items-center gap-2 px-3 py-2 ${color.split(" ")[0]} border-b border-black/5`}>
                      {isEditing ? (
                        <Input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveEditCat} onKeyDown={(e) => e.key === "Enter" && saveEditCat()} autoFocus
                          className="h-6 text-xs font-semibold border-0 bg-transparent px-0 focus-visible:ring-0 shadow-none" />
                      ) : (
                        <><span className={`text-xs font-semibold flex-1 ${color.split(" ")[1]}`}>{displayName}</span>
                          <button onClick={() => startEditCat(catKey)} className="opacity-60 hover:opacity-100 transition-opacity">
                            <Pencil className={`h-3 w-3 ${color.split(" ")[1]}`} />
                          </button></>
                      )}
                      <span className="text-[10px] opacity-60 ml-1">{catTasks.length} tasks</span>
                    </div>
                    <div className="divide-y divide-gray-50 bg-white">
                      {catTasks.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2">
                          {t.due_date && <span className="text-[10px] text-gray-400 shrink-0 w-16">{t.due_date}</span>}
                          <span className="text-xs text-gray-700 truncate">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStatus("idle")} className="flex-1 rounded-xl h-10">Back</Button>
              <Button onClick={handleConfirm} className="flex-1 bg-gray-900 hover:bg-gray-800 rounded-xl h-10 gap-2">
                <CheckCircle2 className="h-4 w-4" /> Import Tasks
              </Button>
            </div>
          </div>
        )}

        {status === "creating" && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accentColor }} />
            <p className="text-sm text-gray-600">Importing {extracted.length} tasks...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}