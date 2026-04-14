import { detectShareIntent } from "../graphs/intentAgent.js";
import { createBaseAgent } from "./BaseAgent.js";

export async function detectShareIntentForFiles(transcript, recentFiles = []) {
  return IntentAgent.invoke({ transcript, recentFiles });
}

export const IntentAgent = createBaseAgent({
  name: "IntentAgent",
  version: "1.0.0",
  tags: ["intent", "fileshare", "langgraph"],
  async invoke({ transcript, recentFiles = [] }) {
    return detectShareIntent(transcript, recentFiles);
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "IntentAgent", version: "1.0.0" };
  },
});

