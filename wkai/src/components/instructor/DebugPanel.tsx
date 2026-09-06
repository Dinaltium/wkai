import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store";
import { Check, Copy, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import type { DebugLogLevel } from "../../types";

const LEVELS: DebugLogLevel[] = ["info", "success", "warn", "error"];

const LEVEL_STYLE: Record<DebugLogLevel, string> = {
  info: "text-wkai-text-dim",
  success: "text-ok",
  warn: "text-warn",
  error: "text-danger",
};

const LEVEL_PREFIX: Record<DebugLogLevel, string> = {
  info: "INFO",
  success: "OK",
  warn: "WARN",
  error: "ERR",
};

export function DebugPanel() {
  const {
    debugLogs,
    clearDebugLogs,
    setDebugPanelOpen,
    recording,
    session,
    streamingToStudents,
    studentCount,
    sharedDisplayStream,
  } = useAppStore();

  const [filter, setFilter] = useState<DebugLogLevel | "all">("all");
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const counts = useMemo(() => {
    const c: Record<DebugLogLevel, number> = { info: 0, success: 0, warn: 0, error: 0 };
    for (const log of debugLogs) c[log.level] += 1;
    return c;
  }, [debugLogs]);

  const visible = filter === "all" ? debugLogs : debugLogs.filter((l) => l.level === filter);

  // Follow the tail only while the reader is already at the tail — otherwise
  // reading back through an error is impossible while events keep arriving.
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visible.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function copyAll() {
    const text = visible
      .map((l) => `${l.timestamp} ${LEVEL_PREFIX[l.level].padEnd(4)} ${l.message}`)
      .join("\n");
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <aside
      aria-label="Activity log"
      className="fixed bottom-0 right-0 top-0 z-overlay flex w-80 flex-col border-l border-wkai-border bg-wkai-bg shadow-2xl animate-fade-in"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-wkai-border px-3 py-2">
        <span className="text-xs font-semibold text-wkai-text">Activity log</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={copyAll}
            disabled={visible.length === 0}
            className="btn-ghost btn-icon h-7 w-7 disabled:opacity-30"
            title="Copy these lines"
            aria-label="Copy these lines"
          >
            {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
          </button>
          <button
            onClick={clearDebugLogs}
            disabled={debugLogs.length === 0}
            className="btn-ghost btn-icon h-7 w-7 disabled:opacity-30"
            title="Clear the log"
            aria-label="Clear the log"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setDebugPanelOpen(false)}
            className="btn-ghost btn-icon h-7 w-7"
            title="Close the log"
            aria-label="Close the log"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* What is actually running right now. */}
      <div className="shrink-0 space-y-1 border-b border-wkai-border px-3 py-2.5">
        <StatusRow label="Backend socket" value={session ? "Connected" : "Not connected"} ok={!!session} />
        <StatusRow
          label="Capture source"
          value={sharedDisplayStream ? "Active" : "None selected"}
          ok={!!sharedDisplayStream}
        />
        <StatusRow
          label="Presenting"
          value={streamingToStudents ? "Yes" : "No"}
          ok={streamingToStudents}
        />
        <StatusRow
          label="Recording"
          value={recording.isRecording ? (recording.isPaused ? "Paused" : "Running") : "Stopped"}
          ok={recording.isRecording && !recording.isPaused}
        />
        <StatusRow label="Students online" value={String(studentCount)} ok={studentCount > 0} />
      </div>

      {/* Level filter, with counts so a silent error is still visible. */}
      <div className="flex shrink-0 gap-1 border-b border-wkai-border px-2 py-2">
        <FilterChip label="All" count={debugLogs.length} active={filter === "all"} onClick={() => setFilter("all")} />
        {LEVELS.map((level) => (
          <FilterChip
            key={level}
            label={LEVEL_PREFIX[level]}
            count={counts[level]}
            active={filter === level}
            tone={LEVEL_STYLE[level]}
            onClick={() => setFilter(level)}
          />
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="selectable min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2 font-mono text-xs"
      >
        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-wkai-text-dim">
            {debugLogs.length === 0
              ? "Nothing logged yet. Capture, streaming, transcription and recording all report here."
              : `No ${filter} entries.`}
          </p>
        ) : (
          visible.map((log) => (
            <div key={log.id} className={clsx("flex gap-2 leading-5", LEVEL_STYLE[log.level])}>
              <span className="shrink-0 text-wkai-text-dim/60">{log.timestamp}</span>
              <span className="w-8 shrink-0">{LEVEL_PREFIX[log.level]}</span>
              <span className="break-words">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}

function FilterChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10px] transition-colors",
        active ? "bg-wkai-surface2 text-wkai-text" : "text-wkai-text-dim hover:bg-wkai-surface",
        !active && tone
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-wkai-text-dim">{label}</span>
      <span className={clsx("flex items-center gap-1.5", ok ? "text-ok" : "text-wkai-text-dim")}>
        <span className={clsx("h-1.5 w-1.5 rounded-full", ok ? "bg-ok" : "bg-wkai-text-dim")} />
        {value}
      </span>
    </div>
  );
}
