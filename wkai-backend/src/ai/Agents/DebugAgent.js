import { runErrorDiagnosis } from "../graphs/errorAgent.js";
import { createBaseAgent } from "./BaseAgent.js";

export async function diagnoseStudentError(errorMessage, sessionId = null) {
  return DebugAgent.invoke({ errorMessage, sessionId });
}

export const DebugAgent = createBaseAgent({
  name: "DebugAgent",
  version: "1.0.0",
  tags: ["debug", "diagnosis", "langgraph"],
  async invoke({ errorMessage, sessionId }) {
    return runErrorDiagnosis(errorMessage, sessionId);
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "DebugAgent", version: "1.0.0" };
  },
});

