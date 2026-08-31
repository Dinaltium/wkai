// Unit tests for the row-to-payload mappers shared by REST and WebSocket.
import { test } from "node:test";
import assert from "node:assert/strict";

const { formatGuideBlock, formatSharedFile, formatStudentMessage } = await import(
  "../src/utils/formatters.js"
);

test("a guide-block row maps to the payload the clients render", () => {
  const payload = formatGuideBlock({
    id: "b1",
    session_id: "s1",
    type: "code",
    title: "Hashing a block",
    content: "Each block is hashed with SHA-256.",
    code: "hashlib.sha256(payload).hexdigest()",
    language: "python",
    locked: false,
    created_at: "2026-08-31T10:00:00.000Z",
  });
  assert.deepEqual(payload, {
    id: "b1",
    sessionId: "s1",
    type: "code",
    title: "Hashing a block",
    content: "Each block is hashed with SHA-256.",
    code: "hashlib.sha256(payload).hexdigest()",
    language: "python",
    locked: false,
    timestamp: "2026-08-31T10:00:00.000Z",
  });
});

test("a shared-file row maps to camelCase and keeps a null size", () => {
  const payload = formatSharedFile({
    id: "f1",
    name: "starter.py",
    url: "http://localhost:4000/uploads/starter.py",
    size_bytes: null,
    shared_at: "2026-08-31T10:05:00.000Z",
  });
  assert.equal(payload.name, "starter.py");
  assert.equal(payload.sizeBytes, null);
  assert.equal(payload.sharedAt, "2026-08-31T10:05:00.000Z");
});

test("a student message reports replied only once a reply exists", () => {
  const row = {
    message_id: "msg_1",
    student_id: "stu_1",
    student_name: "Aisha",
    message: "How do I hash a block?",
    reply: null,
    created_at: "2026-08-31T10:10:00.000Z",
  };
  assert.equal(formatStudentMessage(row).replied, false);
  assert.equal(formatStudentMessage({ ...row, reply: "Use the helper shown." }).replied, true);
  assert.equal(formatStudentMessage(row).messageId, "msg_1");
  assert.equal(formatStudentMessage(row).studentName, "Aisha");
});
