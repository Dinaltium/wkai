import { useEffect, useState } from "react";
import { Share2, File, Loader2, FolderOpen } from "lucide-react";
import { useAppStore } from "../../store";
import { listWatchedFiles, shareFile } from "../../lib/tauri";
import type { WatchedFile, WsEventType } from "../../types";
import { clsx } from "clsx";

interface Props {
  sessionId: string;
  send: <T>(type: WsEventType, payload: T) => void;
}

export function FileSharePanel({ sessionId, send }: Props) {
  const { settings, sharedFiles, watchedFiles, setWatchedFiles } = useAppStore();
  const [files, setFiles] = useState<WatchedFile[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"folder" | "shared">("folder");

  useEffect(() => {
    if (!settings.watchFolder) return;
    listWatchedFiles(settings.watchFolder)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [settings.watchFolder]);

  async function handleShare(file: WatchedFile) {
    setSharing(file.path);
    try {
      const url = await shareFile(sessionId, file.path, settings.backendUrl);
      send("file-shared", { name: file.name, url, sessionId });
    } catch (err) {
      console.error("Share failed", err);
    } finally {
      setSharing(null);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex border-b border-wkai-border">
        {(["folder", "shared"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "flex-1 py-2 text-xs font-medium transition-colors",
              activeTab === tab
                ? "border-b-2 border-indigo-400 text-indigo-400"
                : "text-wkai-text-dim hover:text-wkai-text"
            )}
          >
            {tab === "folder" ? "Files" : `Shared (${sharedFiles.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-1.5">
        {activeTab === "folder" ? (
          <>
            {!settings.watchFolder ? (
              <EmptyState
                icon={<FolderOpen size={20} />}
                message="Set a watch folder in Settings"
              />
            ) : files.length === 0 ? (
              <EmptyState
                icon={<File size={20} />}
                message="No files in folder"
              />
            ) : (
              files.map((f) => (
                <FileRow
                  key={f.path}
                  file={f}
                  sharing={sharing === f.path}
                  onShare={() => handleShare(f)}
                  formatSize={formatSize}
                />
              ))
            )}
          </>
        ) : (
          <>
            {sharedFiles.length === 0 ? (
              <EmptyState
                icon={<Share2 size={20} />}
                message="No files shared yet"
              />
            ) : (
              sharedFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-lg bg-wkai-bg p-2 text-xs"
                >
                  <File size={13} className="text-indigo-400 shrink-0" />
                  <span className="truncate text-wkai-text flex-1">{f.name}</span>
                  <span className="text-wkai-text-dim shrink-0">
                    {new Date(f.sharedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  sharing,
  onShare,
  formatSize,
}: {
  file: WatchedFile;
  sharing: boolean;
  onShare: () => void;
  formatSize: (n: number) => string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-wkai-bg p-2 group">
      <File size={13} className="text-wkai-text-dim shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-wkai-text truncate">{file.name}</p>
        <p className="text-xs text-wkai-text-dim">
          {formatSize(file.sizeBytes)}
        </p>
      </div>
      <button
        onClick={onShare}
        disabled={sharing}
        className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded px-1.5 py-1 text-xs text-indigo-400 hover:bg-indigo-500/10 transition-all disabled:opacity-50"
      >
        {sharing ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Share2 size={12} />
        )}
        Share
      </button>
    </div>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-wkai-text-dim">
      {icon}
      <p className="text-xs text-center">{message}</p>
    </div>
  );
}