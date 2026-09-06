import { Fragment, type ReactNode } from "react";

/**
 * Renders the small slice of Markdown the models actually emit.
 *
 * Guide cards, error diagnoses and AI replies are written by a language model,
 * which formats them in Markdown by habit. The UI was printing that verbatim,
 * so students read `**before**` and backticked `range` as literal punctuation
 * rather than emphasis and code.
 *
 * This is deliberately not a Markdown library. The content is one to two short
 * paragraphs of prose, so the whole surface worth supporting is bold, italics,
 * inline code and bullet lists — block-level code already arrives in its own
 * field and is rendered separately. Building React nodes from parsed tokens
 * also means nothing here can inject HTML, which matters for text that
 * originates from a model.
 */

/** Splits one line into bold / italic / inline-code runs. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: code first, so ` `**not bold**` ` inside a span of code
  // stays literal.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-wkai-surface2 px-1 py-0.5 font-mono text-[0.9em] text-accent-text"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-semibold text-wkai-text">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  if (!text) return null;

  // Group consecutive bullet lines so a list renders as one list rather than a
  // run of stray paragraphs.
  const lines = text.split(/\r?\n/);
  const blocks: { type: "p" | "ul"; lines: string[] }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const previous = blocks[blocks.length - 1];

    if (bullet) {
      if (previous?.type === "ul") previous.lines.push(bullet[1]);
      else blocks.push({ type: "ul", lines: [bullet[1]] });
    } else if (previous?.type === "p") {
      // A wrapped sentence continues the paragraph it belongs to.
      previous.lines.push(trimmed);
    } else {
      blocks.push({ type: "p", lines: [trimmed] });
    }
  }

  return (
    <div className={className}>
      {blocks.map((block, b) =>
        block.type === "ul" ? (
          <ul key={b} className="ml-4 list-disc space-y-1 [&:not(:first-child)]:mt-2">
            {block.lines.map((line, i) => (
              <li key={i}>{renderInline(line, `${b}-${i}`)}</li>
            ))}
          </ul>
        ) : (
          <p key={b} className="[&:not(:first-child)]:mt-2">
            {block.lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? " " : null}
                {renderInline(line, `${b}-${i}`)}
              </Fragment>
            ))}
          </p>
        )
      )}
    </div>
  );
}
