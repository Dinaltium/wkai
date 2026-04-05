import { useStore } from "../../store";
import type { RoomTab } from "../../types";
import { BookOpen, FolderOpen, Code2, Bug } from "lucide-react";
import { clsx } from "clsx";

const TABS: { id: RoomTab; label: string; icon: React.ReactNode }[] = [
  { id: "guide",  label: "Guide",   icon: <BookOpen size={14} /> },
  { id: "files",  label: "Files",   icon: <FolderOpen size={14} /> },
  { id: "editor", label: "Editor",  icon: <Code2 size={14} /> },
  { id: "error",  label: "Errors",  icon: <Bug size={14} /> },
];

export function TabBar() {
  const { activeTab, setActiveTab, newFileCount } = useStore();

  return (
    <nav className="flex shrink-0 border-b border-wkai-border bg-wkai-surface">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={clsx(
            "relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
            activeTab === tab.id
              ? "border-b-2 border-indigo-400 text-indigo-400"
              : "text-wkai-text-dim hover:text-wkai-text"
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.id === "files" && newFileCount > 0 && (
            <span className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white">
              {newFileCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
