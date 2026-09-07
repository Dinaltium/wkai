import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Printer, Sparkles, X } from "lucide-react";
import { clsx } from "clsx";
import {
  evaluateAttempt,
  getResults,
  type AssessmentResults as Results,
  type AttemptResult,
} from "../../lib/assessments";

const REFRESH_MS = 6_000;

/**
 * Who took it, how they did, and what they are weak at.
 *
 * Refreshes on a timer while open rather than only on WebSocket events: the
 * instructor watching this screen mid-test cares about being current, and a
 * missed event would otherwise leave a stale table with no way to tell.
 */
export function AssessmentResults({
  assessmentId,
  onClose,
}: {
  assessmentId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getResults(assessmentId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [assessmentId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function handleEvaluate(attempt: AttemptResult) {
    setEvaluating(attempt.id);
    try {
      const { summary } = await evaluateAttempt(attempt.id, Boolean(attempt.aiSummary));
      setData((current) =>
        current
          ? {
              ...current,
              attempts: current.attempts.map((a) =>
                a.id === attempt.id ? { ...a, aiSummary: summary } : a
              ),
            }
          : current
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEvaluating(null);
    }
  }

  const assessment = data?.assessment;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:static print:block print:bg-transparent print:p-0">
      <div
        id="assessment-report"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-wkai-border bg-wkai-surface shadow-2xl print:max-h-none print:w-full print:max-w-none print:border-0 print:shadow-none"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-wkai-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-wkai-text">
              {assessment?.title ?? "Results"}
            </h2>
            <p className="text-xs text-wkai-text-dim">
              {assessment
                ? `${assessment.kind === "test" ? "Test" : "Quiz"} · ${assessment.questionCount} question${assessment.questionCount === 1 ? "" : "s"} · ${data?.attempts.length ?? 0} student${(data?.attempts.length ?? 0) === 1 ? "" : "s"}`
                : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button className="btn-secondary btn-sm" onClick={() => window.print()}>
              <Printer size={14} />
              Save as PDF
            </button>
            <button onClick={onClose} aria-label="Close" className="text-wkai-text-dim hover:text-wkai-text">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5 print:overflow-visible">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          {/* What the room as a whole did not understand. */}
          {data && data.topics.length > 0 && (
            <section className="space-y-2 rounded-xl border border-wkai-border bg-wkai-bg p-4">
              <p className="text-xs font-semibold text-wkai-text">Weakest topics across the room</p>
              <div className="space-y-1.5">
                {data.topics.slice(0, 5).map((t) => {
                  const pct = Math.round((t.correct / Math.max(t.total, 1)) * 100);
                  return (
                    <div key={t.topic} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-xs text-wkai-text">{t.topic}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-wkai-surface2">
                        <div
                          className={clsx(
                            "h-full rounded-full",
                            pct < 50 ? "bg-danger" : pct < 80 ? "bg-warn" : "bg-ok"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-wkai-text-dim">
                        {pct}% right
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {data?.attempts.length === 0 && (
            <p className="py-10 text-center text-xs text-wkai-text-dim">
              Nobody has started this yet.
            </p>
          )}

          {data?.attempts.map((attempt) => {
            const pct =
              attempt.score !== null && attempt.maxScore
                ? Math.round((attempt.score / attempt.maxScore) * 100)
                : null;
            const open = expanded === attempt.id;

            return (
              <section
                key={attempt.id}
                className="overflow-hidden rounded-xl border border-wkai-border"
              >
                <button
                  onClick={() => setExpanded(open ? null : attempt.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-wkai-surface2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-wkai-text">
                      {attempt.studentName}
                    </p>
                    <p className="text-[11px] text-wkai-text-dim">
                      {attempt.status === "in_progress"
                        ? "Still working"
                        : attempt.status === "locked"
                          ? "Locked — left the test"
                          : "Submitted"}
                      {attempt.violationCount > 0 && ` · ${attempt.violationCount} flag${attempt.violationCount === 1 ? "" : "s"}`}
                    </p>
                  </div>

                  {attempt.violationCount > 0 && (
                    <AlertTriangle size={14} className="shrink-0 text-warn" />
                  )}
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                      pct === null
                        ? "bg-wkai-surface2 text-wkai-text-dim"
                        : pct < 50
                          ? "bg-danger/15 text-danger"
                          : pct < 80
                            ? "bg-warn/15 text-warn"
                            : "bg-ok/15 text-ok"
                    )}
                  >
                    {pct === null ? "—" : `${attempt.score}/${attempt.maxScore}`}
                  </span>
                  <ChevronDown
                    size={14}
                    className={clsx("shrink-0 text-wkai-text-dim transition-transform", open && "rotate-180")}
                  />
                </button>

                {(open || attempt.aiSummary) && (
                  <div className="space-y-3 border-t border-wkai-border px-4 py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-wkai-text">AI read</p>
                        <p className="text-xs leading-relaxed text-wkai-text-dim">
                          {attempt.aiSummary ?? "Not generated yet."}
                        </p>
                      </div>
                      <button
                        className="btn-ghost btn-sm shrink-0 border border-wkai-border print:hidden"
                        onClick={() => void handleEvaluate(attempt)}
                        disabled={evaluating === attempt.id}
                      >
                        {evaluating === attempt.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Sparkles size={13} />
                        )}
                        {attempt.aiSummary ? "Redo" : "Evaluate"}
                      </button>
                    </div>

                    {open && (
                      <ol className="space-y-2">
                        {attempt.answers.map((a) => (
                          <li
                            key={a.questionId}
                            className={clsx(
                              "rounded-lg border p-2.5",
                              a.isCorrect
                                ? "border-ok/25 bg-ok/5"
                                : "border-danger/25 bg-danger/5"
                            )}
                          >
                            <p className="text-xs text-wkai-text">{a.prompt}</p>
                            <p className="mt-1 text-[11px] text-wkai-text-dim">
                              Chose:{" "}
                              {a.selectedIndex === null ? "no answer" : a.options[a.selectedIndex]}
                              {!a.isCorrect && ` · Correct: ${a.options[a.correctIndex]}`}
                              {a.topic && ` · ${a.topic}`}
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}

                    {open && attempt.events.length > 0 && (
                      <div className="rounded-lg border border-warn/30 bg-warn/10 p-2.5">
                        <p className="text-[11px] font-semibold text-warn">Proctoring flags</p>
                        <ul className="mt-1 space-y-0.5">
                          {attempt.events.map((e, i) => (
                            <li key={i} className="text-[11px] text-warn">
                              {new Date(e.at).toLocaleTimeString()} — {e.kind}
                              {e.detail ? `: ${e.detail}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
