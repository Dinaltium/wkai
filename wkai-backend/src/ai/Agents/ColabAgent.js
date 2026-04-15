import { createBaseAgent } from "./BaseAgent.js";
import { analyzeColab } from "../graphs/colabAssistAgent.js";

export async function analyzeColabContent(sessionId, studentId, colabContent, contentType) {
  return ColabAgent.invoke({ sessionId, studentId, colabContent, contentType });
}

export const ColabAgent = createBaseAgent({
  name: "ColabAgent",
  version: "1.0.0",
  tags: ["colab", "assistant", "langgraph"],
  async invoke({ sessionId, studentId, colabContent, contentType }) {
    return analyzeColab(sessionId, studentId, colabContent, contentType);
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "ColabAgent", version: "1.0.0" };
  },
});
