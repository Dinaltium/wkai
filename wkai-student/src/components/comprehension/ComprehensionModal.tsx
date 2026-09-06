import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { CheckCircle, XCircle, Lock } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function ComprehensionModal({ send }: Props) {
  const { pendingQuestion, setPendingQuestion, markAnswered } = useStore();
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // This is a gate, so it has no dismiss: keep focus inside instead of letting
  // Tab wander into the page behind it.
  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])");
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const nodes = dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input, [tabindex]:not([tabindex='-1'])"
      );
      if (!nodes.length) return;
      const list = Array.from(nodes);
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!pendingQuestion) return null;

  function handleSelect(i: number) {
    if (submitted) return;
    setSelected(i);
  }

  function handleSubmit() {
    if (selected === null || submitted) return;
    const isCorrect = selected === pendingQuestion!.correctIndex;
    setCorrect(isCorrect);
    setSubmitted(true);

    send("comprehension-answer", {
      questionId: pendingQuestion!.id,
      answerIndex: selected,
    });

    if (isCorrect) {
      markAnswered(pendingQuestion!.id);
      // Dismiss modal after a short celebration delay
      setTimeout(() => setPendingQuestion(null), 1800);
    }
  }

  function handleRetry() {
    setSelected(null);
    setSubmitted(false);
    setCorrect(null);
  }

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-title"
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-wkai-border bg-wkai-surface pb-safe shadow-2xl animate-slide-up sm:rounded-2xl sm:pb-0"
      >
        <div className="flex items-center gap-3 border-b border-wkai-border px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15">
            <Lock size={15} className="text-accent-text" />
          </span>
          <div>
            <p id="check-title" className="text-sm font-semibold text-wkai-text">Quick check</p>
            <p className="text-xs text-wkai-text-dim">Answer correctly to keep going</p>
          </div>
        </div>

        <div className="px-4 pb-3 pt-4 sm:px-5">
          <p className="mb-4 text-sm font-medium leading-relaxed text-wkai-text">
            {pendingQuestion.question}
          </p>

          <div className="space-y-2">
            {pendingQuestion.options.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrectOpt = i === pendingQuestion.correctIndex;

              let stateClass = "border-wkai-border bg-wkai-bg hover:border-wkai-text-dim";
              if (submitted) {
                if (isCorrectOpt) stateClass = "border-ok bg-ok/10";
                else if (isSelected) stateClass = "border-danger bg-danger/10";
                else stateClass = "border-wkai-border bg-wkai-bg opacity-60";
              } else if (isSelected) {
                stateClass = "border-accent bg-accent/10";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={submitted}
                  aria-pressed={isSelected}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition-colors",
                    stateClass
                  )}
                  style={{ minHeight: "2.75rem" }}
                >
                  <span
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      isSelected && !submitted
                        ? "border-accent bg-accent/10 text-accent-text"
                        : "border-wkai-border text-wkai-text-dim"
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>

                  <span className="flex-1 leading-relaxed text-wkai-text">{opt}</span>

                  {submitted && isCorrectOpt && <CheckCircle size={17} className="shrink-0 text-ok" />}
                  {submitted && isSelected && !isCorrectOpt && (
                    <XCircle size={17} className="shrink-0 text-danger" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {submitted && (
          <div
            aria-live="polite"
            className={clsx(
              "mx-4 mb-3 rounded-lg border px-3.5 py-3 text-xs leading-relaxed sm:mx-5",
              correct ? "border-ok/30 bg-ok/5 text-ok" : "border-danger/30 bg-danger/5 text-danger"
            )}
          >
            <span className="font-semibold">{correct ? "Correct. " : "Not quite. "}</span>
            <span className="text-wkai-text">{pendingQuestion.explanation}</span>
          </div>
        )}

        <div className="flex gap-2 border-t border-wkai-border px-4 py-3 sm:px-5">
          {!submitted ? (
            <button className="btn-primary flex-1" onClick={handleSubmit} disabled={selected === null}>
              Submit answer
            </button>
          ) : correct ? (
            <p className="flex flex-1 items-center justify-center gap-2 text-sm font-medium text-ok">
              <CheckCircle size={15} />
              Unlocking the next step…
            </p>
          ) : (
            <button className="btn-outline flex-1" onClick={handleRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
