import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { textLLM, callWithRetry } from "../groqClient.js";
import { getSessionMemory } from "../memory.js";
import { getLangSmithConfig } from "../langsmith.js";
import { isLowSignalTranscript } from "../transcriptQuality.js";

const TranscriptExplainerState = Annotation.Root({
  sessionId: Annotation({ reducer: (_, v) => v }),
  transcript: Annotation({ reducer: (_, v) => v }),
  sessionContext: Annotation({ reducer: (_, v) => v, default: () => "" }),
  explanation: Annotation({ reducer: (_, v) => v, default: () => "" }),
});

// The literal reply that means "this is not worth a card". Cheaper and far
// more reliable than structured output for a one-field decision.
const SKIP_TOKEN = "SKIP";

const transcriptPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are WKAI Live Narrator. You restate what an instructor just said so
students reading the guide can follow it. You are a transcriber's editor, not
a teacher: you add nothing.

Rules:
- Use ONLY what is in the transcript. Never add a fact, a step, an instruction,
  a tool, a file name, a number or an example that is not in it.
- Never infer what the instructor is about to do, or what students should do
  next, unless the transcript says so in words.
- 1-3 sentences. Plainer than the transcript, never larger in substance.
- The transcript comes from automatic speech recognition in a live room, so it
  may be mis-heard, cut off mid-sentence, or pick up noise as words. If it is
  garbled, fragmentary, off-topic small talk, or says nothing a student could
  learn from or act on, reply with exactly ${SKIP_TOKEN} and nothing else.
- Never invent a plausible sentence to fill a gap. ${SKIP_TOKEN} is always the
  right answer when you are unsure what was said.
- Session context is background only. Never turn it into an explanation: if the
  transcript itself carries nothing, the answer is ${SKIP_TOKEN}.`,
  ],
  [
    "human",
    "Session context:\n{session_context}\n\nInstructor transcript:\n{transcript}\n\nRestate it, or reply SKIP:",
  ],
]);

async function loadContextNode(state) {
  const memory = getSessionMemory(state.sessionId);
  return { sessionContext: await memory.getContextString() };
}

async function explainTranscriptNode(state) {
  try {
    const chain = transcriptPrompt.pipe(textLLM);
    const result = await callWithRetry(() =>
      chain.invoke({
        session_context: state.sessionContext || "No prior session context.",
        transcript: state.transcript,
      })
    );
    const raw = String(result.content ?? "").trim();
    // The model sometimes dresses its refusal up ("SKIP." / "SKIP - nothing
    // substantive was said"), so match the opening rather than equality.
    if (!raw || raw.toUpperCase().startsWith(SKIP_TOKEN)) return { explanation: "" };
    return { explanation: raw };
  } catch {
    // This used to return "Instructor shared an update. Continue following the
    // current workshop steps." — a card the instructor never said, published
    // under their name because a request failed. Silence is the honest outcome.
    return { explanation: "" };
  }
}

const workflow = new StateGraph(TranscriptExplainerState)
  .addNode("load_context", loadContextNode)
  .addNode("explain_transcript", explainTranscriptNode)
  .addEdge(START, "load_context")
  .addEdge("load_context", "explain_transcript")
  .addEdge("explain_transcript", END);

const transcriptExplainerGraph = workflow.compile();

export async function expandTranscriptForStudents(sessionId, transcript) {
  if (!transcript?.trim()) return null;
  // Cheap gate before the paid one: filler and stock ASR phrases never reach
  // the model, so they can never come back as fluent invented guidance.
  if (isLowSignalTranscript(transcript)) return null;
  const result = await transcriptExplainerGraph.invoke(
    { sessionId, transcript },
    getLangSmithConfig("transcript-explainer", ["langgraph", "langchain", "langsmith"])
  );
  const explanation = String(result.explanation ?? "").trim();
  return explanation || null;
}

