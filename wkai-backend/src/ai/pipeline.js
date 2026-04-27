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

    // 4. Update memory if the AI generated instructional content
    if (result.isInstructional && result.summary) {
      await memory.addTeachingContext(result.summary);
    }

    return {
      guideBlocks: result.isInstructional ? result.guideBlocks : [],
      comprehensionQuestion: result.comprehensionQuestion,
      summary: result.summary,
    };
  });
}
