import { useStore } from "../../store";
import { Monitor } from "lucide-react";

export function ScreenPreview() {
  const { screenPreview, screenPreviewTs, session } = useStore();

  if (!screenPreview) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-wkai-text-dim">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
          <Monitor size={28} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-wkai-text">Screen preview not available</p>
          <p className="text-xs text-wkai-text-dim max-w-xs text-center">
            {session?.status === "ended"
              ? "The session has ended. Guide blocks and files remain available."
              : "Screen sharing will be enabled in a future update. Guide blocks and AI assistance work normally."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
          <p className="text-xs font-medium text-wkai-text">Live Screen</p>
        </div>
        {screenPreviewTs && (
          <p className="text-xs text-wkai-text-dim">
            {new Date(screenPreviewTs).toLocaleTimeString()}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto flex items-start justify-center p-3">
        <img
          src={`data:image/jpeg;base64,${screenPreview}`}
          alt="Instructor screen"
          className="rounded-lg border border-wkai-border max-w-full h-auto shadow-lg"
        />
      </div>
    </div>
  );
}
