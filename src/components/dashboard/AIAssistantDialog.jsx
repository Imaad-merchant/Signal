import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Image, X, Loader2, User, Bot, Square, Undo2, Redo2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";

// --- Deletion parsing (handled in the client, with confirmation, because the AI
// backend once wiped the whole calendar via an unconfirmed "delete_all"). ---
const norm = (s) => (s || "").trim().toLowerCase();

function findDuplicateTasks(tasks) {
  const seen = new Set();
  const dups = [];
  for (const t of tasks || []) {
    const k = `${norm(t.title)}|${t.due_date || ""}`;
    if (seen.has(k)) dups.push(t); else seen.add(k);
  }
  return dups;
}

// Tasks belonging to a named group (category key/label, or the term in the title).
function tasksInGroup(tasks, term) {
  const q = norm(term);
  if (q.length < 2) return [];
  return (tasks || []).filter((t) => {
    const c = norm(t.category);
    const ti = norm(t.title);
    return (c && (c.includes(q) || (q.includes(c) && c.length > 1))) || ti.includes(q);
  });
}

// If `text` is a deletion command, return { tasks, label, all } to delete; else null.
// Requires an explicit object (events/tasks/…) or "all/everything/duplicate" so it
// doesn't hijack phrases like "clear up my week".
const GENERIC_OBJ = new Set(["", "everything", "them", "it", "calendar", "schedule", "whole", "stuff", "things"]);
function parseDeletion(text, tasks) {
  const s = norm(text);
  const hasVerb = /\b(delete|remove|get rid of|wipe)\b/.test(s) || /\bclear\s+(all|my|the|every)/.test(s);
  if (!hasVerb) return null;
  if (/duplicate/.test(s)) return { tasks: findDuplicateTasks(tasks), label: "duplicate events" };

  // Extract the group being deleted: "delete [all|my|the|every] <term> events/tasks/…".
  // A specific term scopes it; a generic/empty one (or a bare "everything") = the lot.
  const m = /\b(?:delete|remove|clear|get rid of|wipe)\s+(?:(?:all|my|the|every)\s+)*([a-z0-9][a-z0-9 ]*?)?\s*(events?|tasks?|classes?|assignments?|homework|hw|calendar|schedule|everything|them|it)\b/.exec(s);
  if (m) {
    const term = (m[1] || "").replace(/\b(all|my|the|every|of)\b/g, "").trim();
    if (term && !GENERIC_OBJ.has(term)) {
      return { tasks: tasksInGroup(tasks, term), label: `"${term}" events` };
    }
    return { tasks: (tasks || []).slice(), label: "all your events", all: true };
  }
  // "delete everything / wipe it all" with no object noun.
  if (/\b(everything|all of (them|it)|whole calendar)\b/.test(s)) {
    return { tasks: (tasks || []).slice(), label: "all your events", all: true };
  }
  return null;
}

