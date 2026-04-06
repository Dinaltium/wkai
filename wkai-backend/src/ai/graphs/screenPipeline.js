import { StateGraph, END, START } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { StructuredOutputParser } from "langchain/output_parsers";
import { visionLLM, creativeLLM } from "../groqClient.js";
import {
  screenAnalysisPrompt,
  questionRefinementPrompt,
  screenAnalysisParser,
  fixingScreenParser,
  ComprehensionQuestionSchema,
} from "../prompts.js";
import { getSessionMemory } from "../memory.js";

// ─── State definition ─────────────────────────────────────────────────────────
// LangGraph state — each node reads from and writes to this object.

const PipelineState = Annotation.Root({
  sessionId:     Annotation({ reducer: (_, v) => v }),
  frameB64:      Annotation({ reducer: (_, v) => v }),
  transcript:    Annotation({ reducer: (_, v) => v, default: () => "" }),
  sessionContext:Annotation({ reducer: (_, v) => v, default: () => "" }),

  // Intermediate results
  isInstructional:       Annotation({ reducer: (_, v) => v, default: () => false }),
  rawAnalysis:           Annotation({ reducer: (_, v) => v, default: () => null }),
  guideBlocks:           Annotation({ reducer: (_, v) => v, default: () => [] }),
  comprehensionQuestion: Annotation({ reducer: (_, v) => v, default: () => null }),
  summary:               Annotation({ reducer: (_, v) => v, default: () => "" }),

  // Error tracking
  parseAttempts: Annotation({ reducer: (_, v) => v, default: () => 0 }),
  error:         Annotation({ reducer: (_, v) => v, default: () => null }),
});

// ─── Node 1: Load session context from Redis memory ──────────────────────────

async function loadContextNode(state) {
  const memory = getSessionMemory(state.sessionId);
  const sessionContext = await memory.getContextString();
  return { sessionContext };
}

// ─── Node 2: Vision analysis — send frame to Groq Llama-4 Scout ──────────────

async function visionAnalysisNode(state) {
  try {
    const formatInstructions = screenAnalysisParser.getFormatInstructions();

    const chain = screenAnalysisPrompt.pipe(visionLLM);

    const response = await chain.invoke({
      session_context:    state.sessionContext || "No prior context — this is the start of the session.",
      frame_b64:          state.frameB64,
      transcript:         state.transcript || "(no audio transcript)",
      format_instructions: formatInstructions,
    });

    return { rawAnalysis: response.content, parseAttempts: 1 };
  } catch (err) {
    return { error: `Vision analysis failed: ${err.message}`, rawAnalysis: null };
  }
}

// ─── Node 3: Parse and validate the vision output ────────────────────────────

async function parseOutputNode(state) {
  if (!state.rawAnalysis) {
    return { guideBlocks: [], comprehensionQuestion: null, isInstructional: false };
  }

  try {
    // First try direct parse
    const parsed = await screenAnalysisParser.parse(state.rawAnalysis);
    return {
      isInstructional:       parsed.isInstructional,
      guideBlocks:           parsed.guideBlocks ?? [],
      comprehensionQuestion: parsed.comprehensionQuestion ?? null,
      summary:               parsed.summary ?? "",
    };
  } catch {
    try {
      // Self-healing parse — sends the error back to the LLM to fix
      const parsed = await fixingScreenParser.parse(state.rawAnalysis);
      return {
        isInstructional:       parsed.isInstructional ?? false,
        guideBlocks:           parsed.guideBlocks ?? [],
        comprehensionQuestion: parsed.comprehensionQuestion ?? null,
        summary:               parsed.summary ?? "",
        parseAttempts:         state.parseAttempts + 1,
      };
    } catch (err) {
      console.error("[LangGraph] Parse failed even with fixing parser:", err.message);
      return {
        isInstructional: false,
        guideBlocks: [],
        comprehensionQuestion: null,
        error: "Parse failed",
      };
    }
  }
}

// ─── Node 4: Refine comprehension question (if one was generated) ─────────────

async function refineQuestionNode(state) {
  const q = state.comprehensionQuestion;
  if (!q) return {};

  try {
    const parser = StructuredOutputParser.fromZodSchema(ComprehensionQuestionSchema);
    const chain  = questionRefinementPrompt.pipe(creativeLLM);

    const response = await chain.invoke({
      session_context:    state.sessionContext,
      question:           q.question,
      options:            q.options.join(" | "),
      correct_index:      q.correctIndex,
      explanation:        q.explanation,
      format_instructions: parser.getFormatInstructions(),
    });

    const refined = await parser.parse(response.content);
    return { comprehensionQuestion: refined };
  } catch {
    // If refinement fails, keep the original question
    return {};
  }
}

// ─── Node 5: Persist context to session memory ───────────────────────────────

async function persistContextNode(state) {
  if (!state.summary || !state.isInstructional) return {};

  const memory = getSessionMemory(state.sessionId);
  await memory.addTeachingContext(state.summary);
  return {};
}

// ─── Conditional edges ────────────────────────────────────────────────────────

function shouldAnalyze(state) {
  // Skip all processing if no frame data
  if (!state.frameB64) return "skip";
  return "analyze";
}

function shouldRefineQuestion(state) {
  // Only run the question refinement node if a question was generated
  if (state.comprehensionQuestion && state.isInstructional) return "refine";
  return "persist";
}

function isInstructionalContent(state) {
  if (state.error) return "done";
  if (!state.isInstructional) return "done";
  return "has_content";
}

// ─── Build the graph ──────────────────────────────────────────────────────────

const workflow = new StateGraph(PipelineState)
  .addNode("load_context",    loadContextNode)
  .addNode("vision_analysis", visionAnalysisNode)
  .addNode("parse_output",    parseOutputNode)
  .addNode("refine_question", refineQuestionNode)
  .addNode("persist_context", persistContextNode)

  // Entry: always load context first
  .addEdge(START, "load_context")

  // After context load, decide whether to proceed
  .addConditionalEdges("load_context", shouldAnalyze, {
    analyze: "vision_analysis",
    skip:    END,
  })

  // Vision → parse
  .addEdge("vision_analysis", "parse_output")

  // After parse, check if content is instructional
  .addConditionalEdges("parse_output", isInstructionalContent, {
    has_content: "refine_question",  // go through question refinement
    done:        END,                // idle screen — short-circuit
  })

  // After question refinement decision
  .addConditionalEdges("refine_question", shouldRefineQuestion, {
    refine:  "refine_question",  // self-loop handled by node returning early
    persist: "persist_context",
  })

  .addEdge("persist_context", END);

export const screenAnalysisGraph = workflow.compile();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full screen analysis LangGraph pipeline.
 *
 * @param {string} sessionId
 * @param {string} frameB64  Base64 PNG screenshot
 * @param {string} transcript Whisper transcript (optional)
 * @returns {Promise<{ guideBlocks, comprehensionQuestion }>}
 */
export async function runScreenAnalysis(sessionId, frameB64, transcript = "") {
  const result = await screenAnalysisGraph.invoke({
    sessionId,
    frameB64,
    transcript,
  });

  return {
    guideBlocks:           result.guideBlocks ?? [],
    comprehensionQuestion: result.comprehensionQuestion ?? null,
  };
}
