import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useIsMobile } from "@/components/useIsMobile";
import {
  Sunrise, Moon, Loader2, AlertTriangle, RotateCw, Check, X,
  Sparkles, Link2, Target, Globe, CheckCircle2,
} from "lucide-react";
import { getChicagoParts, slotKeyOf, setStoredCheckinKey, unwrap } from "./checkinUtils";

// ---------- payback presentation ----------
const PAYBACK_META = {
  cross_domain: { label: "Cross-domain", Icon: Link2, badge: "bg-violet-500/15 text-violet-300 border-violet-500/30", ring: "border-violet-500/25" },
  commitment: { label: "Commitment", Icon: Target, badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", ring: "border-amber-500/25" },
  world: { label: "World", Icon: Globe, badge: "bg-sky-500/15 text-sky-300 border-sky-500/30", ring: "border-sky-500/25" },
};

function ErrorBlock({ message, onRetry, retrying }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-300" />
        <div className="flex-1 min-w-0">
          <p className="break-words">{message || "Something went wrong."}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-100 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The payback "shimmer" placeholder shown while the insight generates.
function PaybackShimmer() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#232425] p-4 animate-pulse">
      <div className="h-5 w-24 rounded-full bg-white/10 mb-3" />
      <div className="h-4 w-3/4 rounded bg-white/10 mb-2" />
      <div className="h-3 w-full rounded bg-white/[0.07] mb-1.5" />
      <div className="h-3 w-5/6 rounded bg-white/[0.07]" />
    </div>
  );
}

function PaybackCard({ payback }) {
  // Guard every nested read — payback comes back as loosely-shaped jsonb.
  const type = typeof payback?.type === "string" ? payback.type : "world";
  const meta = PAYBACK_META[type] || PAYBACK_META.world;
  const { Icon } = meta;
  const title = payback?.title ? String(payback.title) : "Payback";
  const body = payback?.body ? String(payback.body) : "";
  const evidence = payback?.evidence ? String(payback.evidence) : "";

  return (
    <div className={`rounded-xl border ${meta.ring} bg-[#232425] p-4`}>
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>
        <Icon className="h-3.5 w-3.5" />
        {meta.label}
      </div>
      <h4 className="mt-3 text-base font-semibold text-gray-100 leading-snug">{title}</h4>
      {body && <p className="mt-1.5 text-sm text-gray-300 leading-relaxed whitespace-pre-line">{body}</p>}
      {evidence && (
        <p className="mt-2.5 text-xs text-gray-500 border-l-2 border-white/10 pl-2.5 leading-relaxed whitespace-pre-line">
          {evidence}
        </p>
      )}
    </div>
  );
}

// ---------- questions ----------
const ANSWER_OPTS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "skip", label: "Skip" },
];

