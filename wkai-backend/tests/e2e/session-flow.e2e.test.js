/**
 * End-to-end: the full session lifecycle over real HTTP and real WebSockets,
 * against a real Postgres and Redis.
 *
 * This is the path a workshop actually takes — instructor opens a room, a
 * student joins with the code, questions and replies cross the socket, the
 * instructor ends it — plus the auth gates that path depends on. The unit
 * tests in tests/ cover the token crypto in isolation; these prove the pieces
 * are wired to each other.
 *
 * Requires a running stack. Use `npm run test:e2e` from the repo root, or
 * `node e2e/harness/stack.mjs up` and then `npm run test:e2e:api` here.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { api, createSession, joinSession, randomRoomCode, TestSocket, BACKEND_URL } from "./client.mjs";

const sockets = [];

/** Every socket a test opens is registered here so none outlive the run. */
function track(socket) {
  sockets.push(socket);
  return socket;
}

before(async () => {
  // A refused connection is the overwhelmingly likely failure here, and its
  // native message ("fetch failed") says nothing about what to do about it.
  let status;
  try {
    ({ status } = await api("GET", "/health"));
  } catch (err) {
    throw new Error(
      `No backend answering on ${BACKEND_URL} (${err.message}). ` +
        "Run `npm run test:e2e:api` from the repo root, which boots the stack first."
    );
  }
  assert.equal(status, 200, `backend health check returned ${status}`);
});

after(() => {
  for (const socket of sockets) socket.close();
});

describe("session creation and lookup", () => {
  test("creating a session returns the room and an instructor token", async () => {
    const { roomCode, session, instructorToken } = await createSession({
      instructorName: "Ada",
      workshopTitle: "Intro to WKAI",
    });

    assert.equal(session.roomCode, roomCode);
    assert.equal(session.instructorName, "Ada");
    assert.equal(session.workshopTitle, "Intro to WKAI");
    assert.equal(session.status, "active");
    assert.ok(session.id, "session should carry an id");
    assert.ok(instructorToken, "instructor token should be issued at creation");
  });

  test("looking up a room reports whether it needs a password", async () => {
    const open = await createSession();
    const locked = await createSession({ sessionPassword: "hunter2" });

    const openLookup = await api("GET", `/api/sessions/${open.roomCode}`);
    assert.equal(openLookup.status, 200);
    assert.equal(openLookup.data.passwordRequired, false);

    const lockedLookup = await api("GET", `/api/sessions/${locked.roomCode}`);
    assert.equal(lockedLookup.status, 200);
    assert.equal(lockedLookup.data.passwordRequired, true);
  });

  test("an unknown room code is a 404, not an empty success", async () => {
    const { status } = await api("GET", `/api/sessions/${randomRoomCode()}`);
    assert.equal(status, 404);
  });

  test("a lowercase room code still finds the room", async () => {
    const { roomCode } = await createSession();
    const { status, data } = await api("GET", `/api/sessions/${roomCode.toLowerCase()}`);
    assert.equal(status, 200);
    assert.equal(data.roomCode, roomCode);
  });
});

describe("joining a room", () => {
  test("a student join returns a signed token and a server-assigned identity", async () => {
    const { roomCode, session } = await createSession();
    const { status, data } = await joinSession(roomCode, "Grace");

    assert.equal(status, 200);
    assert.equal(data.session.id, session.id);
    assert.equal(data.studentName, "Grace");
    assert.ok(data.studentId, "the server assigns the student id");
    assert.ok(data.joinToken, "the join token is what authorises the WebSocket");
    assert.ok(Array.isArray(data.guideBlocks));
    assert.ok(Array.isArray(data.sharedFiles));
  });

  test("joining a password-protected room needs the password", async () => {
    const { roomCode } = await createSession({ sessionPassword: "hunter2" });

    const noPassword = await joinSession(roomCode, "Grace");
    assert.equal(noPassword.status, 401);

    const wrongPassword = await joinSession(roomCode, "Grace", "letmein");
    assert.equal(wrongPassword.status, 401);

    const correct = await joinSession(roomCode, "Grace", "hunter2");
    assert.equal(correct.status, 200);
    assert.ok(correct.data.joinToken);
  });

  test("joining a room that does not exist is a 404", async () => {
    const { status } = await joinSession(randomRoomCode(), "Grace");
    assert.equal(status, 404);
  });
});

