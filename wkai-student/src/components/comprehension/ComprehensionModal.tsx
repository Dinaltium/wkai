import { useState } from "react";
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
    /* Backdrop */
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-wkai-border bg-wkai-surface shadow-2xl animate-slide-up">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-wkai-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/15">
            <Lock size={15} className="text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-wkai-text">
              Quick Check
            </p>
            <p className="text-xs text-wkai-text-dim">
              Answer correctly to continue
            </p>
          </div>
        </div>

        {/* Question */}
        <div className="px-5 pt-4 pb-3">
          <p className="text-sm font-medium text-wkai-text leading-relaxed mb-4">
            {pendingQuestion.question}
          </p>

          {/* Options */}
          <div className="space-y-2">
            {pendingQuestion.options.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrectOpt = i === pendingQuestion.correctIndex;

              let stateClass = "border-wkai-border bg-wkai-bg hover:border-wkai-text-dim";
              if (submitted) {
                if (isCorrectOpt) stateClass = "border-emerald-500 bg-emerald-500/10";
                else if (isSelected && !isCorrectOpt) stateClass = "border-red-500 bg-red-500/10";
                else stateClass = "border-wkai-border bg-wkai-bg opacity-50";
              } else if (isSelected) {
                stateClass = "border-indigo-400 bg-indigo-500/10";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={submitted}
                  className={clsx(
                    "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all",
                    stateClass
                  )}
                >
                  {/* Option letter */}
                  <span className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    isSelected && !submitted ? "border-indigo-400 text-indigo-400 bg-indigo-500/10" : "border-wkai-border text-wkai-text-dim"
                  )}>
                    {String.fromCharCode(65 + i)}
                  </span>

                  <span className="flex-1 text-wkai-text">{opt}</span>

                  {/* Result icon */}
                  {submitted && isCorrectOpt && (
                    <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                  )}
                  {submitted && isSelected && !isCorrectOpt && (
                    <XCircle size={16} className="text-red-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Explanation (shown after submit) */}
        {submitted && (
          <div className={clsx(
            "mx-5 mb-3 rounded-lg border px-4 py-3 text-xs leading-relaxed",
            correct
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : "border-red-500/30 bg-red-500/5 text-red-300"
          )}>
            <span className="font-semibold">{correct ? "✓ Correct! " : "✗ Not quite. "}</span>
            {pendingQuestion.explanation}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-wkai-border px-5 py-3">
          {!submitted ? (
            <button
              className="btn-primary flex-1 justify-center"
              onClick={handleSubmit}
              disabled={selected === null}
            >
              Submit Answer
            </button>
          ) : correct ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm font-medium text-emerald-400">
              <CheckCircle size={15} />
              Unlocking next content…
            </div>
          ) : (
            <button
              className="btn-ghost flex-1 justify-center border border-wkai-border"
              onClick={handleRetry}
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
