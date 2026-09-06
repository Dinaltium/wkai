import { Check, X } from "lucide-react";
import { FramedWindowVideo } from "./FramedWindowVideo";

/**
 * High-fidelity video demonstrations of the features with cursor interaction
 * inside a framed desktop window, styled after aoagents.dev.
 */

export function GuideVisual() {
  return (
    <FramedWindowVideo
      src="/videos/wkai-feature-guide.mp4"
      title="wkai · Live AI Guide generation"
      badge="AI Notes"
    />
  );
}

export function ErrorVisual() {
  return (
    <FramedWindowVideo
      src="/videos/wkai-feature-qa.mp4"
      title="wkai · Private Student Q&A & AI Reply"
      badge="Instant Help"
    />
  );
}

export function CheckVisual() {
  const options = [
    { text: "It installs into the active environment", state: "right" as const },
    { text: "It installs system-wide, always", state: "wrong" as const },
    { text: "It only works inside a notebook", state: "idle" as const },
  ];

  return (
    <div className="card p-4">
      <p className="text-sm font-medium leading-relaxed text-wkai-text">
        Where does <span className="font-mono text-[13px]">pip install</span> put a package?
      </p>
      <div className="mt-3 space-y-2">
        {options.map((o) => (
          <div
            key={o.text}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              o.state === "right"
                ? "border-ok bg-ok/10 text-wkai-text"
                : o.state === "wrong"
                  ? "border-danger bg-danger/10 text-wkai-text"
                  : "border-wkai-border bg-wkai-bg text-wkai-text-dim"
            }`}
          >
            <span className="flex-1 leading-relaxed">{o.text}</span>
            {o.state === "right" && <Check size={15} className="shrink-0 text-ok" />}
            {o.state === "wrong" && <X size={15} className="shrink-0 text-danger" />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-wkai-text-dim">
        The guide stays locked until the answer is right.
      </p>
    </div>
  );
}

export function RoomVisual() {
  return (
    <FramedWindowVideo
      src="/videos/wkai-feature-files.mp4"
      title="wkai · Instant File Sharing & Live Session"
      badge="WebRTC & Files"
    />
  );
}
