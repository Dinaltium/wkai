import { createClient } from "redis";

export const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

redis.on("error", (err) => console.error("[Redis] Error:", err));

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
  await redis.sAdd(`students_active:${sessionId}`, studentId);
  return redis.sCard(`students_active:${sessionId}`);
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

/** Store the latest Whisper transcript for a session (30s TTL — rolling window) */
export async function setTranscript(sessionId, transcript) {
  await redis.setEx(`transcript:${sessionId}`, 30, transcript);
}

export async function getTranscript(sessionId) {
  return redis.get(`transcript:${sessionId}`);
}
