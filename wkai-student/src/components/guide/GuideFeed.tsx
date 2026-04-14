import { useRef, useEffect } from "react";
import { useStore } from "../../store";
import type { GuideBlock } from "../../types";
import { clsx } from "clsx";
import {
  Footprints,
  Lightbulb,
  Code2,
  BookOpen,
  HelpCircle,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

export function GuideFeed() {
  const { guideBlocks } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [guideBlocks]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {guideBlocks.length === 0 ? (
          <EmptyState />
        ) : (
          guideBlocks.map((block, i) => (
            <GuideCard key={block.id} block={block} index={i} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Individual guide card ────────────────────────────────────────────────────

function GuideCard({ block, index }: { block: GuideBlock; index: number }) {
  const meta = BLOCK_META[block.type] ?? BLOCK_META.explanation;

  return (
    <div
      className={clsx(
        "rounded-xl border p-4 space-y-2.5 animate-slide-up",
        meta.borderClass,
        meta.bgClass
      )}
      style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className={clsx("shrink-0", meta.iconClass)}>{meta.icon}</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim">
          {meta.label}
        </span>
        <span className="ml-auto text-xs text-wkai-text-dim">
          {new Date(block.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Title */}
      {block.title && (
        <p className="text-sm font-semibold text-wkai-text">{block.title}</p>
      )}

      {/* Content */}
      <p className="text-sm text-wkai-text leading-relaxed">{block.content}</p>

      {/* Code block */}
      {block.code && <CodeBlock code={block.code} language={block.language} />}
    </div>
  );
}

// ─── Code block with copy button ─────────────────────────────────────────────

function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | null;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative rounded-lg bg-wkai-bg border border-wkai-border overflow-hidden">
      {/* Language tag + copy */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-wkai-border bg-wkai-surface">
        <span className="text-xs font-mono text-wkai-text-dim">
          {language ?? "code"}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-wkai-text-dim hover:text-wkai-text transition-colors"
        >
          {copied ? (
            <><Check size={11} className="text-emerald-400" /> Copied</>
          ) : (
            <><Copy size={11} /> Copy</>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono text-wkai-text leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
        <BookOpen size={22} className="text-wkai-text-dim" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-wkai-text">
          Waiting for content
        </p>
        <p className="text-xs text-wkai-text-dim max-w-xs leading-relaxed">
          Your guide will appear here as your instructor teaches. Each step,
          tip, and code block is generated automatically.
        </p>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
        <span className="text-xs text-indigo-400">Waiting for session content</span>
      </div>
    </div>
  );
}

// ─── Block meta ───────────────────────────────────────────────────────────────

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
