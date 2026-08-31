import { useAppStore } from "../../store";
import { clsx } from "clsx";

export function ShareToggle() {
  const { streamingToStudents, setStreamingToStudents, settings, sessionAiSettings } = useAppStore();
  // Effective state: session override once initialized, global default before that.
  const autoSaving = sessionAiSettings?.saveLocalRecording ?? settings.saveLocalRecording;

  function handleToggle() {
    const next = !streamingToStudents;
    // Removed browser display capture request (wkai:request-stream)
    // We now rely solely on the Rust native capture pipeline.
    setStreamingToStudents(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        Screen Sharing
      </p>
      <div className="flex items-center justify-between p-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-wkai-text">Share</span>
          <span className="text-[10px] text-wkai-text-dim">Stream to students</span>
        </div>
        <button
          onClick={handleToggle}
          className={clsx(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
            streamingToStudents ? "bg-accent" : "bg-wkai-surface border border-wkai-border"
          )}
        >
          <span
            className={clsx(
              "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-lg ring-0 transition-transform",
              streamingToStudents ? "translate-x-[18px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>
      <p className="text-xs text-wkai-text-dim">
        {streamingToStudents
          ? "Students see a live preview of your screen."
          : "Students only receive guide blocks, not your screen."}
      </p>
      {/* Without this it silently writes every capture to disk with no other
          indicator anywhere in this view. Reflects the effective (session
          override, if set) state, not just the global default. */}
      {autoSaving && (
        <p className="text-[10px] text-amber-400 flex items-center gap-1">
          ● Auto-saving to disk this session
        </p>
      )}
    </div>
  );
}
