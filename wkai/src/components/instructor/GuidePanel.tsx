import { useRef, useEffect } from "react";
import { useAppStore } from "../../store";
import type { GuideBlock } from "../../types";
import { clsx } from "clsx";
import {
  Footprints,
  Lightbulb,
  Code2,
  BookOpen,
  HelpCircle,
  Loader2,
} from "lucide-react";

export function GuidePanel() {
  const { guideBlocks, capture } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest block
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [guideBlocks]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-5 py-3">
        <h2 className="text-sm font-medium">Live Guide</h2>
        {capture.aiProcessing && (
          <span className="flex items-center gap-1.5 text-xs text-indigo-400">
            <Loader2 size={12} className="animate-spin" />
            AI generating…
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
        {guideBlocks.length === 0 ? (
          <EmptyGuide />
        ) : (
          guideBlocks.map((block) => (
            <GuideBlockCard key={block.id} block={block} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function GuideBlockCard({ block }: { block: GuideBlock }) {
  const meta = BLOCK_META[block.type];

  return (
    <div
      className={clsx(
        "rounded-xl border p-4 space-y-2 transition-all",
        meta.borderClass,
        meta.bgClass
      )}
    >
      <div className="flex items-center gap-2">
        <span className={clsx("shrink-0", meta.iconClass)}>{meta.icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-wkai-text-dim">
          {meta.label}
        </span>
        <span className="ml-auto text-xs text-wkai-text-dim">
          {new Date(block.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {block.title && (
        <p className="text-sm font-semibold text-wkai-text">{block.title}</p>
      )}
      <p className="text-sm text-wkai-text leading-relaxed">{block.content}</p>

      {block.code && (
        <pre className="rounded-lg bg-wkai-bg border border-wkai-border p-3 text-xs font-mono text-wkai-text overflow-auto">
          <code>{block.code}</code>
        </pre>
      )}
    </div>
  );
}

const BLOCK_META: Record<
  GuideBlock["type"],
  {
    label: string;
    icon: React.ReactNode;
    iconClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  step: {
    label: "Step",
    icon: <Footprints size={13} />,
    iconClass: "text-indigo-400",
    bgClass: "bg-indigo-500/5",
    borderClass: "border-indigo-500/20",
  },
  tip: {
    label: "Tip",
    icon: <Lightbulb size={13} />,
    iconClass: "text-yellow-400",
    bgClass: "bg-yellow-500/5",
    borderClass: "border-yellow-500/20",
  },
  code: {
    label: "Code",
    icon: <Code2 size={13} />,
    iconClass: "text-emerald-400",
    bgClass: "bg-emerald-500/5",
    borderClass: "border-emerald-500/20",
  },
  explanation: {
    label: "Explanation",
    icon: <BookOpen size={13} />,
    iconClass: "text-sky-400",
    bgClass: "bg-sky-500/5",
    borderClass: "border-sky-500/20",
  },
  comprehension: {
    label: "Check",
    icon: <HelpCircle size={13} />,
    iconClass: "text-purple-400",
    bgClass: "bg-purple-500/5",
    borderClass: "border-purple-500/20",
  },
};

function EmptyGuide() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wkai-surface border border-wkai-border">
        <BookOpen size={20} className="text-wkai-text-dim" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-wkai-text">
          Waiting for session content
        </p>
        <p className="text-xs text-wkai-text-dim max-w-xs">
          WKAI is watching your screen. Guide blocks will appear here as you
          teach.
        </p>
      </div>
    </div>
  );
}
