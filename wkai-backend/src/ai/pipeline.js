import { visionLLM, callWithRetry } from "./groqClient.js";
import { screenAnalysisPrompt, fixingScreenParser } from "./prompts.js";
import { getSessionMemory } from "./memory.js";

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
    const hasContent = result.guideBlocks.length > 0;

    // 4. Update memory if the AI generated instructional content
    if (hasContent && result.summary) {
      await memory.addTeachingContext(result.summary);
    }

    return {
      isInstructional: result.isInstructional,
      guideBlocks: hasContent ? result.guideBlocks : [],
      comprehensionQuestion: result.comprehensionQuestion,
      summary: result.summary,
    };
  });
}
