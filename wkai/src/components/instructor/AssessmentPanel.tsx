import { useCallback, useEffect, useState } from "react";
import { BarChart3, ClipboardList, Play, Plus, Square, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import {
  closeAssessment,
  deleteAssessment,
  launchAssessment,
  listAssessments,
  type Assessment,
  type AssessmentKind,
} from "../../lib/assessments";
import { useAppStore } from "../../store";
import { AssessmentEditor } from "./AssessmentEditor";
import { AssessmentResults } from "./AssessmentResults";

/**
 * The instructor's quiz and test surface. Everything about an assessment
 * happens here — write it, launch it, watch it, read the results — because
 * splitting authoring from monitoring means leaving the room mid-test to see
 * how it is going.
 */
export function AssessmentPanel() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [editorKind, setEditorKind] = useState<AssessmentKind | null>(null);
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const addDebugLog = useAppStore((s) => s.addDebugLog);

  const load = useCallback(async () => {
    try {
      const { assessments: list } = await listAssessments();
      setAssessments(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Student activity arrives on the instructor socket; refresh so the "live"
  // row's counts are not stale by the time the instructor looks.
  useEffect(() => {
    const onActivity = () => void load();
    window.addEventListener("wkai:assessment-activity", onActivity);
    return () => window.removeEventListener("wkai:assessment-activity", onActivity);
  }, [load]);

  async function act(id: string, action: "launch" | "close" | "delete") {
    setBusy(id);
    setError(null);
    try {
      if (action === "launch") {
        const { assessment } = await launchAssessment(id);
        addDebugLog(`"${assessment.title}" is live for students`, "success");
      } else if (action === "close") {
        const { assessment } = await closeAssessment(id);
        addDebugLog(`"${assessment.title}" closed — everything open was submitted`, "info");
      } else {
        await deleteAssessment(id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-semibold text-wkai-text">Quizzes &amp; tests</p>
        <div className="flex gap-1">
          <button className="btn-ghost btn-sm border border-wkai-border" onClick={() => setEditorKind("quiz")}>
            <Plus size={13} />
            Quiz
          </button>
          <button className="btn-ghost btn-sm border border-wkai-border" onClick={() => setEditorKind("test")}>
            <Plus size={13} />
            Test
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
            {error}
          </p>
        )}

        {assessments.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-wkai-text-dim">
            <ClipboardList size={18} />
            <p className="text-xs">No quizzes or tests yet</p>
            <p className="max-w-[15rem] text-[11px] leading-relaxed">
              Write questions yourself, or have the AI draft them from what you have taught so far.
            </p>
          </div>
        )}

        {assessments.map((a) => (
          <div key={a.id} className="space-y-2 rounded-xl border border-wkai-border bg-wkai-bg p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-wkai-text">{a.title}</p>
                <p className="text-[11px] text-wkai-text-dim">
                  {a.kind === "test" ? "Test" : "Quiz"} ·{" "}
                  {a.source === "kahoot" ? "Kahoot" : `${a.questionCount} question${a.questionCount === 1 ? "" : "s"}`}
                  {a.proctored && " · proctored"}
                  {!a.countsTowardScore && " · practice"}
                </p>
              </div>
              <StatusChip status={a.status} />
            </div>

            <div className="flex flex-wrap gap-1">
              {a.status !== "closed" && (
                <button
                  className="btn-ghost btn-sm border border-wkai-border"
                  disabled={busy === a.id}
                  onClick={() => void act(a.id, a.status === "live" ? "close" : "launch")}
                >
                  {a.status === "live" ? <Square size={12} /> : <Play size={12} />}
                  {a.status === "live" ? "Close" : "Launch"}
                </button>
              )}
              <button
                className="btn-ghost btn-sm border border-wkai-border"
                onClick={() => setResultsFor(a.id)}
              >
                <BarChart3 size={12} />
                Results
              </button>
              {a.status === "draft" && (
                <button
                  className="btn-ghost btn-sm border border-wkai-border text-wkai-text-dim hover:text-danger"
                  disabled={busy === a.id}
                  onClick={() => void act(a.id, "delete")}
                  aria-label={`Delete ${a.title}`}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editorKind && (
        <AssessmentEditor
          kind={editorKind}
          onClose={() => setEditorKind(null)}
          onCreated={() => void load()}
        />
      )}
      {resultsFor && (
        <AssessmentResults assessmentId={resultsFor} onClose={() => setResultsFor(null)} />
      )}
    </div>
  );
}

function StatusChip({ status }: { status: Assessment["status"] }) {
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        status === "live" && "bg-ok/15 text-ok",
        status === "draft" && "bg-wkai-surface2 text-wkai-text-dim",
        status === "closed" && "bg-wkai-surface2 text-wkai-text-dim"
      )}
    >
      {status === "live" ? "Live" : status === "draft" ? "Draft" : "Closed"}
    </span>
  );
}
