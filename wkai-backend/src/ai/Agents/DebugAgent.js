import { runErrorDiagnosis } from "../graphs/errorAgent.js";
import { createBaseAgent } from "./BaseAgent.js";

export async function diagnoseStudentError(errorMessage) {
  return DebugAgent.invoke({ errorMessage });
}

export const DebugAgent = createBaseAgent({
  name: "DebugAgent",
  version: "1.0.0",
  tags: ["debug", "diagnosis", "langgraph"],
  async invoke({ errorMessage }) {
    return runErrorDiagnosis(errorMessage);
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "DebugAgent", version: "1.0.0" };
  },
});

