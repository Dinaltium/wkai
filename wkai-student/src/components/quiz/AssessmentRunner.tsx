import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import {
  reportViolation,
  saveAnswer,
  startAttempt,
  submitAttempt,
  type LiveAssessment,
  type ReviewRow,
  type StudentQuestion,
  type SubmitResult,
} from "../../lib/assessments";
import { useProctoring, type ProctorViolation } from "../../hooks/useProctoring";

/**
 * Takes one assessment, start to finish.
 *
 * Answers are sent as they are given rather than batched at submit: a student
 * whose laptop dies, or who is locked out by the proctor, is then graded on
 * what they actually did instead of losing the attempt entirely. The server
 * decides correctness — nothing here ever holds the answer key.
 */
export function AssessmentRunner({
  assessment,
  onExit,
}: {
  assessment: LiveAssessment;
  onExit: () => void;
}) {
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(!assessment.proctored);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const submittedRef = useRef(false);

  const linear = assessment.navigation === "linear";

  // ─── Attempt bootstrap ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await startAttempt(assessment.id);
        if (cancelled) return;
        setAttemptId(data.attempt.id);
        setQuestions(data.questions);
        const restored: Record<string, number> = {};
        data.answers.forEach((a) => {
          restored[a.questionId] = a.selectedIndex;
        });
        setAnswers(restored);
        if (linear) setLocked(new Set(Object.keys(restored)));
        // Resuming mid-attempt drops them at the first unanswered question
        // rather than back at the start.
        const firstUnanswered = data.questions.findIndex((q) => !(q.id in restored));
        setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
        if (assessment.timeLimitSeconds) {
          const elapsed = (Date.now() - new Date(data.attempt.startedAt).getTime()) / 1000;
          setSecondsLeft(Math.max(0, Math.round(assessment.timeLimitSeconds - elapsed)));
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Could not open this assessment.";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessment.id, assessment.timeLimitSeconds, linear]);

  const finish = useCallback(
    async (wasLocked: boolean) => {
      if (!attemptId || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        setResult(await submitAttempt(attemptId, wasLocked));
      } catch {
        setError("Your answers were saved, but the final submit failed. Tell your instructor.");
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId]
  );

  // ─── Proctoring ────────────────────────────────────────────────────────────
  const onViolation = useCallback(
    (kind: ProctorViolation) => {
      if (attemptId) void reportViolation(attemptId, kind);
      void finish(true);
    },
    [attemptId, finish]
  );

  const { enterFullscreen, exitFullscreen } = useProctoring({
    enabled: assessment.proctored && started && !result,
    onViolation,
  });

  useEffect(() => {
    if (result) void exitFullscreen();
  }, [result, exitFullscreen]);

  // ─── Time limit ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft === null || result || !started) return;
    if (secondsLeft <= 0) {
      void finish(false);
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, result, started, finish]);

  async function choose(question: StudentQuestion, optionIndex: number) {
    if (locked.has(question.id) || result) return;
    setAnswers((current) => ({ ...current, [question.id]: optionIndex }));
    if (!attemptId) return;
    try {
      await saveAnswer(attemptId, question.id, optionIndex);
      // In linear mode the server refuses to change this answer, so the UI
      // stops pretending it can.
      if (linear) setLocked((current) => new Set(current).add(question.id));
    } catch {
      setError("That answer did not reach the server. Check your connection.");
    }
  }

  // ─── States ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Centered>
        <Loader2 size={20} className="animate-spin text-accent-text" />
        <p className="text-sm text-wkai-text-dim">Opening {assessment.title}</p>
      </Centered>
    );
  }

  if (error && !questions.length) {
    return (
      <Centered>
        <AlertTriangle size={20} className="text-warn" />
        <p className="text-sm font-medium text-wkai-text">{error}</p>
        <button className="btn-ghost border border-wkai-border" onClick={onExit}>
          Back
        </button>
      </Centered>
    );
  }

  if (result) {
    return <ResultView assessment={assessment} result={result} onExit={onExit} />;
  }

  // Proctored start gate — entering fullscreen has to come from a click, so it
  // cannot be folded into the bootstrap above.
  if (!started) {
    return (
      <Centered>
        <div className="max-w-sm space-y-3 text-center">
          <h2 className="text-base font-semibold text-wkai-text">{assessment.title}</h2>
          <p className="text-sm leading-relaxed text-wkai-text-dim">
            {questions.length} question{questions.length === 1 ? "" : "s"}
            {assessment.timeLimitSeconds
              ? `, ${Math.round(assessment.timeLimitSeconds / 60)} minutes`
              : ""}
            . This test runs fullscreen. If you leave fullscreen, switch tabs or minimise, your
            answers are submitted as they stand and your instructor is told.
            {linear && " You cannot go back to a question once you answer it."}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={async () => {
            await enterFullscreen();
            setStarted(true);
          }}
        >
          Begin test
        </button>
        <button className="btn-ghost text-xs" onClick={onExit}>
          Not yet
        </button>
      </Centered>
    );
  }

  const question = questions[index];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-wkai-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-wkai-text">{assessment.title}</p>
          <p className="text-[11px] text-wkai-text-dim">
            Question {index + 1} of {questions.length} · {answeredCount} answered
          </p>
        </div>
        {secondsLeft !== null && (
          <span
            className={clsx(
              "shrink-0 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
              secondsLeft < 60 ? "bg-danger/15 text-danger" : "bg-wkai-surface2 text-wkai-text-dim"
            )}
          >
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {error && (
            <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              {error}
            </p>
          )}

          <p className="text-sm leading-relaxed text-wkai-text">{question.prompt}</p>

          <div className="space-y-2">
            {question.options.map((option, oi) => {
              const chosen = answers[question.id] === oi;
              const isLocked = locked.has(question.id);
              return (
                <button
                  key={oi}
                  onClick={() => void choose(question, oi)}
                  disabled={isLocked && !chosen}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                    chosen
                      ? "border-accent bg-accent/10 text-wkai-text"
                      : "border-wkai-border text-wkai-text hover:border-wkai-text-dim",
                    isLocked && !chosen && "opacity-50"
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                      chosen ? "border-accent bg-accent text-accent-fg" : "border-wkai-border"
                    )}
                  >
                    {chosen ? <Check size={12} /> : String.fromCharCode(65 + oi)}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>

          {linear && locked.has(question.id) && (
            <p className="text-[11px] text-wkai-text-dim">
              Answer recorded. This test does not allow going back.
            </p>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-wkai-border px-4 py-3">
        {!linear && (
          <button
            className="btn-ghost btn-sm border border-wkai-border"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )}

        <div className="flex-1" />

        {index < questions.length - 1 ? (
          <button
            className="btn-primary btn-sm"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={linear && !(question.id in answers)}
          >
            Next
            <ArrowRight size={14} />
          </button>
        ) : (
          <button className="btn-primary btn-sm" onClick={() => void finish(false)} disabled={submitting}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Submit
          </button>
        )}
      </footer>
    </div>
  );
}

function ResultView({
  assessment,
  result,
  onExit,
}: {
  assessment: LiveAssessment;
  result: SubmitResult;
  onExit: () => void;
}) {
  const pct = result.maxScore ? Math.round((result.score / result.maxScore) * 100) : 0;

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="space-y-2 rounded-2xl border border-wkai-border bg-wkai-surface p-6 text-center">
          <h2 className="text-base font-semibold text-wkai-text">
            {result.status === "locked" ? "Test ended early" : "Submitted"}
          </h2>
          {result.status === "locked" && (
            <p className="text-xs text-warn">
              You left the test window, so your answers were submitted as they stood. Your
              instructor can see this.
            </p>
          )}
          <p className="font-mono text-3xl font-bold text-accent-text">
            {result.score}
            <span className="text-base text-wkai-text-dim">/{result.maxScore}</span>
          </p>
          <p className="text-xs text-wkai-text-dim">
            {pct}% ·{" "}
            {result.countsTowardScore
              ? "counts toward your score"
              : "practice — this does not count"}
          </p>
        </div>

        {/* A quiz shows its answers; a test does not until the instructor closes it. */}
        {result.review ? (
          <div className="space-y-2">
            {result.review.map((row, i) => (
              <ReviewCard key={i} row={row} index={i} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-wkai-border bg-wkai-bg p-4 text-center text-xs text-wkai-text-dim">
            Answers stay hidden until your instructor closes this {assessment.kind}.
          </p>
        )}

        <button className="btn-ghost w-full justify-center border border-wkai-border" onClick={onExit}>
          Done
        </button>
      </div>
    </div>
  );
}

function ReviewCard({ row, index }: { row: ReviewRow; index: number }) {
  return (
    <div
      className={clsx(
        "space-y-1.5 rounded-xl border p-3",
        row.isCorrect ? "border-ok/30 bg-ok/5" : "border-danger/30 bg-danger/5"
      )}
    >
      <p className="text-xs font-medium text-wkai-text">
        {index + 1}. {row.prompt}
      </p>
      <p className="text-[11px] text-wkai-text-dim">
        You chose: {row.selectedIndex === null ? "nothing" : row.options[row.selectedIndex]}
        {!row.isCorrect && ` · Correct: ${row.options[row.correctIndex]}`}
      </p>
      {row.explanation && (
        <p className="text-[11px] leading-relaxed text-wkai-text-dim">{row.explanation}</p>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  );
}
