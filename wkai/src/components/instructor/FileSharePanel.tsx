import { useEffect, useRef, useState } from "react";
import { Share2, File, Loader2, FolderOpen, Upload } from "lucide-react";
import { useAppStore } from "../../store";
import { listWatchedFiles, shareFile } from "../../lib/tauri";
import type { WatchedFile, WsEventType } from "../../types";
import { clsx } from "clsx";

interface Props {
  sessionId: string;
  send: <T>(type: WsEventType, payload: T) => void;
}

export function FileSharePanel({ sessionId, send }: Props) {
  const { settings, sharedFiles, addDebugLog } = useAppStore();
  const [files, setFiles] = useState<WatchedFile[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"folder" | "shared">("folder");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function uploadSessionMaterial(file: File): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${settings.backendUrl}/api/files/upload-session-material`);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      const form = new FormData();
      form.append("file", file);
      form.append("sessionId", sessionId);
      xhr.send(form);
    });
  }

  async function handleUploadSelection(list: FileList | null) {
    if (!list || list.length === 0 || uploading) return;
    const selected = Array.from(list);
    setUploading(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const progressStart = Math.round((i / selected.length) * 100);
        setUploadProgress(progressStart);
        await uploadSessionMaterial(selected[i]);
      }
      setUploadProgress(100);
      addDebugLog(`Uploaded ${selected.length} session material file(s)`, "success");
      setActiveTab("shared");
    } catch (err) {
      addDebugLog(`Session material upload failed: ${String(err)}`, "error");
    } finally {
      setTimeout(() => setUploadProgress(0), 600);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      <div className="px-3 py-2 border-b border-wkai-border space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.pptx,.ppt,.docx,.txt,.zip,.py,.js,.ts"
          onChange={(e) => void handleUploadSelection(e.target.files)}
        />
        <button
          type="button"
          className="btn-ghost w-full justify-center border border-wkai-border text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? "Uploading..." : "Upload Files"}
        </button>
        {uploading && (
          <div className="h-1.5 rounded bg-wkai-border overflow-hidden">
            <div
              className="h-full bg-indigo-400 transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
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