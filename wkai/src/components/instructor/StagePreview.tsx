import { type RefObject } from "react";
import { MonitorUp } from "lucide-react";
import { clsx } from "clsx";
import type { CaptureStatusType } from "../../types/nativeCapture";

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  attachCanvas: (canvas: HTMLCanvasElement | null) => void;
  status: CaptureStatusType;
  sourceLabel: string | null;
  presenting: boolean;
  recording: boolean;
  onPickSource: () => void;
}

/**
 * The instructor's own view of what they are sending — the thing every call
 * app puts in the middle of the window, and the piece this app was missing:
 * the capture canvas used to be mounted 1px wide at opacity 0 purely to keep
 * `captureStream()` alive, so nobody could see whether the right window was
 * being shared until a student said something.
 *
 * The canvas stays mounted and composited in every state; the empty state is
 * layered over it rather than replacing it.
 */
export function StagePreview({
  canvasRef,
  attachCanvas,
  status,
  sourceLabel,
  presenting,
  recording,
  onPickSource,
}: Props) {
  const capturing = status === "capturing";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div
        className={clsx(
          "relative w-full max-w-5xl overflow-hidden rounded-xl border bg-black",
          capturing ? "border-wkai-border" : "border-dashed border-wkai-border"
        )}
        style={{ aspectRatio: "16 / 9" }}
      >
        <canvas
          ref={(el) => {
            (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
            attachCanvas(el);
          }}
          className={clsx("h-full w-full object-contain", !capturing && "opacity-0")}
        />

        {!capturing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-wkai-bg text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-wkai-border bg-wkai-surface">
              <MonitorUp size={24} className="text-wkai-text-dim" />
            </div>
            {status === "initializing" || status === "stopping" ? (
              <p className="text-sm text-wkai-text-dim">
                {status === "initializing" ? "Starting capture…" : "Stopping capture…"}
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-wkai-text">Nothing is being shared yet</p>
                  <p className="mx-auto max-w-sm text-xs leading-relaxed text-wkai-text-dim">
                    Pick a screen or a window. You will see exactly what your students see, right
                    here, before anything leaves your machine.
                  </p>
                </div>
                <button className="btn-secondary" onClick={onPickSource}>
                  <MonitorUp size={15} />
                  Choose what to share
                </button>
              </>
            )}
          </div>
        )}

        {/* Overlays: what is being shared, and whether it is actually going out. */}
        {capturing && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <span className="max-w-[60%] truncate rounded-md bg-black/70 px-2.5 py-1 text-xs text-zinc-100">
              {sourceLabel ?? "Capturing"}
            </span>
            <span className="flex items-center gap-2">
              {recording && (
                <span className="flex items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-danger">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                  REC
                </span>
              )}
              <span
                className={clsx(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
                  presenting ? "bg-ok/20 text-ok" : "bg-black/70 text-zinc-300"
                )}
              >
                <span
                  className={clsx(
                    "h-1.5 w-1.5 rounded-full",
                    presenting ? "animate-pulse bg-ok" : "bg-zinc-400"
                  )}
                />
                {presenting ? "Students are seeing this" : "Preview only — not sent"}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
