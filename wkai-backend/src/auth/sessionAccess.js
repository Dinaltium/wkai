import crypto from "crypto";

// Student join tokens: default 8h so they comfortably outlast a workshop day and
// don't expire mid-session. Instructor tokens: 12h (they own the session for its
// whole life). Both overridable via env.
const STUDENT_TOKEN_TTL_SECONDS = Number(process.env.STUDENT_JOIN_TOKEN_TTL_SECONDS ?? 8 * 60 * 60);
const INSTRUCTOR_TOKEN_TTL_SECONDS = Number(process.env.INSTRUCTOR_TOKEN_TTL_SECONDS ?? 12 * 60 * 60);
const DEV_FALLBACK_SECRET = "wkai-dev-student-join-secret-change-me";
const SECRET =
  process.env.STUDENT_JOIN_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  DEV_FALLBACK_SECRET;

/**
 * Fail fast at startup on an insecure token-signing config. In production an unset
 * secret means every issued token is signed with a published, globally-forgeable
 * default — so refuse to boot rather than run silently insecure. In non-production
 * we only warn, so local dev still works out of the box.
 */
export function assertSecurityConfig() {
  const usingFallback = SECRET === DEV_FALLBACK_SECRET;
  if (usingFallback) {
    const msg =
      "STUDENT_JOIN_TOKEN_SECRET (or JWT_SECRET) is not set — join tokens would be signed with a public dev default.";
    if (process.env.NODE_ENV === "production") {
      throw new Error(`[security] ${msg} Refusing to start in production.`);
    }
    console.warn(`[security] WARNING: ${msg} Set it before deploying.`);
  }
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

function issueToken(payloadFields, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...payloadFields, iat: now, exp: now + ttlSeconds };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function issueStudentJoinToken({ sessionId, roomCode, studentId, studentName }) {
  return issueToken(
    { role: "student", sessionId, roomCode, studentId, studentName },
    STUDENT_TOKEN_TTL_SECONDS
  );
}

export function issueInstructorToken({ sessionId, roomCode }) {
  return issueToken({ role: "instructor", sessionId, roomCode }, INSTRUCTOR_TOKEN_TTL_SECONDS);
}

// Verify any session token (student or instructor). Returns { valid, payload } or
// { valid:false, reason }. The payload's `role` field distinguishes the two.
export function verifySessionToken(token) {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "missing_token" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "malformed_token" };
  }
  const [payloadB64, sig] = parts;
  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: "invalid_signature" };
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || now >= payload.exp) {
      return { valid: false, reason: "expired_token" };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "invalid_payload" };
  }
}

// Back-compat alias (pre-rename callers).
export const verifyStudentJoinToken = verifySessionToken;

/**
 * Pull a bearer token off a request: `Authorization: Bearer <t>`, `?token=`, or a
 * `token` body field. Returns the raw token string or null.
 */
export function extractToken(req) {
  const auth = req.headers?.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (typeof req.query?.token === "string" && req.query.token) return req.query.token;
  if (typeof req.body?.token === "string" && req.body.token) return req.body.token;
  return null;
}

/**
 * Express middleware factory. Requires a valid session token whose `sessionId`
 * matches the `:id` route param. Pass `requiredRole` ("instructor") to also gate
 * on role. Puts the verified payload on `req.sessionToken`.
 */
export function requireSessionToken({ requiredRole } = {}) {
  return function sessionTokenGuard(req, res, next) {
    const token = extractToken(req);
    const result = verifySessionToken(token);
    if (!result.valid) {
      return res.status(401).json({ error: `Unauthorized: ${result.reason}` });
    }
    const { payload } = result;
    const routeId = req.params?.id;
    if (routeId && payload.sessionId !== routeId) {
      return res.status(403).json({ error: "Token does not match this session." });
    }
    if (requiredRole && payload.role !== requiredRole) {
      return res.status(403).json({ error: `Requires ${requiredRole} privileges.` });
    }
    req.sessionToken = payload;
    next();
  };
}
