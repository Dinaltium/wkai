import { useState } from "react";
import { useStore } from "../../store";
import {
  Bug,
  Loader2,
  Terminal,
  AlertTriangle,
  Info,
  Copy,
  Check,
  RotateCcw,
  LifeBuoy,
} from "lucide-react";
import { clsx } from "clsx";
import type { ErrorResolution } from "../../types";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function ErrorHelper({ send }: Props) {
  const { session, studentId, resolution, setResolution, errorDiagnosing, setErrorDiagnosing } = useStore();
  const [errorText, setErrorText] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleSubmit() {
    if (!errorText.trim() || errorDiagnosing) return;
    setResolution(null);
    setErrorDiagnosing(true);

    // Send via WebSocket — backend will respond with error-resolved event
    send("student-error", {
      sessionId: session?.id,
      studentId,
      errorMessage: errorText.trim(),
    });

    // Fallback timeout — if WS response doesn't arrive in 15s, call REST directly
    const timeout = setTimeout(async () => {
      try {
        const { diagnoseError } = await import("../../lib/api");
        const result = await diagnoseError(errorText.trim());
        setResolution(result);
      } catch {
        setResolution({
          diagnosis: "Could not reach the AI service. Check your connection and try again.",
          fixCommand: null,
          fixSteps: null,
          isSetupError: false,
          severity: "blocking",
        });
      } finally {
        setErrorDiagnosing(false);
      }
    }, 15_000);

    // The WS handler in the store will call setResolution and setErrorDiagnosing(false)
    // We need to clean up the timeout when that happens
    const unsub = useStore.subscribe((state) => {
      if (state.resolution !== null || !state.errorDiagnosing) {
        clearTimeout(timeout);
        setErrorDiagnosing(false);
        unsub();
      }
    });
  }

  function handleReset() {
    setErrorText("");
    setResolution(null);
  }

  function copyFix(text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Error helper</h2>
          <p className="panel-sub">
            Paste the red text from your terminal. You get a plain-English cause and a fix.
          </p>
        </div>
      </div>

      <div className="scroll-area flex flex-col gap-4 p-3 sm:p-4">
        {!resolution && !errorDiagnosing && (
          <div className="space-y-3">
            <label className="sr-only" htmlFor="error-input">Terminal output</label>
            <textarea
              id="error-input"
              className="input h-40 resize-none font-mono text-xs leading-relaxed sm:h-44"
              placeholder={"Traceback (most recent call last):\n  File \"main.py\", line 3 ..."}
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
              spellCheck={false}
            />
            <button
              className="btn-primary w-full"
              onClick={handleSubmit}
              disabled={!errorText.trim()}
            >
              <Bug size={15} /> Diagnose this error
            </button>
            <p className="text-xs leading-relaxed text-wkai-text-dim">
              Nothing you paste here is shown to the rest of the class.
            </p>
          </div>
        )}

        {errorDiagnosing && <DiagnosingState />}

        {resolution && !errorDiagnosing && (
          <ResolutionCard
            resolution={resolution}
            onReset={handleReset}
            onCopy={copyFix}
            copied={copied}
          />
        )}
      </div>
    </div>
  );
}

/** Skeleton rather than a bare spinner: it shows what is about to arrive. */
function DiagnosingState() {
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium text-wkai-text">
        <Loader2 size={15} className="animate-spin text-accent-text" />
        Reading your error…
      </p>
      {[0, 1].map((i) => (
        <div key={i} className="card space-y-2.5 p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-wkai-surface2" />
          <div className="h-3 w-full animate-pulse rounded bg-wkai-surface2" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-wkai-surface2" />
        </div>
      ))}
    </div>
  );
}

// ─── Resolution display ───────────────────────────────────────────────────────

function ResolutionCard({
  resolution,
  onReset,
  onCopy,
  copied,
}: {
  resolution: ErrorResolution;
  onReset: () => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const severity = {
    blocking: { Icon: AlertTriangle, className: "text-danger", label: "Blocking" },
    warning: { Icon: AlertTriangle, className: "text-warn", label: "Warning" },
    info: { Icon: Info, className: "text-info", label: "Note" },
  }[resolution.severity];

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="card space-y-2 p-4">
        <div className="flex items-center gap-2">
          <severity.Icon size={15} className={clsx("shrink-0", severity.className)} />
          <span className={clsx("text-xs font-semibold", severity.className)}>{severity.label}</span>
          {resolution.isSetupError && (
            <span className="badge ml-auto bg-warn/15 text-warn">Setup issue</span>
          )}
        </div>
        <p className="max-w-[70ch] text-sm leading-relaxed text-wkai-text">{resolution.diagnosis}</p>
      </div>

      {resolution.fixCommand && (
        <div className="overflow-hidden rounded-xl border border-ok/30 bg-ok/5">
          <div className="flex items-center justify-between gap-2 border-b border-ok/20 px-3 py-2 sm:px-4">
            <span className="flex items-center gap-2 text-xs font-semibold text-ok">
              <Terminal size={13} />
              Run this
            </span>
            <button
              onClick={() => onCopy(resolution.fixCommand!)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ok transition-colors hover:bg-ok/10"
            >
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <pre className="overflow-x-auto px-3 py-3 font-mono text-sm text-wkai-text sm:px-4">
            {resolution.fixCommand}
          </pre>
        </div>
      )}

      {resolution.fixSteps && resolution.fixSteps.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-wkai-text">Steps to fix</h3>
          <ol className="space-y-2.5">
            {resolution.fixSteps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-text">
                  {i + 1}
                </span>
                <span className="leading-relaxed text-wkai-text">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-wkai-border bg-wkai-surface px-3 py-3 text-xs leading-relaxed text-wkai-text-dim">
        <LifeBuoy size={14} className="mt-0.5 shrink-0 text-wkai-text-dim" />
        Still stuck after trying this? Post it in Q&amp;A — your instructor sees it there.
      </p>

      <button className="btn-outline w-full" onClick={onReset}>
        <RotateCcw size={13} />
        Diagnose another error
      </button>
    </div>
  );
}
