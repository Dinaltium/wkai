import { createClient } from "redis";

// Sessions are not all one afternoon: a course or bootcamp can keep the same
// room open for days. A 24-hour TTL expired the room's Redis state underneath a
// session that was still running, which reset student counts and dropped the
// session snapshot mid-workshop.
const SESSION_TTL_SECONDS = 604_800;    // 7 days
const STUDENT_SET_TTL_SECONDS = 604_800; // matches session data TTL

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

/** Store session room data for the lifetime of a multi-day workshop. */
export async function setSessionData(sessionId, data) {
  await redis.setEx(
    `session:${sessionId}`,
    SESSION_TTL_SECONDS,
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

// ─── Removed (kicked) students ────────────────────────────────────────────────
// A join hands out a fresh random studentId every time, so banning the id alone
// would only survive until the student clicked "join" again. The display name
// is stored alongside it: not identity-grade, but it is what an instructor
// actually means by "remove this person from my room".

function removedKey(sessionId) {
  return `students_removed:${sessionId}`;
}

function nameMember(studentName) {
  return `name:${String(studentName ?? "").trim().toLowerCase()}`;
}

export async function addRemovedStudent(sessionId, studentId, studentName) {
  const key = removedKey(sessionId);
  const members = [`id:${studentId}`];
  if (studentName) members.push(nameMember(studentName));
  await redis.sAdd(key, members);
  await redis.expire(key, STUDENT_SET_TTL_SECONDS);
}

export async function isStudentRemoved(sessionId, studentId, studentName) {
  const key = removedKey(sessionId);
  const checks = [redis.sIsMember(key, `id:${studentId}`)];
  if (studentName) checks.push(redis.sIsMember(key, nameMember(studentName)));
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

export async function readmitStudent(sessionId, studentId, studentName) {
  const key = removedKey(sessionId);
  const members = [`id:${studentId}`];
  if (studentName) members.push(nameMember(studentName));
  await redis.sRem(key, members);
}

export async function clearRemovedStudents(sessionId) {
  await redis.del(removedKey(sessionId));
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
