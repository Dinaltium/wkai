import { generateTranscriptComprehension } from "../graphs/comprehensionCoachAgent.js";
import { createBaseAgent } from "./BaseAgent.js";

export async function buildTranscriptQuiz(sessionId, transcript) {
  return QuizAgent.invoke({ sessionId, transcript });
}

export const QuizAgent = createBaseAgent({
  name: "QuizAgent",
  version: "1.0.0",
  tags: ["quiz", "comprehension", "langgraph"],
  async invoke({ sessionId, transcript }) {
    return generateTranscriptComprehension(sessionId, transcript);
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "QuizAgent", version: "1.0.0" };
  },
});

