import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

export interface RailTabDef<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  /** Rendered as a small count next to the icon; hidden when 0. */
  badge?: number;
}

/**
 * The rail's section switcher.
 *
 * Five equal-width tabs with labels do not fit a 260px rail — the text was
 * clipped mid-word ("Tes…"), which is worse than no label at all: an
 * unreadable word still costs the space a readable icon would have used.
 *
 * So the strip adapts to the width the instructor actually dragged the rail
 * to, rather than assuming one:
 *  - wide:    icon + label on every tab
 *  - compact: label on the current tab only, icons for the rest — the pattern
 *             mobile tab bars use, and it keeps "where am I" visible where it
 *             matters while giving that space back to the other four
 *  - narrow:  icons only
 *
 * Nothing is ever truncated, every tab keeps its accessible name in all three
 * modes, and each panel names itself in its own header, so an icon-only strip
 * never leaves the section unidentified.
 */

/** Below this the current tab's label is dropped too. */
const ICONS_ONLY_BELOW = 330;
/** Below this only the current tab keeps its label. Measured, not guessed:
 *  five labels plus the People count need ~530px before the longest of them
 *  ("People 12") stops clipping. */
const LABELS_BELOW = 530;

export type RailTabsMode = "full" | "compact" | "icons";

export function railTabsMode(width: number): RailTabsMode {
  if (width < ICONS_ONLY_BELOW) return "icons";
  if (width < LABELS_BELOW) return "compact";
  return "full";
}

export function SessionRailTabs<Id extends string>({
  tabs,
  active,
  onChange,
  width,
}: {
  tabs: RailTabDef<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  width: number;
}) {
  const mode = railTabsMode(width);

  return (
    <div
      className="flex shrink-0 border-b border-wkai-border bg-wkai-surface"
      role="tablist"
      aria-label="Session panels"
    >
      {tabs.map(({ id, label, icon: Icon, badge }) => {
        const isActive = active === id;
        const showLabel = mode === "full" || (mode === "compact" && isActive);

        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            // The label is the accessible name whether or not it is painted,
            // so screen readers and tooltips never depend on the rail width.
            aria-label={label}
            title={label}
            onClick={() => onChange(id)}
            className={clsx(
              "relative flex h-11 min-w-0 items-center justify-center gap-1.5 text-xs font-medium transition-colors",
              // In compact mode the labelled tab claims the room its label
              // needs and the icons share the rest. In full mode every tab is
              // labelled, so an equal split is what keeps them all readable —
              // giving the active one extra width there is what pushed
              // "People" back into an ellipsis.
              mode === "compact" && isActive ? "flex-[2] px-2" : "flex-1 px-1",
              isActive
                ? "border-b-2 border-accent text-accent-text"
                : "text-wkai-text-dim hover:bg-wkai-surface2 hover:text-wkai-text"
            )}
          >
            <span className="relative flex shrink-0 items-center">
              <Icon size={15} />
              {badge !== undefined && badge > 0 && (
                <span
                  className={clsx(
                    "ml-1 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                    isActive ? "bg-accent/20 text-accent-text" : "bg-wkai-surface2 text-wkai-text-dim"
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            {showLabel && <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
