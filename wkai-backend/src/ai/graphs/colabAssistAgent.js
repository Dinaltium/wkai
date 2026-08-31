import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { textLLM, callWithRetry } from "../groqClient.js";
import { buildSessionContext } from "../sessionContext.js";
import { extractJsonBlock } from "../jsonBlock.js";
import { getLangSmithConfig } from "../langsmith.js";

const ColabAssistState = Annotation.Root({
  sessionId: Annotation({ reducer: (_, v) => v }),
  studentId: Annotation({ reducer: (_, v) => v }),
  colabContent: Annotation({ reducer: (_, v) => v }),
  contentType: Annotation({ reducer: (_, v) => v, default: () => "log" }),
  sessionContext: Annotation({ reducer: (_, v) => v, default: () => "" }),
  advice: Annotation({ reducer: (_, v) => v, default: () => "" }),
  followUpQuestions: Annotation({ reducer: (_, v) => v, default: () => [] }),
});

const OutputSchema = z.object({
  advice: z.string().min(1).max(1200),
  followUpQuestions: z.array(z.string().min(1).max(200)).max(3),
});

const outputParser = StructuredOutputParser.fromZodSchema(OutputSchema);

const colabPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are WKAI Colab Assistant helping a student in a live coding workshop.

Session context:
{session_context}

Input type: {content_type}
Input:
{colab_content}

Rules:
- Output plain, practical guidance in under 200 words.
- Prefer the libraries, versions, commands and patterns the session context
  shows the instructor using, over the generic answer.
- When input type is "notebook", the cells and outputs below were fetched from
  the student's notebook — reason about them directly.
- Only if the input is a bare URL that could not be fetched, ask the student to
  paste the failing cell, its output and the traceback.
- For errors, explain root cause first, then precise next steps.
- Keep language student-friendly.
- Return 2-3 concise follow-up questions that help unblock the student.

{format_instructions}`,
  ],
]);

async function loadContextNode(state) {
  return { sessionContext: await buildSessionContext(state.sessionId, state.colabContent) };
}

async function analyzeColabNode(state) {
  try {
    const chain = colabPrompt.pipe(textLLM);
    const response = await callWithRetry(() =>
      chain.invoke({
        session_context: state.sessionContext || "No prior context.",
        content_type: state.contentType || "log",
        colab_content: state.colabContent,
        format_instructions: outputParser.getFormatInstructions(),
      })
    );
    const parsed = await outputParser.parse(extractJsonBlock(response.content));
    return {
      advice: parsed.advice.trim(),
      followUpQuestions: parsed.followUpQuestions ?? [],
    };
  } catch (err) {
    console.error("[ColabAssistAgent] Analysis failed:", err.message);
    return {
      advice:
        "I could not analyze your Colab content right now. Please paste the exact error traceback and the related code cell so I can help.",
      followUpQuestions: [
        "What exact error message do you see?",
        "Which cell fails first when you run from top?",
      ],
    };
  }
}

const workflow = new StateGraph(ColabAssistState)
  .addNode("load_context", loadContextNode)
  .addNode("analyze_colab", analyzeColabNode)
  .addEdge(START, "load_context")
  .addEdge("load_context", "analyze_colab")
  .addEdge("analyze_colab", END);

export const colabAssistGraph = workflow.compile();

export async function analyzeColab(sessionId, studentId, colabContent, contentType) {
  const result = await colabAssistGraph.invoke(
    { sessionId, studentId, colabContent, contentType },
    getLangSmithConfig("colab-assist-agent", ["langgraph", "colab", "assistant"])
  );

  return {
    advice: result.advice,
    followUpQuestions: result.followUpQuestions ?? [],
  };
}
