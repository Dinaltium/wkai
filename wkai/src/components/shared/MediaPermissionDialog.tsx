import { Camera, Mic, ShieldAlert } from "lucide-react";
import {
  answerMediaPermission,
  useMediaPermissionStore,
} from "../../session/mediaPermission";

const COPY = {
  microphone: {
    icon: Mic,
    title: "WKAI needs your microphone",
    denied: "Microphone access is blocked",
    fix: "Windows Settings → Privacy & security → Microphone, then allow desktop apps and restart WKAI.",
  },
  camera: {
    icon: Camera,
    title: "WKAI needs your camera",
    denied: "Camera access is blocked",
    fix: "Windows Settings → Privacy & security → Camera, then allow desktop apps and restart WKAI.",
  },
} as const;

/**
 * The consent step for microphone and camera. A refusal used to be a line in
 * the activity log, which nobody reads mid-workshop — this states the cost of
 * saying no and says how to undo it.
 */
export function MediaPermissionDialog() {
  const pending = useMediaPermissionStore((s) => s.pending);
  if (!pending) return null;

  const copy = COPY[pending.kind];
  const Icon = pending.phase === "denied" ? ShieldAlert : copy.icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={copy.title}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-wkai-border bg-wkai-surface p-6 shadow-2xl"
      >
        <div className="space-y-2 text-center">
          <div
            className={
              pending.phase === "denied"
                ? "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/15"
                : "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15"
            }
          >
            <Icon
              size={22}
              className={pending.phase === "denied" ? "text-danger" : "text-accent-text"}
            />
          </div>
          <h2 className="text-base font-semibold text-wkai-text">
            {pending.phase === "denied" ? copy.denied : copy.title}
          </h2>
          <p className="text-sm text-wkai-text-dim">{pending.reason}</p>
        </div>

        {pending.phase === "denied" ? (
          <>
            <div className="rounded-lg border border-wkai-border bg-wkai-bg p-3">
              <p className="text-xs leading-relaxed text-wkai-text-dim">{copy.fix}</p>
              {pending.error && (
                <p className="mt-2 break-words font-mono text-[10px] text-wkai-text-dim">
                  {pending.error}
                </p>
              )}
            </div>
            <button
              className="btn-primary w-full justify-center"
              onClick={() => answerMediaPermission(false)}
            >
              Continue without it
            </button>
          </>
        ) : (
          <>
            <p className="rounded-lg border border-wkai-border bg-wkai-bg p-3 text-xs leading-relaxed text-wkai-text-dim">
              Your operating system will ask next. Nothing is captured until you allow it there
              too, and you can mute at any time from the session bar.
            </p>
            <div className="flex gap-3">
              <button
                className="btn-ghost flex-1 justify-center border border-wkai-border"
                onClick={() => answerMediaPermission(false)}
              >
                Not now
              </button>
              <button
                className="btn-primary flex-1 justify-center"
                onClick={() => answerMediaPermission(true)}
              >
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
