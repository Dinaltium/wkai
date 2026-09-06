/**
 * Thin client the end-to-end suite talks to the running backend through.
 *
 * The unit tests in tests/ import modules directly; these drive the real HTTP
 * and WebSocket surface instead, so anything the wire contract promises — status
 * codes, token plumbing, broadcast fan-out — is what gets asserted.
 */
import { WebSocket } from "ws";
import { BACKEND_URL, BACKEND_WS_URL } from "../../../e2e/harness/stack.mjs";

export { BACKEND_URL, BACKEND_WS_URL };

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A fresh code per test, so suites never collide on the unique room_code index. */
export function randomRoomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export async function api(method, path, { body, token } = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

/** Creates a session and returns the payload plus the instructor's token. */
export async function createSession(overrides = {}) {
  const roomCode = overrides.roomCode ?? randomRoomCode();
  const { status, data } = await api("POST", "/api/sessions", {
    body: {
      roomCode,
      instructorName: "E2E Instructor",
      workshopTitle: "End-to-end workshop",
      ...overrides,
      roomCode,
    },
  });
  if (status !== 201) {
    throw new Error(`createSession expected 201, got ${status}: ${JSON.stringify(data)}`);
  }
  return { roomCode, session: data.session, instructorToken: data.instructorToken };
}

export async function joinSession(roomCode, studentName = "E2E Student", sessionPassword) {
  return api("POST", `/api/sessions/${roomCode}/join`, {
    body: { studentName, sessionPassword },
  });
}

/**
 * A connected socket that records everything it receives.
 *
 * Tests await a message *type* rather than the next frame: the server sends
 * session-state, student-joined and student-list in an order that depends on
 * who connected first, so asserting on frame order would be testing timing.
 */
export class TestSocket {
  constructor(token, label) {
    this.label = label;
    this.received = [];
    this.waiters = [];
    this.closed = false;
    this.ws = new WebSocket(`${BACKEND_WS_URL}?token=${encodeURIComponent(token)}`);
    this.ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.received.push(msg);
      for (const waiter of [...this.waiters]) {
        if (waiter.type === msg.type) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        }
      }
    });
    this.ws.on("close", () => {
      this.closed = true;
    });
  }

  static async connect(token, label) {
    const socket = new TestSocket(token, label);
    await new Promise((resolve, reject) => {
      socket.ws.once("open", resolve);
      socket.ws.once("error", reject);
    });
    return socket;
  }

  /** Resolves with the first message of `type`, including ones already seen. */
  waitFor(type, timeoutMs = 10_000) {
    const already = this.received.find((m) => m.type === type);
    if (already) return Promise.resolve(already);
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve };
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(
          new Error(
            `${this.label}: timed out waiting for "${type}". Received: ` +
              JSON.stringify(this.received.map((m) => m.type))
          )
        );
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /** Asserts a message type does NOT arrive — used for the role-gate tests. */
  async expectNever(type, windowMs = 1500) {
    try {
      await this.waitFor(type, windowMs);
      return false;
    } catch {
      return true;
    }
  }

  send(type, payload) {
    this.ws.send(JSON.stringify({ type, payload }));
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }
  }
}
