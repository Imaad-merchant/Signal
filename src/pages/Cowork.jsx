import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Image, X, Loader2, User, Bot, Square, ArrowLeft, FolderPlus, CheckCircle2, ExternalLink, ChevronRight, ChevronDown, Globe, FileText, FolderOpen, ListChecks, PanelRightOpen, PanelRightClose, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// ─── Project Sidebar ───────────────────────────────────────────────

function ProjectSidebar({ open }) {
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", user?.email],
    queryFn: () => base44.entities.Task.filter({ created_by: user.email }, "-created_date"),
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.email],
    queryFn: () => base44.entities.Category.list(),
    enabled: !!user,
  });

  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [contextOpen, setContextOpen] = useState(true);

  useEffect(() => {
    try {
      const s = localStorage.getItem("pulse_category_folders");
      setFolders(s ? JSON.parse(s) : []);
    } catch {}
  }, [tasks]);

  const doneTasks = tasks.filter(t => t.status === "done").length;
  const totalTasks = tasks.length;

  const toggleFolder = (idx) => {
    setExpandedFolders(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getTasksForCategory = (catKey) => tasks.filter(t => t.category === catKey && t.status !== "done");

  const folderedCatKeys = new Set(folders.flatMap(f => f.categoryKeys || []));
  const unfolderedCategories = categories.filter(c => !folderedCatKeys.has(c.key));

  if (!open) return null;

  return (
    <div className="w-72 border-l border-white/[0.06] bg-[#18191a] flex flex-col shrink-0 overflow-hidden">
      {/* Progress */}
      <div className="px-4 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Progress</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-500">{doneTasks} of {totalTasks}</span>
            <ChevronRight className="h-3 w-3 text-gray-600" />
          </div>
        </div>
        {totalTasks > 0 && (
          <div className="mt-2.5 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
          </div>
        )}
      </div>

      {/* Project */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold text-gray-200">Signal Calendar</span>
            <div className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-gray-600" />
              <ChevronDown className="h-3 w-3 text-gray-600" />
            </div>
          </div>

          <div className="space-y-0.5">
            {folders.map((folder, idx) => {
              const expanded = expandedFolders[idx];
              const folderCats = categories.filter(c => (folder.categoryKeys || []).includes(c.key));
              const folderTaskCount = folderCats.reduce((sum, c) => sum + getTasksForCategory(c.key).length, 0);

              return (
                <div key={idx}>
                  <button onClick={() => toggleFolder(idx)} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors">
                    {expanded ? <ChevronDown className="h-3 w-3 text-gray-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-600 shrink-0" />}
                    <FolderOpen className="h-3.5 w-3.5 text-amber-500/70 shrink-0" />
                    <span className="text-[11px] text-gray-400 truncate flex-1 text-left">{folder.name}</span>
                    {folderTaskCount > 0 && <span className="text-[10px] text-gray-600">{folderTaskCount}</span>}
                  </button>
                  {expanded && (
                    <div className="ml-5 mt-0.5 space-y-0.5">
                      {folderCats.map(cat => {
                        const catTasks = getTasksForCategory(cat.key);
                        return (
                          <div key={cat.key}>
                            <div className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/[0.03]">
                              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className="text-[11px] text-gray-500 truncate flex-1">{cat.label}</span>
                              <span className="text-[10px] text-gray-700">{catTasks.length}</span>
                            </div>
                            {catTasks.slice(0, 3).map(task => (
                              <div key={task.id} className="flex items-center gap-2 px-2 py-0.5 ml-4">
                                <ListChecks className="h-2.5 w-2.5 text-gray-700 shrink-0" />
                                <span className="text-[10px] text-gray-600 truncate">{task.title}</span>
                              </div>
                            ))}
                            {catTasks.length > 3 && <div className="px-2 py-0.5 ml-4"><span className="text-[10px] text-gray-700">+{catTasks.length - 3} more</span></div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {unfolderedCategories.map(cat => {
              const catTasks = getTasksForCategory(cat.key);
              return (
                <div key={cat.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04]">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-[11px] text-gray-400 truncate flex-1">{cat.label}</span>
                  {catTasks.length > 0 && <span className="text-[10px] text-gray-600">{catTasks.length}</span>}
                </div>
              );
            })}

            {categories.length === 0 && (
              <p className="text-[11px] text-gray-700 px-2 py-3">No categories yet. Start a conversation to create projects.</p>
            )}
          </div>
        </div>

        {/* Context */}
        <div className="px-4 py-3.5">
          <button onClick={() => setContextOpen(!contextOpen)} className="flex items-center justify-between w-full mb-2.5">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Context</span>
            <ChevronDown className={`h-3 w-3 text-gray-600 transition-transform ${contextOpen ? "" : "-rotate-90"}`} />
          </button>
          {contextOpen && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-600 mb-1.5">Connectors</p>
              <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <Globe className="h-3.5 w-3.5 text-blue-400/60" />
                <span className="text-[11px] text-gray-400">Web search</span>
              </div>
              <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <FileText className="h-3.5 w-3.5 text-emerald-400/60" />
                <span className="text-[11px] text-gray-400">Smart import</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Suggestion Cards ──────────────────────────────────────────────

const SUGGESTIONS = [
  { text: "Plan my week", desc: "Organize tasks, set priorities, and structure your schedule" },
  { text: "Start a new project", desc: "Break down a goal into actionable tasks and milestones" },
  { text: "Build a study plan", desc: "Create a structured schedule for exams or learning" },
  { text: "Organize my life", desc: "Sort tasks into folders and categories automatically" },
];

// ─── Main Cowork Page ──────────────────────────────────────────────

export default function Cowork() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const hasMessages = messages.length > 0;

  const handleImagePick = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setAttachedImages((prev) => [...prev, { file, preview: ev.target.result }]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeImage = (idx) => setAttachedImages((prev) => prev.filter((_, i) => i !== idx));

  const handleStop = () => {
    abortRef.current = true;
    setLoading(false);
    setMessages((prev) => [...prev, { role: "assistant", content: "Stopped." }]);
  };

  const handleSend = async (overrideInput) => {
    const text = overrideInput || input;
    if (!text.trim() && attachedImages.length === 0) return;
    abortRef.current = false;
    setLoading(true);

    const uploadedUrls = attachedImages.map((i) => i.preview);
    const userMsg = { role: "user", content: text, images: attachedImages.map((i) => i.preview), imageUrls: uploadedUrls };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setAttachedImages([]);

    const conversationHistory = newMessages.map((m) => ({ role: m.role, content: m.content, imageUrls: m.imageUrls || [] }));

    let currentTasks = [];
    let categories = [];
    try {
      const user = await base44.auth.me();
      currentTasks = await base44.entities.Task.filter({ created_by: user.email }, "-due_date");
      categories = await base44.entities.Category.list();
    } catch (_) {}

    let response;
    try {
      response = await base44.functions.invoke("aiAssistant", { messages: conversationHistory, tasks: currentTasks, imageUrls: uploadedUrls, categories });
    } catch (err) {
      if (!abortRef.current) setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
      setLoading(false);
      return;
    }

    if (abortRef.current) return;

    const result = response.data;
    const reply = result?.reply || "Done!";
    const actions = result?.actions || [];
    const project = result?.project || null;
    let actionCount = 0;

    if (actions.length > 0) {
      const user = await base44.auth.me();
      const snapshotTasks = await base44.entities.Task.filter({ created_by: user.email });

      if (actions.some((a) => a.action === "delete_all")) {
        await Promise.all(snapshotTasks.map((t) => base44.entities.Task.delete(t.id)));
        actionCount += snapshotTasks.length;
      } else {
        const catActions = actions.filter((a) => a.action === "create_category");
        const folderActions = actions.filter((a) => a.action === "create_folder");
        const taskActions = actions.filter((a) => !["create_category", "create_folder"].includes(a.action));

        for (const act of catActions) {
          try {
            if (act.label && act.color && act.key) { await base44.entities.Category.create({ label: act.label, color: act.color, key: act.key }); actionCount++; }
          } catch (_) {}
        }

        if (folderActions.length > 0) {
          try {
            const existing = JSON.parse(localStorage.getItem("pulse_category_folders") || "[]");
            const enabledFolders = JSON.parse(localStorage.getItem("pulse_enabled_folders") || "{}");
            for (const act of folderActions) {
              if (act.name) { existing.push({ name: act.name, categoryKeys: act.categoryKeys || [] }); enabledFolders[existing.length - 1] = true; actionCount++; }
            }
            localStorage.setItem("pulse_category_folders", JSON.stringify(existing));
            localStorage.setItem("pulse_enabled_folders", JSON.stringify(enabledFolders));
          } catch (_) {}
        }

        await Promise.all(taskActions.map(async (act) => {
          try {
            if (act.action === "create") { const { action, ...data } = act; await base44.entities.Task.create({ status: "todo", priority: "medium", ...data }); actionCount++; }
            else if (act.action === "update" && act.id) { await base44.entities.Task.update(act.id, act.fields || {}); actionCount++; }
            else if (act.action === "delete" && act.id) { await base44.entities.Task.delete(act.id); actionCount++; }
          } catch (_) {}
        }));
      }

      // Refresh sidebar data
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    }

    setMessages((prev) => [...prev, { role: "assistant", content: reply, actionCount, project }]);
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex h-screen bg-[#1e1f20] text-gray-100">
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-[#1e1f20] shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-gray-300">Co-pilot</span>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors">
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            /* ─── Empty State (Claude-style) ─── */
            <div className="flex flex-col items-center justify-center h-full px-6 pb-32">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6 border border-white/[0.06]">
                <Sparkles className="h-7 w-7 text-blue-400" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-100 mb-2">What are you working on?</h1>
              <p className="text-sm text-gray-500 mb-10 max-w-md text-center">Tell me about a project, goal, or idea. I'll break it down into tasks and organize everything for you.</p>

              <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.text)}
                    className="text-left rounded-xl border border-white/[0.06] bg-[#2a2b2d] hover:bg-[#333435] hover:border-white/[0.1] px-4 py-3.5 transition-all group"
                  >
                    <span className="text-[13px] text-gray-300 font-medium group-hover:text-white transition-colors">{s.text}</span>
                    <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ─── Chat Messages ─── */
            <div className="px-4 py-4 space-y-5 max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 flex items-center justify-center flex-shrink-0 mt-0.5 border border-white/[0.06]">
                      <Sparkles className="h-4 w-4 text-blue-400" />
                    </div>
                  )}
                  <div className={`max-w-[75%] ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                    {msg.images?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
                        {msg.images.map((src, j) => <img key={j} src={src} className="h-20 w-20 rounded-lg object-cover" alt="" />)}
                      </div>
                    )}
                    {msg.content && (
                      <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-[#2a2b2d] text-gray-300 border border-white/[0.06]"}`}>
                        {msg.role === "assistant" ? (
                          <ReactMarkdown className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-1.5 prose-li:my-0.5">{msg.content}</ReactMarkdown>
                        ) : msg.content}
                      </div>
                    )}
                    {/* Project card */}
                    {msg.project && (
                      <div className="mt-2.5 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FolderPlus className="h-4 w-4 text-blue-400" />
                            <span className="text-xs font-semibold text-blue-300">{msg.project.name}</span>
                          </div>
                          <span className="text-[10px] text-blue-400/60 bg-blue-500/10 px-2 py-0.5 rounded-full">{msg.project.taskCount} tasks</span>
                        </div>
                        <button onClick={() => navigate(createPageUrl("Tasks"))} className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                          <ExternalLink className="h-3 w-3" /> View in Tasks
                        </button>
                      </div>
                    )}
                    {/* Action count */}
                    {msg.actionCount > 0 && !msg.project && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400/80">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{msg.actionCount} action{msg.actionCount !== 1 ? "s" : ""} completed</span>
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5 border border-white/[0.06]">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 flex items-center justify-center flex-shrink-0 border border-white/[0.06]">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="bg-[#2a2b2d] border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-2.5">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Image previews */}
        {attachedImages.length > 0 && (
          <div className="px-4 py-2 flex gap-2 flex-wrap border-t border-white/[0.06]">
            {attachedImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.preview} className="h-14 w-14 rounded-lg object-cover" alt="" />
                <button onClick={() => removeImage(i)} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
                  <X className="h-2.5 w-2.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className={`px-4 ${hasMessages ? 'py-3 border-t border-white/[0.06]' : 'pb-6 pt-0'} bg-[#1e1f20] shrink-0`}>
          <div className={`flex items-end gap-2 ${hasMessages ? 'max-w-3xl' : 'max-w-lg'} mx-auto`}>
            <div className="flex-1 bg-[#2a2b2d] border border-white/[0.08] rounded-2xl flex items-end px-3 py-2 gap-2 focus-within:border-white/[0.15] transition-colors">
              <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors shrink-0 mb-0.5" title="Attach image">
                <Plus className="h-4 w-4" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasMessages ? "Reply..." : "What are you working on?"}
                rows={1}
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none min-h-[24px] max-h-[120px] py-0.5"
                onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
              />
              {loading ? (
                <button onClick={handleStop} className="p-1 rounded-md bg-red-600 hover:bg-red-500 shrink-0 mb-0.5">
                  <Square className="h-3.5 w-3.5 text-white" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() && attachedImages.length === 0}
                  className="p-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 shrink-0 mb-0.5 transition-colors"
                >
                  <Send className="h-3.5 w-3.5 text-white" />
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-gray-700 mt-2 text-center">Signal AI can make mistakes. Review your tasks after creation.</p>
        </div>
      </div>

      {/* Sidebar */}
      <ProjectSidebar open={sidebarOpen} />
    </div>
  );
}