function QuestionRow({ question, index, value, onAnswer }) {
  const text = question?.text ? String(question.text) : `Question ${index + 1}`;
  return (
    <div className="rounded-xl border border-white/10 bg-[#232425] p-3.5">
      <p className="text-sm font-medium text-gray-100 leading-snug mb-3">{text}</p>
      <div className="grid grid-cols-3 gap-2">
        {ANSWER_OPTS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAnswer(opt.value)}
              className={`min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                active
                  ? "border-blue-500 bg-blue-600/90 text-white"
                  : "border-white/10 bg-[#2d2e30] text-gray-300 hover:bg-white/5"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- main body ----------
const SEED_FLAG = "pulse_jarvis_seeded";

function CheckInBody({ slot, dateKey, onCompleted, onClose }) {
  const seededRef = useRef(false);
  const paybackStartedRef = useRef(false);
  const commitmentsSavedRef = useRef(false);

  const [phase, setPhase] = useState("loading"); // loading | questions | reveal

  // context gathered for the AI calls
  const [ctx, setCtx] = useState({ commitments: [], today: [], memory: [], domains: [], newsTopics: [] });
  const [pastDue, setPastDue] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { [qid]: "yes"|"no"|"skip" }

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState(null);

  const [payback, setPayback] = useState(null);
  const [loadingPayback, setLoadingPayback] = useState(false);
  const [paybackError, setPaybackError] = useState(null);

  const [commitText, setCommitText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [seedError, setSeedError] = useState(null);
  const [pastDueBusy, setPastDueBusy] = useState({}); // { [id]: true }
  const [pastDueError, setPastDueError] = useState({}); // { [id]: message }

  const isEvening = slot === "evening";

  // ---- first-run domain seed (quiet, background, non-blocking) ----
  const maybeSeedDomains = useCallback(async (existingDomains, tasks) => {
    if (seededRef.current) return;
    if (Array.isArray(existingDomains) && existingDomains.length > 0) return;
    // Cross-mount guard (e.g. StrictMode double-mount) so we never seed twice.
    try {
      if (localStorage.getItem(SEED_FLAG)) return;
      localStorage.setItem(SEED_FLAG, "1");
    } catch {
      /* ignore — proceed without the persisted guard */
    }
    seededRef.current = true;
    setSeedError(null);
    try {
      const res = await base44.functions.invoke("donna", { route: "seed", tasks: tasks || [] });
      const domains = unwrap(res)?.domains;
      if (Array.isArray(domains) && domains.length) {
        const created = [];
        for (const d of domains) {
          if (!d || (!d.key && !d.label)) continue;
          try {
            const rec = await base44.entities.Domain.create({
              key: d.key || null,
              label: d.label || d.key || "Domain",
              sort_order: Number.isFinite(d.sort_order) ? d.sort_order : created.length + 1,
            });
            created.push(rec);
          } catch {
            /* individual insert failure is non-fatal */
          }
        }
        if (created.length) setCtx((c) => ({ ...c, domains: created }));
      }
    } catch (err) {
      // Surfaced quietly; never blocks the check-in.
      setSeedError(err?.message || "Couldn't set up domains (you can still check in).");
      seededRef.current = false; // allow a later retry via reload
      try { localStorage.removeItem(SEED_FLAG); } catch { /* ignore */ }
    }
  }, []);

  // ---- fetch questions given a context object ----
  const fetchQuestions = useCallback(async (context) => {
    setLoadingQuestions(true);
    setQuestionsError(null);
    try {
      const res = await base44.functions.invoke("donna", {
        route: "checkin",
        action: "questions",
        slot,
        context: {
          commitments: context.commitments,
          today: context.today,
          memory: context.memory,
          domains: context.domains,
        },
      });
      const data = unwrap(res);
      const qs = Array.isArray(data?.questions) ? data.questions : [];
      setQuestions(qs);
    } catch (err) {
      setQuestionsError(err?.message || "Couldn't load your questions.");
    } finally {
      setLoadingQuestions(false);
    }
  }, [slot]);

  // ---- initial load: gather context + past-due + questions ----
  const load = useCallback(async () => {
    setPhase("loading");
    setQuestionsError(null);
    try {
      const [commitments, tasksRaw, memory, domains, newsTopics] = await Promise.all([
        base44.entities.Commitment.filter({ status: "open" }).catch(() => []),
        base44.entities.Task.list("-created_date").catch(() => []),
        base44.entities.Memory.list("-created_date", 15).catch(() => []),
        base44.entities.Domain.list("sort_order").catch(() => []),
        base44.entities.NewsTopic.filter({ is_active: true }).catch(() => []),
      ]);

      const openCommitments = Array.isArray(commitments) ? commitments : [];
      const today = (Array.isArray(tasksRaw) ? tasksRaw : [])
        .filter((t) => t && t.due_date === dateKey)
        .slice(0, 25)
        .map((t) => ({ title: t.title || "", category: t.category || "", status: t.status || "" }));

      // Past-due = stated/open commitments whose due date is strictly before today.
      const due = openCommitments.filter((c) => c && c.due_on && String(c.due_on) < dateKey);
      setPastDue(due);

      const nextCtx = {
        commitments: openCommitments,
        today,
        memory: Array.isArray(memory) ? memory : [],
        domains: Array.isArray(domains) ? domains : [],
        newsTopics: Array.isArray(newsTopics) ? newsTopics : [],
      };
      setCtx(nextCtx);
      setPhase("questions");

      // Kick off the quiet background seed (does not block).
      maybeSeedDomains(nextCtx.domains, tasksRaw);

      await fetchQuestions(nextCtx);
    } catch (err) {
      // Even if context gathering fails, land on the questions phase so the error + retry shows.
      setPhase("questions");
      setQuestionsError(err?.message || "Couldn't start your check-in.");
    }
  }, [dateKey, fetchQuestions, maybeSeedDomains]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- generate the payback insight ----
  const generatePayback = useCallback(async (answersObj) => {
    setLoadingPayback(true);
    setPaybackError(null);
    try {
      const answerArr = questions.map((q, i) => ({
        id: q?.id || `q${i + 1}`,
        text: q?.text || "",
        kind: q?.kind || "reflection",
        answer: answersObj[q?.id || `q${i + 1}`] || "skip",
      }));
      const res = await base44.functions.invoke("donna", {
        route: "checkin",
        action: "payback",
        context: {
          answers: answerArr,
          memory: ctx.memory,
          domains: ctx.domains,
          news_topics: ctx.newsTopics,
        },
      });
      const data = unwrap(res);
      const pb = data?.payback && typeof data.payback === "object" ? data.payback : null;
      // The route guarantees a payback; still guard against a malformed shape.
      setPayback(pb || { type: "world", title: "Something worth knowing", body: "Keep going — you showed up today." });
    } catch (err) {
      setPaybackError(err?.message || "Couldn't generate your payback.");
    } finally {
      setLoadingPayback(false);
    }
  }, [questions, ctx]);

  // ---- answer a question; the instant the last one is answered, reveal + fire payback ----
  const answerQuestion = (qid, value) => {
    const next = { ...answers, [qid]: value };
    setAnswers(next);
    const allAnswered = questions.length > 0 && questions.every((q, i) => next[q?.id || `q${i + 1}`]);
    if (allAnswered && !paybackStartedRef.current) {
      paybackStartedRef.current = true;
      setPhase("reveal");
      generatePayback(next);
    }
  };

  // Empty-questions escape hatch: proceed straight to the reveal.
  const proceedWithoutQuestions = () => {
    if (paybackStartedRef.current) return;
    paybackStartedRef.current = true;
    setPhase("reveal");
    generatePayback(answers);
  };

  // ---- past-due commitment resolution ----
  const resolveCommitment = async (id, status) => {
    if (!id) return;
    setPastDueBusy((b) => ({ ...b, [id]: true }));
    setPastDueError((e) => ({ ...e, [id]: null }));
    try {
      await base44.entities.Commitment.update(id, { status });
      setPastDue((list) => list.filter((c) => c.id !== id));
    } catch (err) {
      setPastDueError((e) => ({ ...e, [id]: err?.message || "Couldn't update." }));
    } finally {
      setPastDueBusy((b) => ({ ...b, [id]: false }));
    }
  };

  // ---- finish: persist stated commitments (evening) + the CheckIn record ----
  const finish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Only create stated commitments once, even if the CheckIn save fails and we retry.
      if (isEvening && !commitmentsSavedRef.current) {
        const lines = commitText.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          await base44.entities.Commitment.create({
            text: line,
            domain_id: null,
            stated_on: dateKey,
            due_on: null,
            status: "open",
            source: "stated",
          });
        }
        commitmentsSavedRef.current = true;
      }
      const answersArr = questions.map((q, i) => ({
        id: q?.id || `q${i + 1}`,
        text: q?.text || "",
        kind: q?.kind || "reflection",
        answer: answers[q?.id || `q${i + 1}`] || "skip",
      }));
      await base44.entities.CheckIn.create({
        date: dateKey,
        slot,
        questions,
        answers: answersArr,
        completed_at: new Date().toISOString(),
      });
      setStoredCheckinKey(slotKeyOf(dateKey, slot));
      onCompleted?.();
      onClose?.();
    } catch (err) {
      setSaveError(err?.message || "Couldn't save your check-in.");
    } finally {
      setSaving(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q, i) => answers[q?.id || `q${i + 1}`]);

  // ---------- render ----------
  if (phase === "loading") {
    return (
      <div className="py-10 flex flex-col items-center justify-center gap-3 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        <p className="text-sm">Preparing your check-in…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quiet, non-blocking seed error */}
      {seedError && (
        <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          {seedError}
        </p>
      )}

      {/* Past-due follow-ups (stated commitments only) */}
      {phase !== "reveal" && pastDue.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">You said you'd…</h3>
          {pastDue.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 bg-[#232425] p-3">
              <p className="text-sm text-gray-200">{c?.text ? String(c.text) : "(untitled commitment)"}</p>
              {c?.due_on && <p className="text-[11px] text-gray-500 mt-0.5">Due {String(c.due_on)}</p>}
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => resolveCommitment(c.id, "done")}
                  disabled={pastDueBusy[c.id]}
                  className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {pastDueBusy[c.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Done
                </button>
                <button
                  onClick={() => resolveCommitment(c.id, "dropped")}
                  disabled={pastDueBusy[c.id]}
                  className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#2d2e30] text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Drop
                </button>
              </div>
              {pastDueError[c.id] && (
                <p className="mt-1.5 text-[11px] text-red-300">{pastDueError[c.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Questions */}
      {phase !== "reveal" && (
        <div className="space-y-3">
          {loadingQuestions && (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <p className="text-sm">Thinking of good questions…</p>
            </div>
          )}

          {!loadingQuestions && questionsError && (
            <ErrorBlock message={questionsError} onRetry={() => fetchQuestions(ctx)} retrying={loadingQuestions} />
          )}

          {!loadingQuestions && !questionsError && questions.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-[#232425] p-4 text-center">
              <p className="text-sm text-gray-400 mb-3">No questions today — you're clear.</p>
              <Button onClick={proceedWithoutQuestions} className="rounded-xl h-10 bg-blue-600 hover:bg-blue-500 text-white">
                Continue
              </Button>
            </div>
          )}

          {!loadingQuestions && !questionsError && questions.length > 0 && (
            <>
              {questions.map((q, i) => (
                <QuestionRow
                  key={q?.id || `q${i + 1}`}
                  question={q}
                  index={i}
                  value={answers[q?.id || `q${i + 1}`]}
                  onAnswer={(v) => answerQuestion(q?.id || `q${i + 1}`, v)}
                />
              ))}
              {!allAnswered && (
                <p className="text-[11px] text-gray-500 text-center">Answer each question to see your payback.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Reveal: payback + (evening) stated commitments + finish */}
      {phase === "reveal" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              Your payback
            </h3>
            {loadingPayback && <PaybackShimmer />}
            {!loadingPayback && paybackError && (
              <ErrorBlock message={paybackError} onRetry={() => generatePayback(answers)} retrying={loadingPayback} />
            )}
            {!loadingPayback && !paybackError && payback && <PaybackCard payback={payback} />}
          </div>

          {isEvening && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Anything you're committing to?
              </label>
              <p className="text-[11px] text-gray-500 mb-2">One per line (optional).</p>
              <Textarea
                value={commitText}
                onChange={(e) => setCommitText(e.target.value)}
                placeholder={"e.g. Ship the draft by Friday\nCall Mom"}
                rows={3}
                className="rounded-xl bg-[#2d2e30] border-white/10 text-gray-100 placeholder:text-gray-600 resize-none"
              />
            </div>
          )}

          {saveError && <ErrorBlock message={saveError} onRetry={finish} retrying={saving} />}

          <Button
            onClick={finish}
            disabled={saving}
            className="w-full rounded-xl h-11 gap-2 bg-blue-600 hover:bg-blue-500 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isEvening && commitText.trim() ? "Save commitments & finish" : "Done"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CheckInModal({ open, onOpenChange, onCompleted }) {
  const isMobile = useIsMobile();
  // Compute slot + date once per open so it stays stable through the session.
  const [{ slot, dateKey }, setParts] = useState(() => getChicagoParts());
  useEffect(() => {
    if (open) setParts(getChicagoParts());
  }, [open]);

  const isEvening = slot === "evening";
  const SlotIcon = isEvening ? Moon : Sunrise;
  const title = isEvening ? "Evening check-in" : "Morning check-in";
  const subtitle = `${dateKey} · ${isEvening ? "Evening" : "Morning"}`;

  const close = () => onOpenChange(false);
  // Remount the body each time the modal opens so state fully resets.
  const body = open ? (
    <CheckInBody slot={slot} dateKey={dateKey} onCompleted={onCompleted} onClose={close} />
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-[#1e1f20] border-white/10">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-gray-100">
              <SlotIcon className="h-4 w-4 text-blue-400" />
              {title}
            </DrawerTitle>
            <DrawerDescription className="text-gray-500">{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 max-h-[75vh] overflow-y-auto">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#1e1f20] border-white/10 text-gray-100 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-100">
            <SlotIcon className="h-4 w-4 text-blue-400" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-gray-500">{subtitle}</DialogDescription>
        </DialogHeader>
        <div className="mt-1">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
