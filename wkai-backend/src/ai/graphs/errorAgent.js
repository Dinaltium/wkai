import { StateGraph, END, START } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { textLLM, callWithRetry } from "../groqClient.js";
import {
  errorDiagnosisPrompt,
  errorResolutionParser,
  fixingErrorParser,
} from "../prompts.js";

// ─── State ────────────────────────────────────────────────────────────────────

const ErrorAgentState = Annotation.Root({
  errorMessage:  Annotation({ reducer: (_, v) => v }),
  rawDiagnosis:  Annotation({ reducer: (_, v) => v, default: () => null }),
  resolution:    Annotation({ reducer: (_, v) => v, default: () => null }),
  retryCount:    Annotation({ reducer: (_, v) => v, default: () => 0 }),
  parseError:    Annotation({ reducer: (_, v) => v, default: () => null }),
  isResolved:    Annotation({ reducer: (_, v) => v, default: () => false }),
});

const MAX_RETRIES = 2;

// ─── Node 1: Classify the error type before diagnosis ────────────────────────
// This pre-classification helps the diagnosis prompt be more targeted.

async function classifyErrorNode(state) {
  // Quick heuristic classification (no LLM call needed — saves tokens)
  const msg = state.errorMessage.toLowerCase();

  let errorClass = "unknown";
  if (msg.includes("modulenotfounderror") || msg.includes("cannot find module") ||
      msg.includes("no module named") || msg.includes("importerror")) {
    errorClass = "missing_dependency";
  } else if (msg.includes("syntaxerror") || msg.includes("unexpected token") ||
             msg.includes("unexpected indent")) {
    errorClass = "syntax_error";
  } else if (msg.includes("permission denied") || msg.includes("eacces") ||
             msg.includes("operation not permitted")) {
    errorClass = "permission_error";
  } else if (msg.includes("command not found") || msg.includes("is not recognized")) {
    errorClass = "missing_tool";
  } else if (msg.includes("typeerror") || msg.includes("attributeerror") ||
             msg.includes("nameerror") || msg.includes("referenceerror")) {
    errorClass = "runtime_error";
  } else if (msg.includes("connection refused") || msg.includes("econnrefused") ||
             msg.includes("timeout")) {
    errorClass = "network_error";
  }

  // Inject the classification into the error message for the LLM
  const enrichedMessage = `[Error class: ${errorClass}]\n\n${state.errorMessage}`;
  return { errorMessage: enrichedMessage };
}

// ─── Node 2: Diagnose the error ───────────────────────────────────────────────

async function diagnoseNode(state) {
  try {
    const formatInstructions = errorResolutionParser.getFormatInstructions();
    const chain = errorDiagnosisPrompt.pipe(textLLM);

    const response = await callWithRetry(() =>
      chain.invoke({
        error_message: state.errorMessage,
        format_instructions: formatInstructions,
      })
    );

    return { rawDiagnosis: response.content };
  } catch (err) {
    console.error("[ErrorAgent] diagnoseNode failed:", err.message);
    const lower = String(err?.message ?? "").toLowerCase();
    const isRateLimit = err?.status === 429 || lower.includes("rate limit") || lower.includes("quota");
    const isApiUnavailable =
      lower.includes("api key") ||
      lower.includes("unauthorized") ||
      lower.includes("forbidden") ||
      lower.includes("service unavailable") ||
      lower.includes("timeout");
    return {
      parseError: err.message,
      rawDiagnosis: null,
      resolution: isRateLimit
        ? usageLimitResolution()
        : isApiUnavailable
        ? aiUnavailableResolution()
        : null,
      retryCount: (state.retryCount ?? 0) + 1,
    };
  }
}

// ─── Node 3: Parse the diagnosis output ──────────────────────────────────────

