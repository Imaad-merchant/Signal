import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Image, X, Loader2, User, Bot, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";

export default function AIAssistantDialog({ open, onOpenChange, onUpdated }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I'm your calendar AI assistant. Tell me what you'd like to do — create tasks, reschedule things, reorganize your week, or upload a picture of a schedule and I'll handle it for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState([]); // { file, preview, url }
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
        setAttachedImages((prev) => [...prev, { file, preview: ev.target.result, url: null }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeImage = (idx) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if (!input.trim() && attachedImages.length === 0) return;
    setLoading(true);

    // Upload any images first
    let uploadedUrls = [];
    for (const img of attachedImages) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: img.file });
      uploadedUrls.push(file_url);
    }

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
    let categories = [];
    try {
      const [user, cats] = await Promise.all([base44.auth.me(), base44.entities.Category.list()]);
      categories = cats;
      currentTasks = await base44.entities.Task.filter({ created_by: user.email }, "-due_date", 50);
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
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
      setLoading(false);
      return;
    }

    const result = response.data;
    const reply = result?.reply || "Done!";
    const actions = result?.actions || [];

    // Execute actions
    let actionCount = 0;
    for (const act of actions) {
      if (act.action === "create_category") {
        const { action, label, color, key } = act;
        if (label && color && key) {
          await base44.entities.Category.create({ label, color, key });
          actionCount++;
        }
      } else if (act.action === "create") {
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
    }

    if (actionCount > 0) onUpdated();

    setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    setLoading(false);
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
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <Sparkles className="h-4 w-4 text-blue-400" />
            AI Calendar Assistant
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
            <Button
              onClick={handleSend}
              disabled={loading || (!input.trim() && attachedImages.length === 0)}
              className="bg-blue-600 hover:bg-blue-500 rounded-xl px-3 h-9 flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}