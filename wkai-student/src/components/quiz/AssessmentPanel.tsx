import { useCallback, useEffect, useState } from "react";
import { ClipboardList, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store";
import { fetchLiveAssessments, type LiveAssessment } from "../../lib/assessments";
import { AssessmentRunner } from "./AssessmentRunner";

/**
 * Everything a student can be asked to take. Lists what is open right now and
 * hands off to the runner; the runner owns the attempt, the proctoring and the
 * result, so nothing here has to know how a test differs from a quiz.
 */
export function AssessmentPanel() {
  const session = useStore((s) => s.session);
  const [assessments, setAssessments] = useState<LiveAssessment[]>([]);
  const [active, setActive] = useState<LiveAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.id) return;
    try {
      setAssessments(await fetchLiveAssessments(session.id));
      setError(null);
    } catch {
      setError("Could not load quizzes. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [session?.id]);

  useEffect(() => {
    void load();
    // The socket says when one opens or closes; this is the refetch it triggers.
    const onChange = () => void load();
    window.addEventListener("wkai:assessment-changed", onChange);
    return () => window.removeEventListener("wkai:assessment-changed", onChange);
  }, [load]);

  if (active) {
    return (
      <AssessmentRunner
        assessment={active}
        onExit={() => {
          setActive(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-3">
        {loading && (
          <p className="flex items-center justify-center gap-2 py-16 text-xs text-wkai-text-dim">
            <Loader2 size={14} className="animate-spin" />
            Checking for open quizzes
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {!loading && assessments.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-20 text-center text-wkai-text-dim">
            <ClipboardList size={20} />
            <p className="text-sm font-medium text-wkai-text">Nothing to take right now</p>
            <p className="max-w-xs text-xs leading-relaxed">
              When your instructor opens a quiz or a test it appears here straight away.
            </p>
          </div>
        )}

        {assessments.map((a) => (
          <article
            key={a.id}
            className="space-y-3 rounded-2xl border border-wkai-border bg-wkai-surface p-4"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-wkai-text">{a.title}</h3>
                <p className="text-xs text-wkai-text-dim">
                  {a.kind === "test" ? "Test" : "Quiz"}
                  {a.source !== "kahoot" && ` · ${a.questionCount} question${a.questionCount === 1 ? "" : "s"}`}
                  {a.timeLimitSeconds ? ` · ${Math.round(a.timeLimitSeconds / 60)} min` : ""}
                  {!a.countsTowardScore && " · practice, not scored"}
                </p>
              </div>
              <span
                className={clsx(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  a.kind === "test" ? "bg-warn/15 text-warn" : "bg-accent/15 text-accent-text"
                )}
              >
                {a.kind === "test" ? "Graded" : "Quiz"}
              </span>
            </div>

            {a.proctored && (
              <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
                <ShieldAlert size={13} className="mt-px shrink-0" />
                This one is proctored. It runs fullscreen — leaving fullscreen or switching away
                submits your answers and tells your instructor.
              </p>
            )}

            {a.source === "kahoot" && a.kahootUrl ? (
              <a
                href={a.kahootUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full justify-center"
              >
                <ExternalLink size={14} />
                Open in Kahoot
              </a>
            ) : (
              <button className="btn-primary w-full justify-center" onClick={() => setActive(a)}>
                Start {a.kind === "test" ? "test" : "quiz"}
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