export default function AIAssistantDialog({ open, onOpenChange, onUpdated, categories = [] }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I'm your calendar AI assistant. Tell me what you'd like to do — create tasks, reschedule things, reorganize your week, or upload a picture of a schedule and I'll handle it for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState([]); // { file, preview, url }
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false); // undo/redo/delete in flight
  const [pendingDelete, setPendingDelete] = useState(null); // { tasks, label } awaiting confirm
  const [, forceUpdate] = useState(0);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleImagePick = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachedImages((prev) => [...prev, { file, preview: ev.target.result, url: null }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeImage = (idx) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleStop = () => {
    abortRef.current = true;
    setLoading(false);
    setMessages((prev) => [...prev, { role: "assistant", content: "Stopped." }]);
  };

  const handleSend = async () => {
    if (!input.trim() && attachedImages.length === 0) return;

    // SAFETY: if this is a deletion command, resolve it to a concrete task list HERE
    // and require confirmation — never hand a bulk delete to the AI, which once wiped
    // the whole calendar. Only intercept when there are no images to analyze.
    if (input.trim() && attachedImages.length === 0) {
      let currentTasks = [];
      try {
        const user = await base44.auth.me();
        currentTasks = await base44.entities.Task.filter({ created_by: user.email }, "-due_date");
      } catch { /* ignore */ }
      const del = parseDeletion(input, currentTasks);
      if (del) {
        const userText = input;
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: userText }]);
        if (!del.tasks.length) {
          const none = del.label.startsWith("duplicate")
            ? "Good news — I don't see any duplicates to remove."
            : `I don't see any ${del.label} to delete.`;
          setMessages((prev) => [...prev, { role: "assistant", content: none }]);
          return;
        }
        setPendingDelete(del);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `⚠️ That would delete **${del.tasks.length} ${del.label}**. This can't be un-asked — confirm below.`,
        }]);
        return;
      }
    }

    abortRef.current = false;
    setLoading(true);

    // Use base64 previews directly — no upload needed
    const uploadedUrls = attachedImages.map((i) => i.preview);

    const userMsg = {
      role: "user",
      content: input,
      images: attachedImages.map((i) => i.preview),
      imageUrls: uploadedUrls,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setAttachedImages([]);

    // Fetch tasks and categories in parallel
    const conversationHistory = newMessages.slice(1).map(m => ({
      role: m.role,
      content: m.content,
      imageUrls: m.imageUrls || [],
    }));

    let currentTasks = [];
    try {
      const user = await base44.auth.me();
      currentTasks = await base44.entities.Task.filter({ created_by: user.email }, "-due_date");
    } catch (_) {}

    let response;
    try {
      response = await base44.functions.invoke('aiAssistant', {
        messages: conversationHistory,
        tasks: currentTasks,
        imageUrls: uploadedUrls,
        categories,
      });
    } catch (err) {
      if (!abortRef.current) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
      }
      setLoading(false);
      return;
    }

    if (abortRef.current) return;

    const result = response.data;
    const reply = result?.reply || "Done!";
    const actions = result?.actions || [];

    // Execute actions in parallel for speed
    let actionCount = 0;

    if (actions.length > 0) {
      // Snapshot current tasks for undo
      const user = await base44.auth.me();
      const snapshotTasks = await base44.entities.Task.filter({ created_by: user.email });

      // SAFETY NET: never execute a mass delete the AI proposes without confirmation.
      // delete_all → the whole calendar; many individual deletes → likely a mistake.
      const wantsDeleteAll = actions.some(a => a.action === "delete_all");
      const deleteIds = actions.filter(a => a.action === "delete" && a.id).map(a => a.id);
      if (wantsDeleteAll || deleteIds.length > 3) {
        const doomed = wantsDeleteAll ? snapshotTasks.slice() : snapshotTasks.filter(t => deleteIds.includes(t.id));
        setPendingDelete({ tasks: doomed, label: wantsDeleteAll ? "all your events" : "events", all: wantsDeleteAll });
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ That would delete **${doomed.length} ${wantsDeleteAll ? "— your whole calendar" : "events"}**. Confirm below if that's really what you want.` }]);
        setLoading(false);
        return;
      }

      // Normal (non-bulk-delete) actions — mass deletes were already intercepted above.
      {
        // Process categories and folders first (sequentially), then tasks in parallel
        const catActions = actions.filter(a => a.action === "create_category");
        const folderActions = actions.filter(a => a.action === "create_folder");
        const taskActions = actions.filter(a => !["create_category", "create_folder"].includes(a.action));

        // Create categories first
        for (const act of catActions) {
          try {
            if (act.label && act.color && act.key) {
              await base44.entities.Category.create({ label: act.label, color: act.color, key: act.key });
              actionCount++;
            }
          } catch (_) {}
        }

        // Create folders (stored in localStorage)
        if (folderActions.length > 0) {
          try {
            const existing = JSON.parse(localStorage.getItem("pulse_category_folders") || "[]");
            const enabledFolders = JSON.parse(localStorage.getItem("pulse_enabled_folders") || "{}");
            for (const act of folderActions) {
              if (act.name) {
                existing.push({ name: act.name, categoryKeys: act.categoryKeys || [] });
                enabledFolders[existing.length - 1] = true;
                actionCount++;
              }
            }
            localStorage.setItem("pulse_category_folders", JSON.stringify(existing));
            localStorage.setItem("pulse_enabled_folders", JSON.stringify(enabledFolders));
          } catch (_) {}
        }

        // Create/update/delete tasks in parallel
        const taskPromises = taskActions.map(async (act) => {
          try {
            if (act.action === "create") {
              const { action, ...data } = act;
              await base44.entities.Task.create({ status: "todo", priority: "medium", ...data });
              actionCount++;
            } else if (act.action === "update" && act.id) {
              await base44.entities.Task.update(act.id, act.fields || {});
              actionCount++;
            } else if (act.action === "delete" && act.id) {
              await base44.entities.Task.delete(act.id);
              actionCount++;
            }
          } catch (_) {}
        });
        await Promise.all(taskPromises);
      }

      if (actionCount > 0) {
        // Save snapshot for undo, clear redo stack
        undoStackRef.current = [...undoStackRef.current, snapshotTasks];
        redoStackRef.current = [];
        forceUpdate(n => n + 1);
      }
    }

    if (actionCount > 0) onUpdated();

    setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    setLoading(false);
  };

  // Execute a confirmed deletion: snapshot first (so Undo restores everything), then
  // delete just the staged tasks.
  const confirmDelete = async () => {
    const del = pendingDelete;
    if (!del || busy) return;
    setBusy(true);
    setPendingDelete(null);
    try {
      const user = await base44.auth.me();
      const snapshotTasks = await base44.entities.Task.filter({ created_by: user.email });
      await Promise.all(del.tasks.map((t) => base44.entities.Task.delete(t.id).catch(() => {})));
      undoStackRef.current = [...undoStackRef.current, snapshotTasks];
      redoStackRef.current = [];
      onUpdated();
      setMessages((prev) => [...prev, { role: "assistant", content: `Deleted ${del.tasks.length} ${del.label}. Hit Undo (top-right) to bring them back.` }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "That delete didn't go through — try again." }]);
    }
    setBusy(false);
  };
  const cancelDelete = () => {
    setPendingDelete(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Okay — I've left everything where it is." }]);
  };

  const handleUndo = async () => {
    if (undoStackRef.current.length === 0 || busy) return;
    setBusy(true);
    try { await doUndo(); } finally { setBusy(false); }
  };
  const doUndo = async () => {
    if (undoStackRef.current.length === 0) return;
    const user = await base44.auth.me();
    const currentTasks = await base44.entities.Task.filter({ created_by: user.email });
    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];

    await Promise.all(currentTasks.map(t => base44.entities.Task.delete(t.id)));
    await Promise.all(snapshot.map(({ id, created_date, updated_date, created_by, ...data }) =>
      base44.entities.Task.create(data)
    ));

    redoStackRef.current = [...redoStackRef.current, currentTasks];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    forceUpdate(n => n + 1);
    onUpdated();
    setMessages(prev => [...prev, { role: "assistant", content: "↩️ Undone!" }]);
  };

  const handleRedo = async () => {
    if (redoStackRef.current.length === 0 || busy) return;
    setBusy(true);
    try { await doRedo(); } finally { setBusy(false); }
  };
  const doRedo = async () => {
    if (redoStackRef.current.length === 0) return;
    const user = await base44.auth.me();
    const currentTasks = await base44.entities.Task.filter({ created_by: user.email });
    const snapshot = redoStackRef.current[redoStackRef.current.length - 1];

    await Promise.all(currentTasks.map(t => base44.entities.Task.delete(t.id)));
    await Promise.all(snapshot.map(({ id, created_date, updated_date, created_by, ...data }) =>
      base44.entities.Task.create(data)
    ));

    undoStackRef.current = [...undoStackRef.current, currentTasks];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    forceUpdate(n => n + 1);
    onUpdated();
    setMessages(prev => [...prev, { role: "assistant", content: "↪️ Redone!" }]);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[85vh] flex flex-col p-0 gap-0 bg-[#1e1f20] border-white/10">
        <DialogHeader className="px-4 py-3 border-b border-white/10 flex-shrink-0">
          <DialogTitle className="flex items-center justify-between text-sm font-semibold text-gray-200 pr-9">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-400" />
              AI Calendar Assistant
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleUndo}
                disabled={undoStackRef.current.length === 0 || busy}
                title="Undo last action"
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStackRef.current.length === 0 || busy}
                title="Redo last action"
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Redo2 className="h-4 w-4" />}
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-blue-400" />
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                {msg.images?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1 justify-end">
                    {msg.images.map((src, j) => (
                      <img key={j} src={src} className="h-16 w-16 rounded-lg object-cover" alt="" />
                    ))}
                  </div>
                )}
                {msg.content && (
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-[#2d2e30] text-gray-200 border border-white/10"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2.5 justify-start">
              <div className="h-7 w-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-blue-400" />
              </div>
              <div className="bg-[#2d2e30] border border-white/10 rounded-2xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Deletion confirmation bar — nothing bulk deletes without this. */}
        {pendingDelete && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 flex-shrink-0">
            <span className="flex-1 text-xs text-rose-100">Delete {pendingDelete.tasks.length} {pendingDelete.label}?</span>
            <button type="button" onClick={confirmDelete} disabled={busy} className="rounded-lg bg-rose-500/80 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50">
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" onClick={cancelDelete} disabled={busy} className="rounded-lg bg-white/10 px-3 py-1 text-[11px] font-medium text-gray-200 hover:bg-white/20 disabled:opacity-50">Keep</button>
          </div>
        )}

        {/* Image previews */}
        {attachedImages.length > 0 && (
          <div className="px-4 py-2 flex gap-2 flex-wrap border-t border-white/10">
            {attachedImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.preview} className="h-14 w-14 rounded-lg object-cover" alt="" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <X className="h-2.5 w-2.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl bg-[#2d2e30] hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
              title="Attach image"
            >
              <Image className="h-4 w-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to create tasks, reschedule, reorganize…"
              rows={1}
              className="flex-1 bg-[#2d2e30] border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500/50 min-h-[38px] max-h-[120px]"
              style={{ height: "auto" }}
              onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
            />
            {loading ? (
              <Button
                onClick={handleStop}
                className="bg-red-600 hover:bg-red-500 rounded-xl px-3 h-9 flex-shrink-0"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim() && attachedImages.length === 0}
                className="bg-blue-600 hover:bg-blue-500 rounded-xl px-3 h-9 flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}