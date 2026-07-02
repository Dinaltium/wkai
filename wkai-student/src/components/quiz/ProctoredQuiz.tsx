import { useState, type ReactNode } from "react";
import { ShieldAlert, Maximize2, Lock } from "lucide-react";
import { useProctoring, type ProctorViolation } from "../../hooks/useProctoring";

interface Props {
  title: string;
  /** The quiz body — rendered only while the proctored session is active. */
  children: ReactNode;
  /** Fired when the student violates (leaves fullscreen / switches tab). The
   *  parent should treat the attempt as submitted-and-locked. */
  onLocked: (kind: ProctorViolation) => void;
  /** Set false to run the quiz without proctoring (e.g. practice mode). */
  proctored?: boolean;
}

/**
 * Wraps a graded quiz in a browser-proctored session: a start gate that enters
 * fullscreen, the quiz body while compliant, and a hard lock screen on violation.
 * See useProctoring for the honest limits of browser anti-cheat.
 */
export function ProctoredQuiz({ title, children, onLocked, proctored = true }: Props) {
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState<ProctorViolation | null>(null);

  const { enterFullscreen, exitFullscreen } = useProctoring({
    enabled: proctored && started && !locked,
    onViolation: (kind) => {
      setLocked(kind);
      onLocked(kind);
    },
  });

  if (!proctored) return <>{children}</>;

  // Locked — the attempt is over.
  if (locked) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <Lock size={22} className="text-red-400" />
        </div>
        <p className="text-base font-semibold text-wkai-text">Test ended</p>
        <p className="max-w-xs text-sm text-wkai-text-dim">
          {locked === "fullscreen-exit"
            ? "You left fullscreen. Your answers were submitted and the test is locked."
            : "You switched away from the test window. Your answers were submitted and the test is locked."}
        </p>
      </div>
    );
  }

  // Start gate.
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-wkai-border bg-wkai-surface p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
          <ShieldAlert size={22} className="text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-wkai-text">{title}</p>
          <p className="max-w-sm text-sm text-wkai-text-dim">
            This is a proctored test. It opens in fullscreen. Leaving fullscreen,
            switching tabs, or minimising will end the test and submit your answers.
          </p>
        </div>
        <button
          className="btn-primary justify-center gap-2 px-6 py-2.5"
          onClick={async () => {
            const ok = await enterFullscreen();
            // Even if fullscreen is refused, start (violation detection still
            // catches tab-switch); but tell the user it's expected.
            if (!ok) console.warn("[proctoring] fullscreen request was blocked");
            setStarted(true);
          }}
        >
          <Maximize2 size={15} />
          Begin test
        </button>
      </div>
    );
  }

  // Active — render the quiz body. `exitFullscreen` is passed to children via
  // context of the parent (the parent calls it when the quiz completes normally).
  return (
    <div className="relative" data-proctored-active>
      {children}
      {/* The parent should call exitFullscreen() on normal completion; expose it
          through a well-known event to keep this shell prop-light. */}
      <button
        type="button"
        className="sr-only"
        data-proctor-finish
        onClick={() => exitFullscreen()}
      >
        finish
      </button>
    </div>
  );
}