async function parseDiagnosisNode(state) {
  if (!state.rawDiagnosis) {
    return {
      resolution: state.resolution ?? fallbackResolution(),
      isResolved: false,
      retryCount: (state.retryCount ?? 0) + 1,
    };
  }

  try {
    const parsed = await errorResolutionParser.parse(state.rawDiagnosis);
    return {
      resolution: {
        diagnosis:    parsed.diagnosis,
        fixCommand:   parsed.fixCommand   ?? null,
        fixSteps:     parsed.fixSteps     ?? null,
        isSetupError: parsed.isSetupError ?? false,
        severity:     parsed.severity     ?? "blocking",
      },
      isResolved: true,
    };
  } catch (parseErr) {
    // Try with self-healing parser before retrying
    try {
      const parsed = await fixingErrorParser.parse(state.rawDiagnosis);
      return {
        resolution: {
          diagnosis:    parsed.diagnosis,
          fixCommand:   parsed.fixCommand   ?? null,
          fixSteps:     parsed.fixSteps     ?? null,
          isSetupError: parsed.isSetupError ?? false,
          severity:     parsed.severity     ?? "blocking",
        },
        isResolved: true,
      };
    } catch {
      console.warn("[ErrorAgent] parse failed, retrying with fallback path");
      return {
        parseError: parseErr.message,
        isResolved: false,
        retryCount: state.retryCount + 1,
      };
    }
  }
}

// ─── Node 4: Fallback response if all retries fail ───────────────────────────

async function fallbackNode(state) {
  return {
    resolution: fallbackResolution(),
    isResolved: true,
  };
}

// ─── Conditional edges ────────────────────────────────────────────────────────

function shouldRetryOrFallback(state) {
  if (state.isResolved) return "done";
  if (state.retryCount >= MAX_RETRIES) return "fallback";
  return "retry";
}

// ─── Build the graph ──────────────────────────────────────────────────────────

const workflow = new StateGraph(ErrorAgentState)
  .addNode("classify",       classifyErrorNode)
  .addNode("diagnose",       diagnoseNode)
  .addNode("parse",          parseDiagnosisNode)
  .addNode("fallback",       fallbackNode)

  .addEdge(START,      "classify")
  .addEdge("classify", "diagnose")
  .addEdge("diagnose", "parse")

  .addConditionalEdges("parse", shouldRetryOrFallback, {
    done:     END,
    retry:    "diagnose",   // loop back with incremented retryCount
    fallback: "fallback",
  })

  .addEdge("fallback", END);

export const errorDiagnosisGraph = workflow.compile();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the error diagnosis LangGraph agent.
 * Includes automatic retry (up to 2x) and graceful fallback.
 *
 * @param {string} errorMessage  Raw terminal error pasted by the student
 * @returns {Promise<ErrorResolution>}
 */
export async function runErrorDiagnosis(errorMessage) {
  const result = await errorDiagnosisGraph.invoke({ errorMessage });
  return result.resolution ?? fallbackResolution();
}

function fallbackResolution() {
  return {
    diagnosis: "AI diagnosis is currently not available.",
    fixCommand:   null,
    fixSteps: [
      "Ask the instructor to verify the Groq API key is valid and active.",
      "If usage limits are reached, wait for quota reset or use a different API key.",
      "Try diagnosis again after API availability is restored.",
    ],
    isSetupError: false,
    severity:     "blocking",
  };
}

function usageLimitResolution() {
  return {
    diagnosis: "AI diagnosis not available: Groq usage limit reached.",
    fixCommand: null,
    fixSteps: [
      "Wait for API quota reset, then retry.",
      "Or switch to another Groq API key with available credits/limits.",
    ],
    isSetupError: false,
    severity: "warning",
  };
}

function aiUnavailableResolution() {
  return {
    diagnosis: "AI diagnosis not available: Groq API is unreachable or not authorized.",
    fixCommand: null,
    fixSteps: [
      "Confirm instructor Groq API key is configured correctly.",
      "Check backend network connectivity and API availability.",
      "Retry after restoring API access.",
    ],
    isSetupError: false,
    severity: "blocking",
  };
}
