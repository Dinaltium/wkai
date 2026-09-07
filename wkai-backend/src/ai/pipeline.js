import { visionLLM, callWithRetry } from "./groqClient.js";
import { screenAnalysisPrompt, fixingScreenParser } from "./prompts.js";
import { getSessionMemory } from "./memory.js";

// Blocks the model produces when it has nothing to say. They read as content
// but carry none, and they are most of what makes the guide feel random.
const FILLER_PATTERNS = [
  /^the (instructor|screen|user) (is|appears to be)/i,
  /^(this|the) (screen|frame|image) (shows|displays)/i,
  /(unclear|cannot determine|not visible|unable to (see|read|determine))/i,
  /continue (watching|following along)/i,
];

const MIN_CONTENT_CHARS = 25;

/**
 * Drop blocks that are not actually grounded content. The prompt asks the
 * model to stay silent when it cannot see what is being taught; this enforces
 * it, because a vision model asked for 1-3 blocks will nearly always produce
 * 1-3 blocks.
 */
export function filterUngroundedBlocks(blocks = []) {
  return blocks.filter((block) => {
    const content = String(block?.content ?? "").trim();
    if (content.length < MIN_CONTENT_CHARS) return false;
    if (FILLER_PATTERNS.some((pattern) => pattern.test(content))) return false;
    // A "code" block with no code is a description of code, which is what the
    // explanation type is for — and usually means the model invented it.
    if (block.type === "code" && !String(block.code ?? "").trim()) return false;
    return true;
  });
}

/**
 * processScreenFrame
 * 
 * The main AI pipeline for WKAI.
 * 1. Analyzes the instructor's screen frame via Groq Llama-4 Scout.
 * 2. Incorporates the latest Whisper transcript for context.
 * 3. Uses Redis-backed session memory to avoid duplicate content.
 * 4. Returns structured guide blocks and comprehension questions.
 */
export async function processScreenFrame(sessionId, frameB64, transcript) {
  const memory = getSessionMemory(sessionId);
  const sessionContext = await memory.getContextString();

  return await callWithRetry(async () => {
    // 1. Format the multi-modal prompt
    const formattedPrompt = await screenAnalysisPrompt.formatMessages({
      session_context: sessionContext || "Starting new session. No context yet.",
      frame_b64: frameB64,
      transcript: transcript || "No audio transcript available for this frame.",
      format_instructions: fixingScreenParser.getFormatInstructions(),
    });

    // 2. Invoke Groq Vision
    const response = await visionLLM.invoke(formattedPrompt);

    // 3. Parse and validate the response
    const result = await fixingScreenParser.parse(response.content);

    // The model routinely returns usable guide blocks while still flagging
    // isInstructional: false — an app window or a browser tab being *taught
    // from* trips the "idle/browser/desktop" rule in the prompt. Gating on the
    // boolean therefore threw away every block on a real workshop screen and
    // the guide stayed empty forever. Blocks are the actual product, so they
    // decide: the boolean only matters when there is nothing to show anyway.
    const guideBlocks = filterUngroundedBlocks(result.guideBlocks);
    const hasContent = guideBlocks.length > 0;

    // 4. Update memory if the AI generated instructional content
    if (hasContent && result.summary) {
      await memory.addTeachingContext(result.summary);
    }

    return {
      isInstructional: result.isInstructional,
      guideBlocks,
      comprehensionQuestion: result.comprehensionQuestion,
      summary: result.summary,
    };
  });
}
