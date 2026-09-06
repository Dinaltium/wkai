/**
 * Talks to a WKAI backend the way the instructor desktop app does.
 *
 * The instructor's half of a workshop is split across two transports: rooms are
 * created and ended over HTTP, but everything that happens *during* a session —
 * students arriving, questions, replies, shared files, the speech that becomes
 * guide cards — is WebSocket traffic. An agent needs both, so this holds a live
 * socket per session and keeps a rolling log of what arrived on it.
 *
 * Nothing here reaches into the Tauri app. It speaks the same protocol the app
 * speaks, which means an agent can run a session with the desktop app closed,
 * or alongside a human instructor who has it open.
 */
import { WebSocket } from "ws";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** How many events to keep per session before the oldest are dropped. */
const EVENT_LOG_LIMIT = 500;

/** Room codes skip I, O, 0 and 1 — they are read aloud to a room of people. */
export function generateRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

export class WkaiError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "WkaiError";
    this.status = status;
  }
}

/**
 * One live participant socket — instructor or student.
 *
 * Events are buffered rather than streamed because MCP tools are request/
 * response: an agent calls `events` when it wants to know what happened, and
 * would otherwise miss anything that arrived between calls.
 */
class Participant {
  constructor({ role, sessionId, roomCode, token, wsUrl, identity }) {
    this.role = role;
    this.sessionId = sessionId;
    this.roomCode = roomCode;
    this.token = token;
    this.identity = identity ?? null;
    this.wsUrl = wsUrl;
    this.events = [];
    this.seq = 0;
    /**
     * The room as it stands now.
     *
     * session-state is a snapshot taken when the socket opened, so on its own
     * it goes stale the moment anything happens — a tool reading it straight
     * would report zero students to an agent watching a full room. Events are
     * folded in as they arrive so this stays current.
     */
    this.room = {
      session: null,
      ended: false,
      instructorOnline: false,
      studentCount: 0,
      students: [],
      guideBlocks: [],
      sharedFiles: [],
      /** messageId -> question, with its answer once one lands. */
      inbox: new Map(),
    };
    this.ws = null;
    this.closedReason = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.wsUrl}?token=${encodeURIComponent(this.token)}`);
      this.ws = ws;

      const failFast = (err) => reject(new WkaiError(`WebSocket failed: ${err.message}`));
      ws.once("error", failFast);

      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        this.apply(msg);
        this.record(msg);
      });

      ws.on("close", () => {
        this.closedReason = this.closedReason ?? "socket closed";
      });

      ws.once("open", () => {
        ws.off("error", failFast);
        ws.on("error", (err) => {
          this.closedReason = `socket error: ${err.message}`;
        });
        // The server sends session-state right after the socket opens. Waiting
        // for it means a tool that connects and immediately asks for state gets
        // the room, not an empty object.
        const settle = setTimeout(() => resolve(this), 2500);
        const onState = (raw) => {
          try {
            if (JSON.parse(raw.toString()).type === "session-state") {
              clearTimeout(settle);
              ws.off("message", onState);
              resolve(this);
            }
          } catch {
            /* handled by the main listener */
          }
        };
        ws.on("message", onState);
      });
    });
  }

  /** Folds one server message into the running picture of the room. */
  apply({ type, payload }) {
    const room = this.room;
    const p = payload ?? {};

    switch (type) {
      case "session-state":
        // The authoritative reset: the server has just told us everything.
        room.session = p.session ?? room.session;
        room.studentCount = p.studentCount ?? 0;
        room.instructorOnline = Boolean(p.instructorOnline);
        room.guideBlocks = p.guideBlocks ?? [];
        room.sharedFiles = p.sharedFiles ?? [];
        room.inbox = new Map((p.inboxMessages ?? []).map((m) => [m.messageId, m]));
        break;

      case "student-joined":
        if (typeof p.count === "number") room.studentCount = p.count;
        // A join naming a student is a real arrival; one with only a count is
        // the instructor being told the size of the room as it connects.
        if (p.studentId && !room.students.some((s) => s.studentId === p.studentId)) {
          room.students.push({ studentId: p.studentId, studentName: p.studentName, joinedAt: p.joinedAt });
        }
        break;

      case "student-left":
        if (typeof p.count === "number") room.studentCount = p.count;
        break;

      case "student-list":
        room.students = p.students ?? [];
        break;

      case "guide-block":
        room.guideBlocks.push(p);
        break;

      case "file-shared":
        room.sharedFiles.unshift(p);
        break;

      case "student-message":
        // The instructor gets the question; the student gets a bare delivery
        // ack for their own message, which is not an inbox entry.
        if (p.messageId && p.message) room.inbox.set(p.messageId, { ...room.inbox.get(p.messageId), ...p });
        break;

      case "instructor-reply":
      case "ai-reply": {
        const existing = room.inbox.get(p.messageId);
        if (existing) {
          existing.reply = p.reply;
          existing.replyRole = type === "ai-reply" ? "ai" : "instructor";
        }
        break;
      }

      case "instructor-online":
        room.instructorOnline = true;
        break;

      case "instructor-offline":
        room.instructorOnline = false;
        break;

      case "session-ended":
        room.ended = true;
        break;

      default:
        break;
    }
  }

  record(msg) {
    this.seq += 1;
    this.events.push({ seq: this.seq, at: new Date().toISOString(), type: msg.type, payload: msg.payload });
    if (this.events.length > EVENT_LOG_LIMIT) this.events.splice(0, this.events.length - EVENT_LOG_LIMIT);
  }

  since(cursor = 0) {
    return this.events.filter((e) => e.seq > cursor);
  }

  send(type, payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new WkaiError(
        `The ${this.role} socket for ${this.roomCode} is not open${this.closedReason ? ` (${this.closedReason})` : ""}. Reconnect first.`
      );
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }

  close() {
    this.closedReason = "closed by the agent";
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }
  }
}

export class WkaiClient {
  constructor(backendUrl) {
    this.backendUrl = backendUrl.replace(/\/+$/, "");
    this.wsUrl = `${this.backendUrl.replace(/^http/i, "ws")}/ws`;
    /** sessionId -> Participant (instructor) */
    this.instructors = new Map();
    /** studentId -> Participant */
    this.students = new Map();
  }

  async http(method, path, { body, token } = {}) {
    let res;
    try {
      res = await fetch(`${this.backendUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new WkaiError(
        `Cannot reach the WKAI backend at ${this.backendUrl} (${err.message}). ` +
          "Set WKAI_BACKEND_URL if it runs somewhere else."
      );
    }

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw new WkaiError(data?.error ?? `${method} ${path} returned ${res.status}`, { status: res.status });
    }
    return data;
  }

  // ─── Sessions ───────────────────────────────────────────────────────────────

  async createSession({ instructorName, workshopTitle, sessionPassword, workspaceName }) {
    const roomCode = generateRoomCode();
    const data = await this.http("POST", "/api/sessions", {
      body: { roomCode, instructorName, workshopTitle, sessionPassword, workspaceName },
    });
    return { roomCode, session: data.session, instructorToken: data.instructorToken };
  }

  lookupRoom(roomCode) {
    return this.http("GET", `/api/sessions/${encodeURIComponent(roomCode)}`);
  }

  endSession(sessionId, instructorToken) {
    return this.http("PATCH", `/api/sessions/${sessionId}/end`, { token: instructorToken });
  }

  getGuide(sessionId, token) {
    return this.http("GET", `/api/sessions/${sessionId}/guide`, { token });
  }

  // ─── Live participation ─────────────────────────────────────────────────────

  async connectInstructor({ sessionId, roomCode, instructorToken }) {
    this.instructors.get(sessionId)?.close();
    const participant = new Participant({
      role: "instructor",
      sessionId,
      roomCode,
      token: instructorToken,
      wsUrl: this.wsUrl,
    });
    await participant.connect();
    this.instructors.set(sessionId, participant);
    return participant;
  }

  async joinAsStudent({ roomCode, studentName, sessionPassword }) {
    const data = await this.http("POST", `/api/sessions/${encodeURIComponent(roomCode)}/join`, {
      body: { studentName, sessionPassword },
    });
    const participant = new Participant({
      role: "student",
      sessionId: data.session.id,
      roomCode: data.session.roomCode,
      token: data.joinToken,
      wsUrl: this.wsUrl,
      identity: { studentId: data.studentId, studentName: data.studentName },
    });
    await participant.connect();
    this.students.set(data.studentId, participant);
    return { participant, session: data.session };
  }

  instructor(sessionId) {
    const p = this.instructors.get(sessionId);
    if (!p) {
      throw new WkaiError(
        `No instructor socket for session ${sessionId}. Call wkai_create_session or wkai_connect_instructor first.`
      );
    }
    return p;
  }

  student(studentId) {
    const p = this.students.get(studentId);
    if (!p) throw new WkaiError(`No student socket for ${studentId}. Call wkai_join_as_student first.`);
    return p;
  }

  /** Every session this process currently holds a socket for. */
  openSessions() {
    return [...this.instructors.values()].map((p) => ({
      sessionId: p.sessionId,
      roomCode: p.roomCode,
      studentCount: p.room.studentCount,
      ended: p.room.ended,
      open: p.ws?.readyState === WebSocket.OPEN,
    }));
  }

  closeAll() {
    for (const p of this.instructors.values()) p.close();
    for (const p of this.students.values()) p.close();
    this.instructors.clear();
    this.students.clear();
  }
}
