import { BaseListChatMessageHistory } from "@langchain/core/chat_history";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { redis } from "../db/redis.js";

const HISTORY_TTL = 86_400;     // 24 hours (matches session TTL)
const MAX_MESSAGES = 20;        // keep last 20 turns to avoid context overflow

/**
 * Redis-backed LangChain chat message history.
 *
 * Stores per-session conversation context so each Groq call
 * has awareness of what was already taught / explained.
 * This gives the AI "memory" of the entire workshop session.
 */
export class RedisSessionMemory extends BaseListChatMessageHistory {
  lc_namespace = ["wkai", "memory"];

  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.key = `memory:${sessionId}`;
  }

  async getMessages() {
    try {
      const raw = await redis.get(this.key);
      if (!raw) return [];
      const stored = JSON.parse(raw);
      return stored.map(deserializeMessage);
    } catch {
      return [];
    }
  }

  async addMessage(message) {
    const existing = await this.getMessages();
    const updated = [...existing, message].slice(-MAX_MESSAGES);
    await redis.setEx(this.key, HISTORY_TTL, JSON.stringify(updated.map(serializeMessage)));
  }

  async addMessages(messages) {
    const existing = await this.getMessages();
    const updated = [...existing, ...messages].slice(-MAX_MESSAGES);
    await redis.setEx(this.key, HISTORY_TTL, JSON.stringify(updated.map(serializeMessage)));
  }

  async clear() {
    await redis.del(this.key);
  }

  /** Add a summary of what was just taught (called after each guide block is saved) */
  async addTeachingContext(summary) {
    await this.addMessage(new AIMessage(`[Workshop context] ${summary}`));
  }

  /** Get recent context as a plain string for prompt injection */
  async getContextString() {
    const messages = await this.getMessages();
    if (!messages.length) return "";
    return messages
      .slice(-8) // last 8 messages for context window efficiency
      .map((m) => {
        if (m instanceof AIMessage) return `Assistant: ${m.content}`;
        if (m instanceof HumanMessage) return `Student: ${m.content}`;
        return m.content;
      })
      .join("\n");
  }
}

// ─── Session memory registry — one instance per active session ───────────────
const memoryRegistry = new Map();

export function getSessionMemory(sessionId) {
  if (!memoryRegistry.has(sessionId)) {
    memoryRegistry.set(sessionId, new RedisSessionMemory(sessionId));
  }
  return memoryRegistry.get(sessionId);
}

export function clearSessionMemory(sessionId) {
  const mem = memoryRegistry.get(sessionId);
  if (mem) {
    mem.clear();
    memoryRegistry.delete(sessionId);
  }
}

// ─── Serialization helpers ────────────────────────────────────────────────────

function serializeMessage(msg) {
  if (msg instanceof HumanMessage) return { role: "human",  content: msg.content };
  if (msg instanceof AIMessage)    return { role: "ai",     content: msg.content };
  if (msg instanceof SystemMessage)return { role: "system", content: msg.content };
  return { role: "unknown", content: String(msg.content) };
}

function deserializeMessage(obj) {
  switch (obj.role) {
    case "human":  return new HumanMessage(obj.content);
    case "ai":     return new AIMessage(obj.content);
    case "system": return new SystemMessage(obj.content);
    default:       return new HumanMessage(obj.content);
  }
}
