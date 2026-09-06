import { useCallback, useEffect, useRef, useState } from "react";
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
  ArrowDown,
} from "lucide-react";

export function GuideFeed() {
  const { guideBlocks } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setUnread(0);
  }, []);

  // Follow the feed only while the student is already at the bottom. Yanking
  // the view away mid-sentence is the fastest way to lose someone who is
  // re-reading an earlier step.
  useEffect(() => {
    if (atBottom) scrollToBottom();
    else setUnread((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideBlocks.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(near);
    if (near) setUnread(0);
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-area space-y-3 px-3 py-4 sm:px-4"
      >
        {guideBlocks.length === 0 ? (
          <EmptyState />
        ) : (
          guideBlocks.map((block, i) => (
            <GuideCard key={block.id} block={block} index={i} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {!atBottom && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 left-1/2 z-sticky -translate-x-1/2 rounded-full border border-wkai-border bg-wkai-surface px-4 py-2 text-xs font-medium text-wkai-text shadow-lg animate-fade-in"
        >
          <span className="flex items-center gap-1.5">
            <ArrowDown size={13} />
            {unread > 0 ? `${unread} new ${unread === 1 ? "step" : "steps"}` : "Jump to latest"}
          </span>
        </button>
      )}
    </div>
  );
}

// ─── Individual guide card ────────────────────────────────────────────────────

function GuideCard({ block, index }: { block: GuideBlock; index: number }) {
  const meta = BLOCK_META[block.type] ?? BLOCK_META.explanation;
  const Icon = meta.icon;

  return (
    <article
      className="card animate-slide-up space-y-2.5 p-3.5 sm:p-4"
      style={{ animationDelay: `${Math.min(index * 25, 150)}ms` }}
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            meta.chipClass
          )}
        >
          <Icon size={13} />
        </span>
        <span className="text-xs font-semibold text-wkai-text">{meta.label}</span>
        <time
          className="ml-auto shrink-0 text-xs tabular-nums text-wkai-text-dim"
          dateTime={block.timestamp}
        >
          {new Date(block.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>

      {block.title && (
        <h3 className="text-sm font-semibold leading-snug text-wkai-text">{block.title}</h3>
      )}

      <p className="max-w-[70ch] text-sm leading-relaxed text-wkai-text">{block.content}</p>

      {block.code && <CodeBlock code={block.code} language={block.language} />}
    </article>
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
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-wkai-border bg-wkai-bg">
      <div className="flex items-center justify-between border-b border-wkai-border bg-wkai-surface2 px-3 py-1.5">
        <span className="font-mono text-xs text-wkai-text-dim">{language ?? "code"}</span>
        {/* Always visible: a hover-revealed copy button is unreachable on touch. */}
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-wkai-text-dim transition-colors hover:bg-wkai-border hover:text-wkai-text"
        >
          {copied ? (
            <><Check size={12} className="text-ok" /> Copied</>
          ) : (
            <><Copy size={12} /> Copy</>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed text-wkai-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
        <BookOpen size={22} className="text-wkai-text-dim" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-wkai-text">Your guide starts as soon as the instructor does</p>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-wkai-text-dim">
          Every step, tip, and code block from the session is written here automatically,
          so you can catch up without asking anyone to repeat themselves.
        </p>
      </div>
      <span className="flex items-center gap-2 text-xs text-accent-text">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-accent" />
        Listening for session content
      </span>
    </div>
  );
}

// ─── Block meta ───────────────────────────────────────────────────────────────

const BLOCK_META: Record<
  GuideBlock["type"],
  { label: string; icon: typeof BookOpen; chipClass: string }
> = {
  step: {
    label: "Step",
    icon: Footprints,
    chipClass: "bg-accent/15 text-accent-text",
  },
  tip: {
    label: "Tip",
    icon: Lightbulb,
    chipClass: "bg-warn/15 text-warn",
  },
  code: {
    label: "Code",
    icon: Code2,
    chipClass: "bg-ok/15 text-ok",
  },
  explanation: {
    label: "Explanation",
    icon: BookOpen,
    chipClass: "bg-info/15 text-info",
  },
  comprehension: {
    label: "Check",
    icon: HelpCircle,
    chipClass: "bg-wkai-surface2 text-wkai-text-dim",
  },
};
