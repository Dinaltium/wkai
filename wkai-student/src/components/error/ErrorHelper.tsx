import { useState } from "react";
import { useStore } from "../../store";
import {
  Bug,
  Loader2,
  Terminal,
  CheckCircle,
  AlertTriangle,
  Info,
  Copy,
  Check,
  RotateCcw,
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
          diagnosis: "Could not reach the AI service. Please check your connection.",
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
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim">
          Error Helper
        </p>
        <p className="text-xs text-wkai-text-dim mt-0.5">
          Paste your terminal error — AI will diagnose and fix it.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-4">
        {/* Input area */}
        {!resolution && (
          <div className="space-y-3">
            <textarea
              className="input font-mono text-xs resize-none h-44 leading-relaxed"
              placeholder={`Paste your error here…\n\nExample:\nModuleNotFoundError: No module named 'numpy'\n  File "main.py", line 1, in <module>`}
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
              spellCheck={false}
            />
            <button
              className="btn-primary w-full justify-center"
              onClick={handleSubmit}
              disabled={!errorText.trim() || errorDiagnosing}
            >
              {errorDiagnosing ? (
                <><Loader2 size={14} className="animate-spin" /> Diagnosing…</>
              ) : (
                <><Bug size={14} /> Diagnose Error</>
              )}
            </button>
          </div>
        )}

        {/* Loading state */}
        {errorDiagnosing && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-wkai-text">Analysing error…</p>
            <p className="text-xs text-wkai-text-dim">
              AI is reading your error and finding a fix
            </p>
          </div>
        )}

        {/* Resolution card */}
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
  const SeverityIcon = {
    blocking: AlertTriangle,
    warning: AlertTriangle,
    info: Info,
  }[resolution.severity];

  const severityColor = {
    blocking: "text-red-400",
    warning: "text-amber-400",
    info: "text-sky-400",
  }[resolution.severity];

  return (
    <div className="space-y-3 animate-slide-up">
      {/* Diagnosis */}
      <div className="rounded-xl border border-wkai-border bg-wkai-surface p-4 space-y-2">
        <div className="flex items-center gap-2">
          <SeverityIcon size={14} className={severityColor} />
          <span className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim">
            Diagnosis
          </span>
          {resolution.isSetupError && (
            <span className="badge bg-amber-500/15 text-amber-400 ml-auto">
              Setup issue
            </span>
          )}
        </div>
        <p className="text-sm text-wkai-text leading-relaxed">
          {resolution.diagnosis}
        </p>
      </div>

      {/* Fix command */}
      {resolution.fixCommand && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-500/20">
            <div className="flex items-center gap-2">
              <Terminal size={13} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                Run this fix
              </span>
            </div>
            <button
              onClick={() => onCopy(resolution.fixCommand!)}
              className="flex items-center gap-1 text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors"
            >
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
          <pre className="px-4 py-3 text-sm font-mono text-emerald-300">
            {resolution.fixCommand}
          </pre>
        </div>
      )}

      {/* Multi-step fix */}
      {resolution.fixSteps && resolution.fixSteps.length > 0 && (
        <div className="rounded-xl border border-wkai-border bg-wkai-surface p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim mb-3">
            Steps to fix
          </p>
          <ol className="space-y-2">
            {resolution.fixSteps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">
                  {i + 1}
                </span>
                <span className="text-wkai-text leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Success indicator */}
      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
        <CheckCircle size={14} className="text-emerald-400 shrink-0" />
        <p className="text-xs text-emerald-300">
          If the fix doesn't work, ask your instructor for help.
        </p>
      </div>

      {/* Try another */}
      <button
        className="btn-ghost w-full justify-center border border-wkai-border text-xs"
        onClick={onReset}
      >
        <RotateCcw size={12} />
        Diagnose another error
      </button>
    </div>
  );
}
