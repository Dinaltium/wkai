import { useStore } from "../../store";
import { Download, FolderOpen, File, FileCode, FileText, FileImage } from "lucide-react";

export function FilesPanel() {
  const { sharedFiles } = useStore();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim">
          Shared Files
        </p>
        <span className="badge bg-wkai-border text-wkai-text-dim">
          {sharedFiles.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {sharedFiles.length === 0 ? (
          <EmptyFiles />
        ) : (
          sharedFiles.map((file) => <FileRow key={file.id} file={typeof file === 'object' ? file : JSON.parse(String(file))} />)
        )}
      </div>
    </div>
  );
}

function FileRow({ file }: { file: import("../../types").SharedFile }) {
  function formatSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["js", "ts", "py", "rs", "go", "cpp", "java"].includes(ext ?? ""))
      return <FileCode size={16} className="text-indigo-400" />;
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext ?? ""))
      return <FileImage size={16} className="text-pink-400" />;
    if (["md", "txt", "pdf", "docx"].includes(ext ?? ""))
      return <FileText size={16} className="text-sky-400" />;
    return <File size={16} className="text-wkai-text-dim" />;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-wkai-border bg-wkai-surface px-4 py-3 group hover:border-indigo-500/40 transition-colors">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wkai-bg border border-wkai-border">
        {getIcon(file.name)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-wkai-text">{file.name}</p>
        <p className="text-xs text-wkai-text-dim">
          {file.sizeBytes ? formatSize(file.sizeBytes) + " · " : ""}
          {new Date(file.sharedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <a
        href={file.url}
        download={file.name}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-lg border border-wkai-border px-3 py-1.5 text-xs text-wkai-text-dim
          hover:border-indigo-500/50 hover:text-indigo-400 transition-all opacity-0 group-hover:opacity-100"
      >
        <Download size={12} />
        Download
      </a>
    </div>
  );
}

function EmptyFiles() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
        <FolderOpen size={22} className="text-wkai-text-dim" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-wkai-text">No files have been shared</p>
        <p className="text-xs text-wkai-text-dim max-w-xs">
          Files your instructor shares will appear here instantly.
        </p>
      </div>
    </div>
  );
}
