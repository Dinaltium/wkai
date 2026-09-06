import { useStore } from "../../store";
import type { RoomTab } from "../../types";
import { BookOpen, FolderOpen, Bot, Monitor, MessageSquare } from "lucide-react";
import { clsx } from "clsx";

const TABS: { id: RoomTab; label: string; icon: typeof BookOpen }[] = [
  { id: "guide",     label: "Guide",     icon: BookOpen },
  { id: "files",     label: "Files",     icon: FolderOpen },
  { id: "ai-helper", label: "AI Helper", icon: Bot },
  { id: "live",      label: "Live",      icon: Monitor },
  { id: "messages",  label: "Q&A",       icon: MessageSquare },
];

interface Props {
  sessionEnded?: boolean;
}

/**
 * Room navigation. Bottom bar on phones (thumb reach, 60px targets), a normal
 * tab strip under the header from `sm` up.
 */
export function TabBar({ sessionEnded = false }: Props) {
  const { activeTab, setActiveTab, newFileCount } = useStore();
  const visibleTabs = sessionEnded
    ? TABS.filter((t) => t.id === "guide" || t.id === "files")
    : TABS;

  return (
    <nav
      aria-label="Workshop sections"
      className={clsx(
        // mobile: fixed bottom bar with safe-area padding
        "fixed inset-x-0 bottom-0 z-sticky flex border-t border-wkai-border bg-wkai-surface",
        "pb-[var(--safe-b)]",
        // desktop: back in flow, under the header
        "sm:static sm:shrink-0 sm:border-b sm:border-t-0 sm:pb-0"
      )}
    >
      {visibleTabs.map((tab) => {
        const active = activeTab === tab.id;
        const Icon = tab.icon;
        const badge = tab.id === "files" && newFileCount > 0 ? newFileCount : 0;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium",
              "transition-colors duration-150",
              "sm:h-11 sm:flex-row sm:gap-1.5 sm:text-xs",
              active
                ? "text-accent-text sm:border-b-2 sm:border-accent"
                : "text-wkai-text-dim hover:text-wkai-text"
            )}
            style={{ minHeight: "var(--nav-h)" }}
          >
            <span className="relative">
              <Icon size={18} className="sm:hidden" />
              <Icon size={14} className="hidden sm:block" />
              {badge > 0 && (
                <span
                  className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg"
                  aria-label={`${badge} new files`}
                >
                  {badge}
                </span>
              )}
            </span>
            {tab.label}
            {/* active marker on mobile, where there is no bottom border to use */}
            {active && (
              <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent sm:hidden" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
