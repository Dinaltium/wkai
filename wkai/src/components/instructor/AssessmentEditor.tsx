import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import {
  createAssessment,
  generateQuestions,
  type AssessmentKind,
  type AssessmentQuestion,
} from "../../lib/assessments";

type Source = "manual" | "ai" | "kahoot";

function blankQuestion(): AssessmentQuestion {
  return { prompt: "", options: ["", "", "", ""], correctIndex: 0, explanation: "", topic: "" };
}

/**
 * Authoring for both kinds. The difference between a quiz and a test is not a
 * different screen, it is different defaults: a test is proctored, scored and
 * usually linear; a quiz is none of those unless the instructor says so.
 */
export function AssessmentEditor({
  kind,
  onClose,
  onCreated,
}: {
  kind: AssessmentKind;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<Source>("manual");
  const [navigation, setNavigation] = useState<"linear" | "free">(kind === "test" ? "linear" : "free");
  const [proctored, setProctored] = useState(kind === "test");
  const [countsTowardScore, setCountsTowardScore] = useState(kind === "test");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("");
  const [kahootUrl, setKahootUrl] = useState("");
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([blankQuestion()]);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI generation settings
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [focus, setFocus] = useState("");

  function patchQuestion(index: number, patch: Partial<AssessmentQuestion>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const { questions: generated } = await generateQuestions({ count, kind, difficulty, focus });
      // Generated questions land in the same editor as hand-written ones on
      // purpose: the instructor reads and fixes them before anyone sees them.
      setQuestions(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await createAssessment({
        kind,
        title: title.trim() || (kind === "test" ? "Test" : "Quiz"),
        navigation,
        proctored,
        countsTowardScore,
        source,
        kahootUrl: source === "kahoot" ? kahootUrl.trim() : null,
        timeLimitSeconds: timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null,
        questions: source === "kahoot" ? [] : questions,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-wkai-border bg-wkai-surface shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-wkai-border px-5 py-3">
          <h2 className="text-sm font-semibold text-wkai-text">
            New {kind === "test" ? "test" : "quiz"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-wkai-text-dim hover:text-wkai-text">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-wkai-text">Title</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "test" ? "Week 3 assessment" : "Quick check"}
            />
          </div>

          {/* Where the questions come from */}
          <div className="flex gap-1 rounded-lg border border-wkai-border p-1">
            {(
              [
                { id: "manual", label: "Write questions" },
                { id: "ai", label: "Generate with AI" },
                { id: "kahoot", label: "Kahoot link" },
              ] as { id: Source; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSource(tab.id)}
                className={clsx(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  source === tab.id
                    ? "bg-accent/15 text-accent-text"
                    : "text-wkai-text-dim hover:text-wkai-text"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {source === "ai" && (
            <div className="space-y-3 rounded-xl border border-wkai-border bg-wkai-bg p-4">
              <p className="text-xs text-wkai-text-dim">
                Questions are written from what this session has actually taught. Nothing is saved
                until you save below — read them first.
              </p>
              <div className="flex gap-2">
                <label className="flex-1 space-y-1">
                  <span className="text-[11px] text-wkai-text-dim">How many</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="input text-xs"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <label className="flex-1 space-y-1">
                  <span className="text-[11px] text-wkai-text-dim">Difficulty</span>
                  <select
                    className="input text-xs"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
              </div>
              <input
                className="input text-xs"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Focus on… (optional, e.g. the async part)"
              />
              <button className="btn-secondary btn-sm" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generating ? "Writing questions…" : "Generate"}
              </button>
            </div>
          )}

          {source === "kahoot" && (
            <div className="space-y-2 rounded-xl border border-wkai-border bg-wkai-bg p-4">
              <label className="text-xs font-medium text-wkai-text">Kahoot game link or PIN</label>
              <input
                className="input"
                value={kahootUrl}
                onChange={(e) => setKahootUrl(e.target.value)}
                placeholder="https://kahoot.it/challenge/… or 123456"
              />
              <p className="text-[11px] leading-relaxed text-wkai-text-dim">
                WKAI shows this to every student as a launch button and records who opened it.
                Kahoot's own scores stay in Kahoot — syncing them needs Kahoot's paid partner API,
                which this build does not have.
              </p>
            </div>
          )}

          {source !== "kahoot" && (
            <div className="space-y-3">
              {questions.map((q, index) => (
                <div key={index} className="space-y-2 rounded-xl border border-wkai-border bg-wkai-bg p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-[11px] font-medium text-wkai-text-dim">
                      {index + 1}
                    </span>
                    <textarea
                      className="input min-h-[3rem] flex-1 text-xs"
                      value={q.prompt}
                      onChange={(e) => patchQuestion(index, { prompt: e.target.value })}
                      placeholder="Question"
                    />
                    <button
                      onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== index))}
                      className="mt-1 text-wkai-text-dim hover:text-danger"
                      aria-label={`Remove question ${index + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {q.options.map((option, oi) => (
                    <div key={oi} className="flex items-center gap-2 pl-5">
                      <input
                        type="radio"
                        name={`correct-${index}`}
                        checked={q.correctIndex === oi}
                        onChange={() => patchQuestion(index, { correctIndex: oi })}
                        aria-label={`Mark option ${oi + 1} correct`}
                      />
                      <input
                        className="input flex-1 text-xs"
                        value={option}
                        onChange={(e) =>
                          patchQuestion(index, {
                            options: q.options.map((o, i) => (i === oi ? e.target.value : o)),
                          })
                        }
                        placeholder={`Option ${oi + 1}`}
                      />
                    </div>
                  ))}

                  <div className="flex gap-2 pl-5">
                    <input
                      className="input flex-1 text-xs"
                      value={q.topic ?? ""}
                      onChange={(e) => patchQuestion(index, { topic: e.target.value })}
                      placeholder="Topic (used in the weakness report)"
                    />
                    <input
                      className="input flex-[2] text-xs"
                      value={q.explanation ?? ""}
                      onChange={(e) => patchQuestion(index, { explanation: e.target.value })}
                      placeholder="Why the answer is right (shown after a quiz)"
                    />
                  </div>
                </div>
              ))}

              <button
                className="btn-ghost btn-sm border border-wkai-border"
                onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}
              >
                <Plus size={14} />
                Add question
              </button>
            </div>
          )}

          {/* Rules */}
          <div className="space-y-2 rounded-xl border border-wkai-border p-4">
            <p className="text-xs font-semibold text-wkai-text">Rules</p>
            <Toggle
              label="One question at a time, no going back"
              hint="Answers lock as they are given."
              value={navigation === "linear"}
              onChange={(v) => setNavigation(v ? "linear" : "free")}
            />
            <Toggle
              label="Proctored (fullscreen)"
              hint="Leaving fullscreen or switching tabs submits and flags the attempt."
              value={proctored}
              onChange={setProctored}
            />
            <Toggle
              label="Counts toward the student's score"
              hint="Off for practice — you still see the results."
              value={countsTowardScore}
              onChange={setCountsTowardScore}
            />
            <label className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-wkai-text">Time limit (minutes)</span>
              <input
                type="number"
                min={0}
                className="input w-24 text-xs"
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                placeholder="none"
              />
            </label>
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-wkai-border px-5 py-3">
          <button className="btn-ghost btn-sm border border-wkai-border" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save {kind}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-xs text-wkai-text">{label}</span>
        <span className="text-[10px] text-wkai-text-dim">{hint}</span>
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
