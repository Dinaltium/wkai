import { StateGraph, END, START } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { textLLM } from "../groqClient.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";

// ─── State ────────────────────────────────────────────────────────────────────

const IntentState = Annotation.Root({
  transcript:      Annotation({ reducer: (_, v) => v }),
  recentFiles:     Annotation({ reducer: (_, v) => v, default: () => [] }),
  detectedIntent:  Annotation({ reducer: (_, v) => v, default: () => null }),
  matchedFile:     Annotation({ reducer: (_, v) => v, default: () => null }),
  confidence:      Annotation({ reducer: (_, v) => v, default: () => 0 }),
});

// ─── Output schema ────────────────────────────────────────────────────────────

const IntentSchema = z.object({
  hasShareIntent: z.boolean(),
  confidence:     z.number().min(0).max(1),
  fileHint:       z.string().nullable(),
  reasoning:      z.string(),
});

const intentParser = StructuredOutputParser.fromZodSchema(IntentSchema);

// ─── Prompt ───────────────────────────────────────────────────────────────────

const intentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are analyzing an instructor's speech during a coding workshop.
Detect if the instructor intends to share a file with students.

Share intent phrases include (but are not limited to):
- "share this file", "send this to you", "upload this"
- "grab the starter code", "download this"
- "I'll share the template", "here's the file"
- "paste this into your editor", "copy this code"

If you detect share intent, extract any file name hint mentioned.

{format_instructions}`,
  ],
  [
    "human",
    `Instructor said (last ~30 seconds):\n"{transcript}"\n\nAvailable files in share folder: {file_list}\n\nDoes the instructor want to share a file?`,
  ],
]);

// ─── Node 1: Quick heuristic pre-check ───────────────────────────────────────
// Avoids an LLM call if no share-related words are present at all.

const SHARE_KEYWORDS = [
  "share", "send", "upload", "download", "grab", "file",
  "template", "starter", "code", "paste", "copy", "here",
];

function heuristicCheckNode(state) {
  const lower = state.transcript.toLowerCase();
  const hasKeyword = SHARE_KEYWORDS.some((kw) => lower.includes(kw));

  if (!hasKeyword) {
    // Short-circuit — no LLM call needed
    return { detectedIntent: { hasShareIntent: false, confidence: 0, fileHint: null }, confidence: 0 };
  }
  return {}; // proceed to LLM node
}

// ─── Node 2: LLM intent classification ───────────────────────────────────────

async function classifyIntentNode(state) {
  // Already classified as no-intent by heuristic
  if (state.detectedIntent?.hasShareIntent === false) return {};

  try {
    const chain = intentPrompt.pipe(textLLM);
    const fileList = state.recentFiles.length
      ? state.recentFiles.map((f) => f.name).join(", ")
      : "(no files in watch folder)";

    const response = await chain.invoke({
      transcript:         state.transcript,
      file_list:          fileList,
      format_instructions: intentParser.getFormatInstructions(),
    });

    const parsed = await intentParser.parse(response.content);
    return { detectedIntent: parsed, confidence: parsed.confidence };
  } catch (err) {
    console.error("[IntentAgent] Classification failed:", err.message);
    return { detectedIntent: { hasShareIntent: false, confidence: 0, fileHint: null }, confidence: 0 };
  }
}

// ─── Node 3: Match the file hint to an actual file in the watch folder ────────

function matchFileNode(state) {
  const intent = state.detectedIntent;
  if (!intent?.hasShareIntent || !intent.fileHint || !state.recentFiles.length) {
    return {};
  }

  const hint = intent.fileHint.toLowerCase();
  const files = state.recentFiles;

  // Exact name match first
  let match = files.find((f) => f.name.toLowerCase() === hint);

  // Partial match
  if (!match) {
    match = files.find((f) => f.name.toLowerCase().includes(hint) || hint.includes(f.name.toLowerCase().split(".")[0]));
  }

  // Most recently modified file as fallback when confidence is high
  if (!match && intent.confidence > 0.8) {
    match = files[0]; // already sorted by modified_at DESC
  }

  return { matchedFile: match ?? null };
}

// ─── Conditional edges ────────────────────────────────────────────────────────

function shouldClassify(state) {
  if (state.detectedIntent?.hasShareIntent === false) return "done";
  return "classify";
}

function shouldMatch(state) {
  if (!state.detectedIntent?.hasShareIntent) return "done";
  if (state.confidence < 0.6) return "done"; // too uncertain
  return "match";
}

// ─── Build the graph ──────────────────────────────────────────────────────────

const workflow = new StateGraph(IntentState)
  .addNode("heuristic",        heuristicCheckNode)
  .addNode("classify_intent",  classifyIntentNode)
  .addNode("match_file",       matchFileNode)

  .addEdge(START, "heuristic")

  .addConditionalEdges("heuristic", shouldClassify, {
    classify: "classify_intent",
    done:     END,
  })

  .addConditionalEdges("classify_intent", shouldMatch, {
    match: "match_file",
    done:  END,
  })

  .addEdge("match_file", END);

export const intentDetectionGraph = workflow.compile();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect file share intent in an audio transcript.
 * Returns the matched file if intent is detected with high confidence.
 *
 * @param {string} transcript   Whisper transcript of recent instructor audio
 * @param {Array}  recentFiles  Files from the watched folder [{name, path, ...}]
 * @returns {Promise<{ shouldShare: boolean, file: WatchedFile|null, confidence: number }>}
 */
export async function detectShareIntent(transcript, recentFiles = []) {
  if (!transcript?.trim()) {
    return { shouldShare: false, file: null, confidence: 0 };
  }

  const result = await intentDetectionGraph.invoke({ transcript, recentFiles });

  return {
    shouldShare: result.detectedIntent?.hasShareIntent === true && result.confidence >= 0.6,
    file:        result.matchedFile ?? null,
    confidence:  result.confidence ?? 0,
  };
}
