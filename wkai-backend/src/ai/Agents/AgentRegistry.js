import { VoiceAgent } from "./VoiceAgent.js";
import { QuizAgent } from "./QuizAgent.js";
import { DebugAgent } from "./DebugAgent.js";
import { IntentAgent } from "./IntentAgent.js";
import { MessageAgent } from "./MessageAgent.js";
import { getAllAgentMetrics } from "./BaseAgent.js";

export const Agents = {
  VoiceAgent,
  QuizAgent,
  DebugAgent,
  IntentAgent,
  MessageAgent,
};

export function listAgentNames() {
  return Object.keys(Agents);
}

export async function getAgentHealthReport() {
  const names = listAgentNames();
  const entries = await Promise.all(
    names.map(async (name) => {
      const agent = Agents[name];
      try {
        const health = await agent.healthCheck();
        return { name, ...health };
      } catch (err) {
        return {
          name,
          status: "unhealthy",
          enabled: agent.isEnabled?.() ?? true,
          error: err?.message ?? String(err),
        };
      }
    })
  );
  return entries;
}

export function getAgentMetricsReport() {
  return getAllAgentMetrics();
}

