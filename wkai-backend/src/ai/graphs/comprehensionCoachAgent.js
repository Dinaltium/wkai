import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { StructuredOutputParser } from "langchain/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { creativeLLM, callWithRetry } from "../groqClient.js";
import { getSessionMemory } from "../memory.js";
import { getLangSmithConfig } from "../langsmith.js";

const CoachState = Annotation.Root({
  sessionId: Annotation({ reducer: (_, v) => v }),
  transcript: Annotation({ reducer: (_, v) => v }),
  sessionContext: Annotation({ reducer: (_, v) => v, default: () => "" }),
  question: Annotation({ reducer: (_, v) => v, default: () => null }),
});

const QuestionSchema = z.object({
  question: z.string().min(8),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(6),
});

const parser = StructuredOutputParser.fromZodSchema(QuestionSchema);

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Create one concise comprehension MCQ from the latest workshop transcript.
Focus on understanding, not trivia.
Return strictly in the required structured format.
{format_instructions}`,
  ],
  [
    "human",
    "Session context:\n{session_context}\n\nLatest transcript:\n{transcript}",
  ],
]);

async function loadContextNode(state) {
  const memory = getSessionMemory(state.sessionId);
  return { sessionContext: await memory.getContextString() };
}

async function generateQuestionNode(state) {
  try {
    const chain = prompt.pipe(creativeLLM);
    const result = await callWithRetry(() =>
      chain.invoke({
        session_context: state.sessionContext || "No context.",
        transcript: state.transcript,
        format_instructions: parser.getFormatInstructions(),
      })
    );
    return { question: await parser.parse(String(result.content ?? "")) };
  } catch {
    return { question: null };
  }
}

const workflow = new StateGraph(CoachState)
  .addNode("load_context", loadContextNode)
  .addNode("generate_question", generateQuestionNode)
  .addEdge(START, "load_context")
  .addEdge("load_context", "generate_question")
  .addEdge("generate_question", END);

const comprehensionCoachGraph = workflow.compile();

export async function generateTranscriptComprehension(sessionId, transcript) {
  if (!transcript?.trim()) return null;
  const result = await comprehensionCoachGraph.invoke(
    { sessionId, transcript },
    getLangSmithConfig("transcript-comprehension-coach", ["langgraph", "langchain", "langsmith"])
  );
  return result.question ?? null;
}

