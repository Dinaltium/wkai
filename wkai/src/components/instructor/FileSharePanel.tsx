import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  Folder,
  FolderOpen,
  Globe,
  Link,
  Loader2,
  Share2,
  Upload,
} from "lucide-react";
import { useAppStore } from "../../store";
import { importFilesFromUrl, listWatchedFiles, shareFile, watchFolder } from "../../lib/tauri";
import type { ExplorerFileEntry, WatchedFile, WsEventType } from "../../types";
import { clsx } from "clsx";

interface Props {
  sessionId: string;
  send: <T>(type: WsEventType, payload: T) => void;
}

export function FileSharePanel({ sessionId, send }: Props) {
  const { settings, sharedFiles, addDebugLog } = useAppStore();
  const [folderFiles, setFolderFiles] = useState<WatchedFile[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"explorer" | "shared">("explorer");
  const [sourceMode, setSourceMode] = useState<"folder" | "upload" | "url">("folder");
  const [folderInput, setFolderInput] = useState(settings.watchFolder);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedEntries, setUploadedEntries] = useState<ExplorerFileEntry[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [urlEntries, setUrlEntries] = useState<ExplorerFileEntry[]>([]);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlDiagnostic, setUrlDiagnostic] = useState<{ reason: string; technical?: string } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!settings.watchFolder) return;
    listWatchedFiles(settings.watchFolder)
      .then(setFolderFiles)
      .catch(() => setFolderFiles([]));
  }, [settings.watchFolder]);

  const explorerEntries = useMemo(() => {
    const fromFolder = folderFiles.map((file) => ({
      name: file.name,
      path: toRelativePath(file.path, settings.watchFolder),
      sizeBytes: file.sizeBytes,
      source: "folder" as const,
    }));
    return [...fromFolder, ...uploadedEntries, ...urlEntries];
  }, [folderFiles, settings.watchFolder, uploadedEntries, urlEntries]);

  const fileTree = useMemo(() => buildTree(explorerEntries), [explorerEntries]);

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
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${settings.backendUrl}/api/files/upload-session-material`);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const payload = JSON.parse(xhr.responseText) as {
              name: string;
              url: string;
              sizeBytes: number;
            };
            setUploadedEntries((prev) => [
              ...prev.filter((entry) => entry.url !== payload.url),
              {
                name: payload.name,
                path: `uploads/${payload.name}`,
                sizeBytes: payload.sizeBytes ?? null,
                source: "upload",
                ghost: false,
                url: payload.url,
              },
            ]);
            resolve();
          } catch {
            resolve();
          }
        } else reject(new Error(`Upload failed (${xhr.status})`));
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

  async function handleConnectFolder() {
    const nextPath = folderInput.trim();
    if (!nextPath) return;
    try {
      useAppStore.getState().updateSettings({ watchFolder: nextPath });
      await watchFolder(nextPath);
      const files = await listWatchedFiles(nextPath);
      setFolderFiles(files);
      addDebugLog(`Connected folder: ${nextPath}`, "success");
    } catch (err) {
      addDebugLog(`Folder load failed: ${String(err)}`, "error");
    }
  }

  async function handleImportUrl() {
    if (!urlInput.trim() || urlLoading) return;
    setUrlLoading(true);
    setUrlDiagnostic(null);
    try {
      const result = await importFilesFromUrl(urlInput.trim(), settings.backendUrl);
      if (!result.accessible || result.files.length === 0) {
        setUrlDiagnostic({
          reason: result.diagnosis?.reason ?? "URL is not accessible.",
          technical: result.diagnosis?.technical,
        });
      } else {
        setUrlEntries((prev) => {
          const next = [...prev];
          for (const file of result.files) {
            if (!next.some((entry) => entry.url === file.url || entry.path === file.path)) {
              next.push({ ...file, source: "url", ghost: true });
            }
          }
          return next;
        });
        addDebugLog(`URL import added ${result.files.length} ghost file(s)`, "success");
      }
    } catch (err) {
      setUrlDiagnostic({
        reason: String(err),
      });
    } finally {
      setUrlLoading(false);
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
        {(["explorer", "shared"] as const).map((tab) => (
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
            {tab === "explorer" ? "Explorer" : `Shared (${sharedFiles.length})`}
          </button>
        ))}
      </div>
      {activeTab === "explorer" && (
        <div className="px-3 py-2 border-b border-wkai-border space-y-2">
          <div className="grid grid-cols-3 rounded-md border border-wkai-border overflow-hidden">
            <ModeButton label="Folder path" active={sourceMode === "folder"} onClick={() => setSourceMode("folder")} />
            <ModeButton label="File upload" active={sourceMode === "upload"} onClick={() => setSourceMode("upload")} />
            <ModeButton label="URL upload" active={sourceMode === "url"} onClick={() => setSourceMode("url")} />
          </div>

          {sourceMode === "folder" && (
            <div className="space-y-2">
              <input
                className="input font-mono text-xs"
                placeholder="C:\\workshop-files or /home/user/workshop-files"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
              />
              <button type="button" className="btn-ghost w-full justify-center border border-wkai-border text-xs" onClick={() => void handleConnectFolder()}>
                <FolderOpen size={13} />
                Load Folder
              </button>
            </div>
          )}

          {sourceMode === "upload" && (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.pptx,.ppt,.docx,.txt,.zip,.py,.js,.ts,.tsx,.jsx,.ipynb,.csv,.json,.md"
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
          )}

          {sourceMode === "url" && (
            <div className="space-y-2">
              <input
                className="input text-xs"
                placeholder="https://example.com/files"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost w-full justify-center border border-wkai-border text-xs"
                onClick={() => void handleImportUrl()}
                disabled={urlLoading}
              >
                {urlLoading ? <Loader2 size={13} className="animate-spin" /> : <Link size={13} />}
                {urlLoading ? "Scanning URL..." : "Import URL"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3 space-y-1.5">
        {activeTab === "explorer" ? (
          <>
            {fileTree.children.length === 0 ? (
              <EmptyState icon={<FolderOpen size={20} />} message="No files loaded yet" />
            ) : (
              <TreeNodeList
                nodes={fileTree.children}
                depth={0}
                sharing={sharing}
                expandedFolders={expandedFolders}
                onToggleFolder={(id) => setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }))}
                onShareFile={(path) => {
                  const hit = folderFiles.find((file) => file.path === path);
                  if (hit) void handleShare(hit);
                }}
                formatSize={formatSize}
              />
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
      {urlDiagnostic && (
        <UrlDiagnosticModal
          reason={urlDiagnostic.reason}
          technical={urlDiagnostic.technical}
          onClose={() => setUrlDiagnostic(null)}
        />
      )}
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

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-2 py-1.5 text-[11px] font-medium",
        active ? "bg-indigo-500/15 text-indigo-300" : "bg-transparent text-wkai-text-dim hover:text-wkai-text"
      )}
    >
      {label}
    </button>
  );
}

type FileTreeNode = {
  id: string;
  name: string;
  kind: "folder" | "file";
  path: string;
  source?: "folder" | "upload" | "url";
  ghost?: boolean;
  sizeBytes?: number | null;
  children: FileTreeNode[];
};

function buildTree(entries: ExplorerFileEntry[]): FileTreeNode {
  const root: FileTreeNode = {
    id: "root",
    name: "root",
    kind: "folder",
    path: "",
    children: [],
  };

  const map = new Map<string, FileTreeNode>();
  map.set("root", root);

  for (const entry of entries) {
    const parts = normalizePath(entry.path).split("/").filter(Boolean);
    let parentId = "root";
    let cumulative = "";
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      cumulative = cumulative ? `${cumulative}/${part}` : part;
      const isLast = i === parts.length - 1;
      const nodeId = cumulative;
      if (!map.has(nodeId)) {
        const node: FileTreeNode = {
          id: nodeId,
          name: part,
          kind: isLast ? "file" : "folder",
          path: isLast ? entry.path : cumulative,
          source: isLast ? entry.source : undefined,
          ghost: isLast ? entry.ghost : false,
          sizeBytes: isLast ? entry.sizeBytes : null,
          children: [],
        };
        map.set(nodeId, node);
        map.get(parentId)?.children.push(node);
      }
      parentId = nodeId;
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: FileTreeNode) {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortTree(child);
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^[A-Za-z]:\//, "");
}

function toRelativePath(fullPath: string, rootPath: string) {
  const normalizedFull = normalizePath(fullPath);
  const normalizedRoot = normalizePath(rootPath).replace(/\/+$/, "");
  if (!normalizedRoot) return normalizedFull;
  if (normalizedFull.startsWith(`${normalizedRoot}/`)) {
    return normalizedFull.slice(normalizedRoot.length + 1);
  }
  return normalizedFull;
}

function TreeNodeList({
  nodes,
  depth,
  sharing,
  expandedFolders,
  onToggleFolder,
  onShareFile,
  formatSize,
}: {
  nodes: FileTreeNode[];
  depth: number;
  sharing: string | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (id: string) => void;
  onShareFile: (path: string) => void;
  formatSize: (n: number) => string;
}) {
  return (
    <>
      {nodes.map((node) => {
        const expanded = expandedFolders[node.id] ?? true;
        const paddingLeft = 8 + depth * 12;
        if (node.kind === "folder") {
          return (
            <div key={node.id}>
              <button
                type="button"
                className="w-full flex items-center gap-1 rounded px-1 py-1 text-xs text-wkai-text-dim hover:bg-wkai-surface"
                style={{ paddingLeft }}
                onClick={() => onToggleFolder(node.id)}
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Folder size={13} />
                <span className="truncate">{node.name}</span>
              </button>
              {expanded && (
                <TreeNodeList
                  nodes={node.children}
                  depth={depth + 1}
                  sharing={sharing}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onShareFile={onShareFile}
                  formatSize={formatSize}
                />
              )}
            </div>
          );
        }

        return (
          <div key={node.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-wkai-surface" style={{ paddingLeft }}>
            {node.source === "url" ? <Globe size={12} className="text-sky-400 shrink-0" /> : <FileCode size={12} className="text-wkai-text-dim shrink-0" />}
            <span className="truncate text-xs text-wkai-text flex-1">{node.name}</span>
            {node.ghost && <span className="text-[10px] uppercase text-amber-400">ghost</span>}
            {typeof node.sizeBytes === "number" && <span className="text-[10px] text-wkai-text-dim">{formatSize(node.sizeBytes)}</span>}
            {node.source === "folder" && !node.ghost && (
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] text-indigo-300 hover:bg-indigo-500/10"
                onClick={() => onShareFile(node.path)}
                disabled={sharing === node.path}
              >
                {sharing === node.path ? <Loader2 size={11} className="animate-spin" /> : <Share2 size={11} />}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function UrlDiagnosticModal({
  reason,
  technical,
  onClose,
}: {
  reason: string;
  technical?: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-sm rounded-lg border border-wkai-border bg-wkai-surface p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-300">
          <AlertTriangle size={16} />
          <p className="text-sm font-medium">URL not accessible</p>
        </div>
        <p className="text-xs text-wkai-text">{reason}</p>
        {technical && <p className="text-[11px] text-wkai-text-dim">{technical}</p>}
        <button type="button" className="btn-primary w-full justify-center" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}