describe("the live room over WebSockets", () => {
  test("the instructor is told when a student joins", async () => {
    const { roomCode, instructorToken } = await createSession();
    const instructor = track(await TestSocket.connect(instructorToken, "instructor"));
    await instructor.waitFor("session-state");

    const join = await joinSession(roomCode, "Grace");
    const student = track(await TestSocket.connect(join.data.joinToken, "student"));

    const joined = await instructor.waitFor("student-joined");
    assert.equal(joined.payload.studentName, "Grace");
    assert.ok(joined.payload.count >= 1);

    const list = await instructor.waitFor("student-list");
    assert.ok(
      list.payload.students.some((s) => s.studentName === "Grace"),
      "the roster sent to the instructor should include the student who just joined"
    );

    student.close();
  });

  test("a student question reaches the instructor and is acked back", async () => {
    const { roomCode, instructorToken } = await createSession();
    const instructor = track(await TestSocket.connect(instructorToken, "instructor"));
    await instructor.waitFor("session-state");

    const join = await joinSession(roomCode, "Grace");
    const student = track(await TestSocket.connect(join.data.joinToken, "student"));
    await student.waitFor("session-state");

    const messageId = `e2e-${Date.now()}`;
    student.send("student-message", { messageId, message: "Why does the loop never exit?" });

    // The ack is what clears the optimistic "pending" flag in the student UI.
    const ack = await student.waitFor("student-message");
    assert.equal(ack.payload.messageId, messageId);
    assert.equal(ack.payload.delivered, true);

    const inbox = await instructor.waitFor("student-message");
    assert.equal(inbox.payload.message, "Why does the loop never exit?");
    assert.equal(inbox.payload.studentName, "Grace");

    student.close();
  });

  test("the instructor's reply comes back to the student who asked", async () => {
    const { roomCode, instructorToken } = await createSession();
    const instructor = track(await TestSocket.connect(instructorToken, "instructor"));
    await instructor.waitFor("session-state");

    const join = await joinSession(roomCode, "Grace");
    const student = track(await TestSocket.connect(join.data.joinToken, "student"));
    await student.waitFor("session-state");

    const messageId = `e2e-${Date.now()}`;
    student.send("student-message", { messageId, message: "Is the off-by-one on line 12?" });
    const inbox = await instructor.waitFor("student-message");

    instructor.send("instructor-reply", {
      messageId: inbox.payload.messageId ?? messageId,
      studentId: join.data.studentId,
      reply: "Yes — the range end is exclusive.",
    });

    const reply = await student.waitFor("instructor-reply");
    assert.equal(reply.payload.reply, "Yes — the range end is exclusive.");

    student.close();
  });

  test("a reconnecting student is sent their own thread, not the whole room's", async () => {
    const { roomCode, instructorToken } = await createSession();
    const instructor = track(await TestSocket.connect(instructorToken, "instructor"));
    await instructor.waitFor("session-state");

    const asking = await joinSession(roomCode, "Grace");
    const student = track(await TestSocket.connect(asking.data.joinToken, "student"));
    await student.waitFor("session-state");
    student.send("student-message", { messageId: `e2e-${Date.now()}`, message: "My own question" });
    await instructor.waitFor("student-message");
    student.close();

    // A different student must not inherit that thread on connect.
    const other = await joinSession(roomCode, "Alan");
    const otherStudent = track(await TestSocket.connect(other.data.joinToken, "student"));
    const state = await otherStudent.waitFor("session-state");

    assert.ok(Array.isArray(state.payload.chatMessages));
    assert.equal(
      state.payload.chatMessages.length,
      0,
      "a student's snapshot must contain only their own messages"
    );
    assert.equal(
      state.payload.inboxMessages,
      undefined,
      "the room-wide inbox is instructor-only"
    );

    otherStudent.close();
  });
});

describe("WebSocket authorisation", () => {
  test("a garbage token is rejected and the socket is closed", async () => {
    const socket = track(await TestSocket.connect("not-a-real-token", "impostor"));
    const error = await socket.waitFor("error");
    assert.match(error.payload.message, /Unauthorized/);
  });

  test("a student token cannot act as the instructor", async () => {
    const { roomCode, instructorToken } = await createSession();
    const instructor = track(await TestSocket.connect(instructorToken, "instructor"));
    await instructor.waitFor("session-state");

    const join = await joinSession(roomCode, "Grace");
    const student = track(await TestSocket.connect(join.data.joinToken, "student"));
    await student.waitFor("session-state");

    // file-shared is instructor-only; the server drops it on a student socket.
    student.send("file-shared", { name: "malicious.txt", url: "http://example.com/x", sizeBytes: 1 });

    assert.ok(
      await instructor.expectNever("file-shared"),
      "a student must not be able to broadcast a shared file"
    );

    student.close();
  });

  test("a token for one session cannot open a socket on another", async () => {
    const first = await createSession();
    const second = await createSession();

    const join = await joinSession(first.roomCode, "Grace");
    const socket = track(await TestSocket.connect(join.data.joinToken, "cross-session"));
    const state = await socket.waitFor("session-state");

    assert.equal(
      state.payload.session.id,
      first.session.id,
      "the socket must land in the session its token names, never another"
    );
    assert.notEqual(state.payload.session.id, second.session.id);
  });
});

describe("ending a session", () => {
  test("ending it tells connected students and locks further joins", async () => {
    const { roomCode, session, instructorToken } = await createSession();
    const instructor = track(await TestSocket.connect(instructorToken, "instructor"));
    await instructor.waitFor("session-state");

    const join = await joinSession(roomCode, "Grace");
    const student = track(await TestSocket.connect(join.data.joinToken, "student"));
    await student.waitFor("session-state");

    const ended = await api("PATCH", `/api/sessions/${session.id}/end`, {
      token: instructorToken,
    });
    assert.equal(ended.status, 200);
    assert.equal(ended.data.session.status, "ended");

    // Students are told before the room is torn down — the regression that
    // left them staring at a live-looking screen after the session closed.
    const notice = await student.waitFor("session-ended");
    assert.match(notice.payload.message, /ended/i);

    const lateJoin = await joinSession(roomCode, "Alan");
    assert.equal(lateJoin.status, 403);

    student.close();
  });

  test("ending a session requires the instructor token", async () => {
    const { roomCode, session } = await createSession();
    const join = await joinSession(roomCode, "Grace");

    const anonymous = await api("PATCH", `/api/sessions/${session.id}/end`);
    assert.equal(anonymous.status, 401);

    const asStudent = await api("PATCH", `/api/sessions/${session.id}/end`, {
      token: join.data.joinToken,
    });
    assert.equal(asStudent.status, 401, "a student token must not end the room");

    const stillOpen = await api("GET", `/api/sessions/${roomCode}`);
    assert.equal(stillOpen.data.status, "active");
  });
});
