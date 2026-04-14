import crypto from "crypto";

const TOKEN_TTL_SECONDS = Number(process.env.STUDENT_JOIN_TOKEN_TTL_SECONDS ?? 60 * 60);
const SECRET =
  process.env.STUDENT_JOIN_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  "wkai-dev-student-join-secret-change-me";

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

export function hashSessionPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function verifySessionPassword(password, expectedHash) {
  if (!expectedHash) return true;
  if (!password) return false;
  return hashSessionPassword(password) === expectedHash;
}

export function issueStudentJoinToken({ sessionId, roomCode, studentId, studentName }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sessionId,
    roomCode,
    studentId,
    studentName,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyStudentJoinToken(token) {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "missing_token" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "malformed_token" };
  }
  const [payloadB64, sig] = parts;
  const expectedSig = signPayload(payloadB64);
  if (sig !== expectedSig) {
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
