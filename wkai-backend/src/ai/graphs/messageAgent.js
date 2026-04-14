import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { textLLM, callWithRetry } from "../groqClient.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getSessionMemory } from "../memory.js";
import { getLangSmithConfig } from "../langsmith.js";

const MessageAgentState = Annotation.Root({
  sessionId: Annotation({ reducer: (_, v) => v }),
  studentName: Annotation({ reducer: (_, v) => v }),
  message: Annotation({ reducer: (_, v) => v }),
  sessionContext: Annotation({ reducer: (_, v) => v, default: () => "" }),
  response: Annotation({ reducer: (_, v) => v, default: () => null }),
});

const messagePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are WKAI, an assistant in a live coding workshop.
A student question was not answered yet by the instructor.
Reply clearly and briefly with practical guidance.

Session context:
{session_context}

Rules:
- Maximum 3 sentences.
- Do not claim certainty when unsure.
- If related to setup/runtime issues, suggest concrete version-check commands (for example: node -v, npm -v, python --version) before proposing fixes.
- If additional context is missing, ask one short clarifying question.
- If unrelated to workshop context, redirect politely.`,
  ],
  ["human", "Student {student_name} asks: {message}"],
]);

async function loadContextNode(state) {
  const memory = getSessionMemory(state.sessionId);
  const sessionContext = await memory.getContextString();
  return { sessionContext };
}

async function generateResponseNode(state) {
  try {
    const chain = messagePrompt.pipe(textLLM);
    const res = await callWithRetry(() =>
      chain.invoke({
        session_context: state.sessionContext || "No prior context.",
        student_name: state.studentName,
        message: state.message,
      })
    );
    return { response: String(res.content ?? "").trim() || null };
  } catch (err) {
    console.error("[MessageAgent] Error:", err.message);
    return { response: "I could not process your question right now. Please ask the instructor directly." };
  }
}

const workflow = new StateGraph(MessageAgentState)
  .addNode("load_context", loadContextNode)
  .addNode("generate_response", generateResponseNode)
  .addEdge(START, "load_context")
  .addEdge("load_context", "generate_response")
  .addEdge("generate_response", END);

export const messageAgentGraph = workflow.compile();

export async function generateMessageResponse(sessionId, studentName, message) {
  const result = await messageAgentGraph.invoke(
    { sessionId, studentName, message },
    getLangSmithConfig("message-agent", ["langgraph", "langchain", "langsmith"])
  );
  return result.response ?? "I could not process your question right now.";
}
