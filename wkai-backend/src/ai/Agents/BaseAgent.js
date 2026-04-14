import { debugError, debugLog } from "../../utils/debug.js";

const agentMetrics = new Map();

function toFlagKey(agentName) {
  return `AI_AGENT_${String(agentName).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_ENABLED`;
}

function readEnabled(agentName) {
  const key = toFlagKey(agentName);
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === "") return true;
  const lower = String(raw).toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes" || lower === "on";
}

function getOrInitMetrics(name) {
  if (!agentMetrics.has(name)) {
    agentMetrics.set(name, {
      name,
      calls: 0,
      errors: 0,
      totalLatencyMs: 0,
      lastLatencyMs: 0,
      avgLatencyMs: 0,
      totalTokenCost: 0,
      lastTokenCost: 0,
      errorRate: 0,
      lastError: null,
      lastInvokedAt: null,
      lastTags: [],
    });
  }
  return agentMetrics.get(name);
}

function extractTokenCost(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return 0;
  const usage = result.usage ?? result.tokenUsage ?? result.response_metadata?.tokenUsage;
  if (!usage || typeof usage !== "object") return 0;
  const prompt = Number(usage.promptTokens ?? usage.input_tokens ?? 0);
  const completion = Number(usage.completionTokens ?? usage.output_tokens ?? 0);
  return Number.isFinite(prompt + completion) ? prompt + completion : 0;
}

export function createBaseAgent({ name, version, tags = [], invoke, healthCheck }) {
  if (!name || typeof invoke !== "function" || typeof healthCheck !== "function") {
    throw new Error("createBaseAgent requires name, invoke, and healthCheck");
  }

  const agent = {
    name,
    version: version ?? "1.0.0",
    tags,
    isEnabled() {
      return readEnabled(name);
    },
    async invoke(input) {
      const enabled = this.isEnabled();
      const metrics = getOrInitMetrics(name);
      const started = Date.now();

      metrics.calls += 1;
      metrics.lastInvokedAt = new Date().toISOString();
      metrics.lastTags = tags;
      debugLog("AI_AGENT", "invoke started", { name, version: this.version, enabled, tags });

      if (!enabled) {
        const latency = Date.now() - started;
        metrics.lastLatencyMs = latency;
        metrics.totalLatencyMs += latency;
        metrics.avgLatencyMs = Number((metrics.totalLatencyMs / metrics.calls).toFixed(2));
        return {
          available: false,
          reason: "disabled_by_feature_flag",
          agent: name,
        };
      }

      try {
        const result = await invoke(input);
        const latency = Date.now() - started;
        const tokenCost = extractTokenCost(result);
        metrics.lastLatencyMs = latency;
        metrics.totalLatencyMs += latency;
        metrics.avgLatencyMs = Number((metrics.totalLatencyMs / metrics.calls).toFixed(2));
        metrics.lastTokenCost = tokenCost;
        metrics.totalTokenCost += tokenCost;
        metrics.errorRate = Number((metrics.errors / metrics.calls).toFixed(4));
        debugLog("AI_AGENT", "invoke success", {
          name,
          latencyMs: latency,
          tokenCost,
          errorRate: metrics.errorRate,
          tags,
        });
        return result;
      } catch (err) {
        const latency = Date.now() - started;
        metrics.errors += 1;
        metrics.lastLatencyMs = latency;
        metrics.totalLatencyMs += latency;
        metrics.avgLatencyMs = Number((metrics.totalLatencyMs / metrics.calls).toFixed(2));
        metrics.errorRate = Number((metrics.errors / metrics.calls).toFixed(4));
        metrics.lastError = err?.message ?? String(err);
        debugError("AI_AGENT", `${name} invoke failed`, err);
        throw err;
      }
    },
    async healthCheck() {
      const enabled = this.isEnabled();
      if (!enabled) {
        return { status: "disabled", enabled: false, name, version: this.version, tags };
      }
      return healthCheck();
    },
    getMetrics() {
      return { ...getOrInitMetrics(name) };
    },
  };

  return agent;
}

export function getAllAgentMetrics() {
  return [...agentMetrics.values()].map((m) => ({ ...m }));
}

