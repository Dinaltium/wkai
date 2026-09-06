import { useStore } from "../../store";
import { Download, FolderOpen, File, FileCode, FileText, FileImage } from "lucide-react";
import type { SharedFile } from "../../types";

export function FilesPanel() {
  const { sharedFiles } = useStore();

  return (
    <div className="flex h-full flex-col">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Shared files</h2>
          <p className="panel-sub">Anything your instructor shares lands here instantly.</p>
        </div>
        <span className="badge shrink-0 bg-wkai-surface2 text-wkai-text-dim">
          {sharedFiles.length}
        </span>
      </div>

      <div className="scroll-area space-y-2 px-3 py-4 sm:px-4">
        {sharedFiles.length === 0 ? (
          <EmptyFiles />
        ) : (
          sharedFiles.map((file) => (
            <FileRow
              key={file.id}
              file={typeof file === "object" ? file : (JSON.parse(String(file)) as SharedFile)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["js", "ts", "py", "rs", "go", "cpp", "java"].includes(ext))
    return <FileCode size={17} className="text-accent-text" />;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext))
    return <FileImage size={17} className="text-info" />;
  if (["md", "txt", "pdf", "docx"].includes(ext))
    return <FileText size={17} className="text-warn" />;
  return <File size={17} className="text-wkai-text-dim" />;
}

/**
 * The whole row is the download link. The old hover-revealed button was
 * invisible and unreachable on every touch device.
 */
function FileRow({ file }: { file: SharedFile }) {
  return (
    <a
      href={file.url}
      download={file.name}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-wkai-border bg-wkai-surface px-3 py-3 transition-colors hover:border-accent/50 hover:bg-wkai-surface2 sm:px-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-wkai-border bg-wkai-bg">
        {getIcon(file.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-wkai-text">{file.name}</span>
        <span className="block text-xs text-wkai-text-dim">
          {file.sizeBytes ? formatSize(file.sizeBytes) + " · " : ""}
          {new Date(file.sharedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </span>

      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-wkai-border text-wkai-text-dim">
        <Download size={15} />
        <span className="sr-only">Download {file.name}</span>
      </span>
    </a>
  );
}

function EmptyFiles() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
        <FolderOpen size={22} className="text-wkai-text-dim" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-wkai-text">Nothing shared yet</p>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-wkai-text-dim">
          Starter files, datasets, and slides appear here the moment your instructor sends them.
          You can keep working in another tab; the list updates on its own.
        </p>
      </div>
    </div>
  );
}
