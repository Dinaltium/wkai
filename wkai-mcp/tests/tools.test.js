/**
 * Drives the MCP server the way an agent would: over stdio, through the real
 * protocol, against a real backend.
 *
 * Requires a running stack — `npm run test:mcp` from the repo root boots one.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..", "src", "index.js");
const BACKEND_URL = process.env.WKAI_BACKEND_URL ?? "http://127.0.0.1:4100";

let client;

/** Calls a tool and parses the JSON payload back out of its text content. */
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  if (res.isError) throw new Error(`${name} failed: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Polls a cursor-based event tool until `match` sees what it is waiting for. */
async function waitForEvent(tool, idArgs, type, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let cursor = 0;
  while (Date.now() < deadline) {
    const page = await call(tool, { ...idArgs, cursor });
    cursor = page.cursor;
    const hit = page.events.find((e) => e.type === type);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for a "${type}" event from ${tool}`);
}

before(async () => {
  const res = await fetch(`${BACKEND_URL}/health`).catch((err) => {
    throw new Error(
      `No backend on ${BACKEND_URL} (${err.message}). Run \`npm run test:mcp\` from the repo root.`
    );
  });
  assert.equal(res.status, 200);

  client = new Client({ name: "wkai-mcp-tests", version: "0.1.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { ...process.env, WKAI_BACKEND_URL: BACKEND_URL },
    })
  );
});

after(async () => {
  await client?.close();
});

describe("the tool surface", () => {
  test("every tool is advertised with a schema", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    assert.ok(names.includes("wkai_create_session"));
    assert.ok(names.includes("wkai_reply_to_student"));
    assert.ok(names.includes("wkai_join_as_student"));
    assert.ok(names.includes("wkai_end_session"));

    for (const t of tools) {
      assert.ok(t.description, `${t.name} should describe itself`);
      assert.equal(t.inputSchema.type, "object", `${t.name} should expose an object schema`);
    }
  });

  test("a tool called against a session it has no socket for says so", async () => {
    const res = await client.callTool({
      name: "wkai_session_state",
      arguments: { sessionId: "00000000-0000-0000-0000-000000000000" },
    });
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /No instructor socket/);
  });
});

describe("running a session end to end", () => {
  test("open a room, teach it, answer a question, close it", async () => {
    const room = await call("wkai_create_session", {
      instructorName: "Ada Lovelace",
      workshopTitle: "Debugging in the small",
    });
    assert.match(room.roomCode, /^[A-Z0-9]{6}$/);
    assert.equal(room.connected, true);

    // The room is findable by its code before anyone joins.
    const lookup = await call("wkai_lookup_room", { roomCode: room.roomCode });
    assert.equal(lookup.status, "active");
    assert.equal(lookup.passwordRequired, false);

    // A student arrives and the instructor sees them.
    const student = await call("wkai_join_as_student", {
      roomCode: room.roomCode,
      studentName: "Grace",
    });
    assert.ok(student.studentId);

    await waitForEvent("wkai_events", { sessionId: room.sessionId }, "student-list");
    const roster = await call("wkai_list_students", { sessionId: room.sessionId });
    assert.ok(
      roster.students.some((s) => s.studentName === "Grace"),
      `roster should list Grace, got ${JSON.stringify(roster.students)}`
    );

    // The student asks something.
    const asked = await call("wkai_student_ask", {
      studentId: student.studentId,
      message: "Why does the loop never exit?",
    });

    const inboxEvent = await waitForEvent("wkai_events", { sessionId: room.sessionId }, "student-message");
    assert.equal(inboxEvent.payload.message, "Why does the loop never exit?");

    const state = await call("wkai_session_state", { sessionId: room.sessionId });
    assert.equal(state.studentCount, 1);
    const question = state.inbox.find((m) => m.messageId === asked.messageId);
    assert.ok(question, "the question should be in the inbox");
    assert.equal(question.answered, false);

    // The agent answers it, and the student receives the answer.
    await call("wkai_reply_to_student", {
      sessionId: room.sessionId,
      messageId: asked.messageId,
      studentId: student.studentId,
      reply: "The range end is exclusive — it never reaches the bound you expect.",
    });

    const reply = await waitForEvent(
      "wkai_student_events",
      { studentId: student.studentId },
      "instructor-reply"
    );
    assert.match(reply.payload.reply, /range end is exclusive/);

    // Sharing a file reaches the student.
    await call("wkai_share_file", {
      sessionId: room.sessionId,
      name: "loop-fix.py",
      url: "https://example.com/loop-fix.py",
      sizeBytes: 412,
    });
    const shared = await waitForEvent("wkai_student_events", { studentId: student.studentId }, "file-shared");
    assert.equal(shared.payload.name, "loop-fix.py");

    // The room shows up as held open by this process.
    const open = await call("wkai_open_sessions");
    assert.ok(open.sessions.some((s) => s.sessionId === room.sessionId));

    // Ending it reaches the student and locks the room.
    await call("wkai_end_session", { sessionId: room.sessionId });
    await waitForEvent("wkai_student_events", { studentId: student.studentId }, "session-ended");

    const after = await call("wkai_lookup_room", { roomCode: room.roomCode });
    assert.equal(after.status, "ended");
  });

  test("a password-protected room refuses the wrong password", async () => {
    const room = await call("wkai_create_session", {
      instructorName: "Ada",
      workshopTitle: "Locked room",
      sessionPassword: "hunter2",
    });

    const refused = await client.callTool({
      name: "wkai_join_as_student",
      arguments: { roomCode: room.roomCode, studentName: "Nosy", sessionPassword: "wrong" },
    });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /password/i);

    const allowed = await call("wkai_join_as_student", {
      roomCode: room.roomCode,
      studentName: "Grace",
      sessionPassword: "hunter2",
    });
    assert.ok(allowed.studentId);

    await call("wkai_end_session", { sessionId: room.sessionId });
  });
});
