import test from "node:test";
import assert from "node:assert/strict";
import { Agents, listAgentNames } from "../src/ai/Agents/AgentRegistry.js";

const EXPECTED_AGENTS = [
  "VoiceAgent",
  "QuizAgent",
  "DebugAgent",
  "IntentAgent",
  "MessageAgent",
];

test("agent registry exposes expected agent names", () => {
  const names = listAgentNames().sort();
  assert.deepEqual(names, [...EXPECTED_AGENTS].sort());
});

test("all agents satisfy BaseAgent contract", async () => {
  for (const name of EXPECTED_AGENTS) {
    const agent = Agents[name];
    assert.ok(agent, `${name} should exist`);
    assert.equal(typeof agent.name, "string");
    assert.equal(typeof agent.version, "string");
    assert.equal(typeof agent.invoke, "function");
    assert.equal(typeof agent.healthCheck, "function");
    assert.equal(typeof agent.isEnabled, "function");
    assert.equal(typeof agent.getMetrics, "function");
    const health = await agent.healthCheck();
    assert.ok(health && typeof health === "object", `${name} healthCheck should return object`);
    assert.ok("status" in health, `${name} health should include status`);
  }
});

test("feature flags disable agent invocation safely", async () => {
  const previous = process.env.AI_AGENT_QUIZ_AGENT_ENABLED;
  process.env.AI_AGENT_QUIZ_AGENT_ENABLED = "false";
  try {
    const result = await Agents.QuizAgent.invoke({ sessionId: "s1", transcript: "hello" });
    assert.equal(result.available, false);
    assert.equal(result.reason, "disabled_by_feature_flag");
    assert.equal(result.agent, "QuizAgent");
  } finally {
    if (previous === undefined) delete process.env.AI_AGENT_QUIZ_AGENT_ENABLED;
    else process.env.AI_AGENT_QUIZ_AGENT_ENABLED = previous;
  }
});

