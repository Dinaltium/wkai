import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { textLLM, callWithRetry } from "../groqClient.js";
import { getSessionMemory } from "../memory.js";
import { getLangSmithConfig } from "../langsmith.js";

const TranscriptExplainerState = Annotation.Root({
  sessionId: Annotation({ reducer: (_, v) => v }),
  transcript: Annotation({ reducer: (_, v) => v }),
  sessionContext: Annotation({ reducer: (_, v) => v, default: () => "" }),
  explanation: Annotation({ reducer: (_, v) => v, default: () => "" }),
});

const transcriptPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are WKAI Live Narrator.
Expand a short instructor transcript into clear guidance for students.
Keep it practical and concise (2-4 sentences), preserving intent.
If the transcript includes tasks, convert them into concrete steps.`,
  ],
  [
    "human",
    "Session context:\n{session_context}\n\nInstructor transcript:\n{transcript}\n\nStudent-friendly explanation:",
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
    return { explanation: String(result.content ?? "").trim() };
  } catch {
    return { explanation: "Instructor shared an update. Continue following the current workshop steps." };
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
  const result = await transcriptExplainerGraph.invoke(
    { sessionId, transcript },
    getLangSmithConfig("transcript-explainer", ["langgraph", "langchain", "langsmith"])
  );
  return String(result.explanation ?? "").trim();
}

