import { Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Session } from "../../types";

export function RoomInfo({ session }: { session: Session }) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(session.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        Room Code
      </p>
      <div className="flex items-center justify-between rounded-lg bg-wkai-bg border border-wkai-border px-3 py-2">
        <span className="font-mono text-2xl font-bold tracking-widest text-indigo-400">
          {session.roomCode}
        </span>
        <button
          onClick={copyCode}
          className="text-wkai-text-dim hover:text-wkai-text transition-colors"
          title="Copy room code"
        >
          {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
        </button>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-wkai-text truncate" title={session.workshopTitle}>
          {session.workshopTitle}
        </p>
        <p className="text-xs text-wkai-text-dim">{session.instructorName}</p>
      </div>
    </div>
  );
}
