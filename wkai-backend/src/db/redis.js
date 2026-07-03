import { createClient } from "redis";

const STUDENT_SET_TTL_SECONDS = 86_400; // 24h — matches session data TTL

export const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  socket: {
    // Auto-reconnect with capped exponential backoff so a transient drop
    // (common on free tiers) recovers instead of leaving the client dead.
    reconnectStrategy: (retries) => {
      if (retries > 20) {
        console.error("[Redis] Giving up after 20 reconnect attempts");
        return new Error("Redis reconnect failed");
      }
      const delay = Math.min(1000 * 2 ** retries, 15_000);
      console.warn(`[Redis] Reconnecting (attempt ${retries + 1}) in ${delay}ms`);
      return delay;
    },
  },
});

redis.on("error", (err) => console.error("[Redis] Error:", err.message));
redis.on("reconnecting", () => console.warn("[Redis] Reconnecting…"));
redis.on("ready", () => console.log("[Redis] Ready"));

export async function connectRedis() {
  await redis.connect();
  console.log("[Redis] Connected");
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Store session room data with a 24-hour TTL */
export async function setSessionData(sessionId, data) {
  await redis.setEx(
    `session:${sessionId}`,
    86_400, // 24 hours
    JSON.stringify(data)
  );
}

export async function getSessionData(sessionId) {
  const raw = await redis.get(`session:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function deleteSessionData(sessionId) {
  await redis.del(`session:${sessionId}`);
}

/** Track connected clients per session */
export async function incrementStudentCount(sessionId, studentId) {
  const key = `students_active:${sessionId}`;
  await redis.sAdd(key, studentId);
  // Refresh a TTL on the set so an abandoned session (instructor never called
  // /end) can't leave the roster in Redis forever.
  await redis.expire(key, STUDENT_SET_TTL_SECONDS);
  return redis.sCard(key);
}

export async function decrementStudentCount(sessionId, studentId) {
  await redis.sRem(`students_active:${sessionId}`, studentId);
  return redis.sCard(`students_active:${sessionId}`);
}

export async function getStudentCount(sessionId) {
  return redis.sCard(`students_active:${sessionId}`);
}

export async function clearStudentConnections(sessionId) {
  await redis.del(`students_active:${sessionId}`);
}

/** Track the LiveKit RTMP ingress id for a session (for teardown on end). */
export async function setSessionIngress(sessionId, ingressId) {
  await redis.setEx(`livekit_ingress:${sessionId}`, 86_400, ingressId);
}
export async function getSessionIngress(sessionId) {
  return redis.get(`livekit_ingress:${sessionId}`);
}
export async function clearSessionIngress(sessionId) {
  await redis.del(`livekit_ingress:${sessionId}`);
}

/** Store the latest Whisper transcript for a session (30s TTL — rolling window) */
export async function setTranscript(sessionId, transcript) {
  await redis.setEx(`transcript:${sessionId}`, 30, transcript);
}

export async function getTranscript(sessionId) {
  return redis.get(`transcript:${sessionId}`);
}
