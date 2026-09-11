/**
 * What a guide block has to be before a student sees it.
 *
 * Deliberately free of any model or network import: this is the one part of
 * the screen pipeline whose behaviour can be pinned down in a unit test, and
 * it stays that way only if importing it does not drag in a Groq client that
 * demands an API key.
 */
// Blocks the model produces when it has nothing to say. They read as content
// but carry none, and they are most of what makes the guide feel random.
const FILLER_PATTERNS = [
  /^the (instructor|screen|user) (is|appears to be)\b/i,
  /^(this|the) (screen|frame|image) (shows|displays)\b/i,
  /\b(unclear|cannot determine|not visible|unable to (see|read|determine))\b/i,
  /\bcontinue (watching|following along)\b/i,
];

const MIN_CONTENT_CHARS = 25;

/**
 * Sort blocks into the ones worth showing and the ones that are not, saying why
 * for each rejection.
 *
 * The reason matters as much as the verdict. A frame that produces three blocks
 * and shows none looks identical, from outside, to a frame that produced none —
 * and to a pipeline that is not running at all. That ambiguity is what made
 * "0 guide blocks" impossible to act on: nobody could tell whether the model
 * had said nothing or whether this function had eaten everything it said.
 */
export function classifyBlocks(blocks = []) {
  const kept = [];
  const dropped = [];

  for (const block of blocks) {
    const content = String(block?.content ?? "").trim();

    if (content.length < MIN_CONTENT_CHARS) {
      dropped.push({ block, reason: "too short" });
      continue;
    }
    if (FILLER_PATTERNS.some((pattern) => pattern.test(content))) {
      dropped.push({ block, reason: "narrates the screen instead of teaching" });
      continue;
    }
    // A "code" block with no code is a description of code, which is what the
    // explanation type is for — and usually means the model invented it.
    if (block.type === "code" && !String(block.code ?? "").trim()) {
      dropped.push({ block, reason: "code block with no code" });
      continue;
    }
    kept.push(block);
  }

  return { kept, dropped };
}

/**
 * Drop blocks that are not actually grounded content. The prompt asks the
 * model to stay silent when it cannot see what is being taught; this enforces
 * it, because a vision model asked for 1-3 blocks will nearly always produce
 * 1-3 blocks.
 */
export function filterUngroundedBlocks(blocks = []) {
  return classifyBlocks(blocks).kept;
}
