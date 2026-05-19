import { Monitor } from "lucide-react";

interface PlatformBadgeProps {
  platform: string;
  backend: string;
}

export function PlatformBadge({ platform, backend }: PlatformBadgeProps) {
  const platformLabel =
    platform === "windows"
      ? "Windows"
      : platform === "linux"
      ? "Linux"
      : platform === "macos"
      ? "macOS"
      : "Unknown";

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-wkai-surface border border-wkai-border text-xs">
      <Monitor size={12} className="text-indigo-400" />
      <span className="text-wkai-text">{platformLabel}</span>
      <span className="text-wkai-text-dim">·</span>
      <span className="text-indigo-400 font-mono">{backend}</span>
    </div>
  );
}
