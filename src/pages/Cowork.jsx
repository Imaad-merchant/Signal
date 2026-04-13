import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Image, X, Loader2, User, Bot, Square, ArrowLeft, FolderPlus, CheckCircle2, ListTodo, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

function ProjectCard({ project }) {
  const navigate = useNavigate();
  return (
    <div className="mt-2 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-3.5 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-semibold text-blue-300">{project.name}</span>
        </div>
        <span className="text-[10px] text-blue-400/60 bg-blue-500/10 px-2 py-0.5 rounded-full">
          {project.taskCount} task{project.taskCount !== 1 ? "s" : ""}
        </span>
      </div>
      {project.folderName && (
        <button
          onClick={() => navigate(createPageUrl("Tasks"))}
          className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View in Tasks → {project.folderName}
        </button>
      )}
    </div>
  );
}

function ActionSummary({ count }) {
  if (count === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400/80">
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>{count} action{count !== 1 ? "s" : ""} completed</span>
    </div>
  );
}

const SUGGESTIONS = [
  "Plan my week — I have a project due Friday and a gym routine",
  "I need to organize a trip to NYC next weekend",
  "Help me build a study plan for my finals in 2 weeks",
  "I want to start a side project — a mobile app",
];

export default function Cowork() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hey! I'm your AI co-pilot. Just tell me what you're working on — I'll automatically turn it into organized projects and tasks.\n\nTry talking about a goal, plan, or idea and I'll set everything up for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState([]);
  const [loading, setLoading] = useState(false);
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
        setAttachedImages((prev) => [...prev, { file, preview: ev.target.result }]);
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

  const handleSend = async (overrideInput) => {
    const text = overrideInput || input;
    if (!text.trim() && attachedImages.length === 0) return;
    abortRef.current = false;
    setLoading(true);

    const uploadedUrls = attachedImages.map((i) => i.preview);

    const userMsg = {
      role: "user",
      content: text,
      images: attachedImages.map((i) => i.preview),
      imageUrls: uploadedUrls,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setAttachedImages([]);

    const conversationHistory = newMessages.slice(1).map((m) => ({
      role: m.role,
      content: m.content,
      imageUrls: m.imageUrls || [],
    }));

    let currentTasks = [];
    let categories = [];
    try {
      const user = await base44.auth.me();
      currentTasks = await base44.entities.Task.filter({ created_by: user.email }, "-due_date");
      categories = await base44.entities.Category.list();
    } catch (_) {}

    let response;
    try {
      response = await base44.functions.invoke("aiAssistant", {
        messages: conversationHistory,
        tasks: currentTasks,
        imageUrls: uploadedUrls,
        categories,
      });
    } catch (err) {
      if (!abortRef.current) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, something went wrong. Please try again." },
        ]);
      }
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
        const taskActions = actions.filter(
          (a) => !["create_category", "create_folder"].includes(a.action)
        );

        for (const act of catActions) {
          try {
            if (act.label && act.color && act.key) {
              await base44.entities.Category.create({ label: act.label, color: act.color, key: act.key });
              actionCount++;
            }
          } catch (_) {}
        }

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
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: reply,
        actionCount,
        project,
      },
    ]);
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showSuggestions = messages.length <= 1;

  return (
    <div className="flex flex-col h-screen bg-[#1e1f20] text-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08] bg-[#232425] shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-white/5 text-gray-500 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-200">AI Co-pilot</h1>
            <p className="text-[10px] text-gray-600">Talk naturally — I'll organize everything</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-7 w-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-blue-400" />
              </div>
            )}
            <div className={`max-w-[80%] ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
              {msg.images?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1 justify-end">
                  {msg.images.map((src, j) => (
                    <img key={j} src={src} className="h-20 w-20 rounded-lg object-cover" alt="" />
                  ))}
                </div>
              )}
              {msg.content && (
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-[#2a2b2d] text-gray-300 border border-white/[0.06]"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-1.5 prose-li:my-0.5">
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              )}
              {/* Project card */}
              {msg.project && <ProjectCard project={msg.project} />}
              {/* Action summary */}
              {msg.actionCount > 0 && !msg.project && <ActionSummary count={msg.actionCount} />}
            </div>
            {msg.role === "user" && (
              <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-4 w-4 text-gray-500" />
              </div>
            )}
          </div>
        ))}

        {/* Suggestions */}
        {showSuggestions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                className="text-left text-xs text-gray-500 hover:text-gray-300 bg-[#2a2b2d] hover:bg-[#333435] border border-white/[0.06] rounded-xl px-3.5 py-3 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="h-7 w-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-blue-400" />
            </div>
            <div className="bg-[#2a2b2d] border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <span className="text-xs text-gray-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image previews */}
      {attachedImages.length > 0 && (
        <div className="px-4 py-2 flex gap-2 flex-wrap border-t border-white/[0.06]">
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
      <div className="px-4 py-3 border-t border-white/[0.06] bg-[#232425] shrink-0">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-lg bg-[#2a2b2d] hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
            title="Attach image"
          >
            <Image className="h-4 w-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me about a project, goal, or idea..."
            rows={1}
            className="flex-1 bg-[#2a2b2d] border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500/30 min-h-[40px] max-h-[120px]"
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
          />
          {loading ? (
            <Button onClick={handleStop} className="bg-red-600 hover:bg-red-500 rounded-lg px-3 h-10 flex-shrink-0">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() && attachedImages.length === 0}
              className="bg-blue-600 hover:bg-blue-500 rounded-lg px-3 h-10 flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-gray-700 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
