import { generateMessageResponse } from "../graphs/messageAgent.js";
import { createBaseAgent } from "./BaseAgent.js";

export async function replyToStudentMessage(sessionId, studentName, message) {
  return MessageAgent.invoke({ sessionId, studentName, message });
}

export const MessageAgent = createBaseAgent({
  name: "MessageAgent",
  version: "1.0.0",
  tags: ["message", "assistant", "langgraph"],
  async invoke({ sessionId, studentName, message }) {
    return generateMessageResponse(sessionId, studentName, message);
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "MessageAgent", version: "1.0.0" };
  },
});

