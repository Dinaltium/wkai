// Unit tests for the token-auth core (pure crypto — no external deps needed).
import { test } from "node:test";
import assert from "node:assert/strict";

// Secret must be set before the module is imported (read at module load).
process.env.STUDENT_JOIN_TOKEN_SECRET = "test-secret-abc123";

const {
  issueInstructorToken,
  issueStudentJoinToken,
  verifySessionToken,
  extractToken,
  requireSessionToken,
} = await import("../src/auth/sessionAccess.js");

test("instructor token round-trips with role + sessionId", () => {
  const t = issueInstructorToken({ sessionId: "sess-1", roomCode: "ABC123" });
  const r = verifySessionToken(t);
  assert.equal(r.valid, true);
  assert.equal(r.payload.role, "instructor");
  assert.equal(r.payload.sessionId, "sess-1");
  assert.equal(r.payload.roomCode, "ABC123");
});

test("student token carries server-assigned identity", () => {
  const t = issueStudentJoinToken({
    sessionId: "sess-2",
    roomCode: "XYZ999",
    studentId: "stu-42",
    studentName: "Alex",
  });
  const r = verifySessionToken(t);
  assert.equal(r.valid, true);
  assert.equal(r.payload.role, "student");
  assert.equal(r.payload.studentId, "stu-42");
  assert.equal(r.payload.studentName, "Alex");
});

test("tampered payload is rejected (signature mismatch)", () => {
  const t = issueInstructorToken({ sessionId: "sess-3", roomCode: "AAA111" });
  const [payload, sig] = t.split(".");
  // Flip a byte in the payload but keep the old signature.
  const forged = payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A") + "." + sig;
  const r = verifySessionToken(forged);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "invalid_signature");
});

test("malformed and empty tokens are rejected", () => {
  assert.equal(verifySessionToken("").valid, false);
  assert.equal(verifySessionToken(null).valid, false);
  assert.equal(verifySessionToken("no-dot").valid, false);
  assert.equal(verifySessionToken("a.b.c").valid, false);
});

test("expired token is rejected", async () => {
  process.env.STUDENT_JOIN_TOKEN_TTL_SECONDS = "1";
  // Re-import a fresh module instance so it picks up the short TTL.
  const mod = await import("../src/auth/sessionAccess.js?ttl=1");
  const t = mod.issueStudentJoinToken({ sessionId: "s", roomCode: "R", studentId: "i", studentName: "n" });
  // Force clock past expiry by waiting just over 1s.
  await new Promise((res) => setTimeout(res, 1100));
  const r = mod.verifySessionToken(t);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "expired_token");
  delete process.env.STUDENT_JOIN_TOKEN_TTL_SECONDS;
});

test("extractToken reads Bearer header, query, and body", () => {
  assert.equal(extractToken({ headers: { authorization: "Bearer xyz" } }), "xyz");
  assert.equal(extractToken({ headers: {}, query: { token: "qt" } }), "qt");
  assert.equal(extractToken({ headers: {}, query: {}, body: { token: "bt" } }), "bt");
  assert.equal(extractToken({ headers: {}, query: {}, body: {} }), null);
});

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test("requireSessionToken rejects missing token", () => {
  const mw = requireSessionToken();
  const res = mockRes();
  let nexted = false;
  mw({ headers: {}, query: {}, body: {}, params: {} }, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 401);
});

test("requireSessionToken enforces role", () => {
  const studentTok = issueStudentJoinToken({ sessionId: "s9", roomCode: "R", studentId: "i", studentName: "n" });
  const mw = requireSessionToken({ requiredRole: "instructor" });
  const res = mockRes();
  let nexted = false;
  mw({ headers: { authorization: `Bearer ${studentTok}` }, query: {}, body: {}, params: { id: "s9" } }, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
});

test("requireSessionToken enforces sessionId match on :id route", () => {
  const tok = issueInstructorToken({ sessionId: "s-real", roomCode: "R" });
  const mw = requireSessionToken({ requiredRole: "instructor" });
  const res = mockRes();
  let nexted = false;
  mw({ headers: { authorization: `Bearer ${tok}` }, query: {}, body: {}, params: { id: "s-other" } }, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
});

test("requireSessionToken passes a valid matching instructor token", () => {
  const tok = issueInstructorToken({ sessionId: "s-ok", roomCode: "R" });
  const mw = requireSessionToken({ requiredRole: "instructor" });
  const res = mockRes();
  let nexted = false;
  const req = { headers: { authorization: `Bearer ${tok}` }, query: {}, body: {}, params: { id: "s-ok" } };
  mw(req, res, () => { nexted = true; });
  assert.equal(nexted, true);
  assert.equal(req.sessionToken.role, "instructor");
});
