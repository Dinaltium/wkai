import { Eye, EyeOff } from "lucide-react";
import { useAppStore } from "../../store";
import { clsx } from "clsx";

export function ShareToggle() {
  const { streamingToStudents, setStreamingToStudents, sharedDisplayStream } = useAppStore();

  function handleToggle() {
    const next = !streamingToStudents;
    if (next && !sharedDisplayStream) {
      window.dispatchEvent(new Event("wkai:request-stream"));
    }
    setStreamingToStudents(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        Screen Sharing
      </p>
      <button
        onClick={handleToggle}
        className={clsx(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
          streamingToStudents
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
            : "border-wkai-border bg-wkai-bg text-wkai-text-dim hover:border-wkai-text-dim"
        )}
      >
        {streamingToStudents ? <Eye size={13} /> : <EyeOff size={13} />}
        {streamingToStudents ? "Sharing screen" : "Screen hidden from students"}
      </button>
      <p className="text-xs text-wkai-text-dim">
        {streamingToStudents
          ? "Students see a live preview of your screen."
          : "Students only receive guide blocks, not your screen."}
      </p>
    </div>
  );
}
