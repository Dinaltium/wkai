#!/usr/bin/env node
/**
 * WKAI MCP server — lets an agent run a workshop session.
 *
 * The tools mirror what an instructor actually does: open a room, watch who
 * arrives, answer what gets asked, push material out, close it down. Speech and
 * screen frames are included because that is what the backend turns into guide
 * cards, so an agent can produce real session material rather than only reacting
 * to students.
 *
 * There is also a student side. It exists because half of what you want to
 * observe about a session is what a student sees, and because a demo needs
 * someone in the room asking questions.
 *
 * Transport is stdio. Point it at a backend with WKAI_BACKEND_URL.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { WkaiClient, WkaiError } from "./client.js";

const BACKEND_URL = process.env.WKAI_BACKEND_URL ?? "http://localhost:4000";
const client = new WkaiClient(BACKEND_URL);

const server = new McpServer({ name: "wkai", version: "0.1.0" });

/** Tool results are text; JSON keeps them readable to both agent and human. */
function ok(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(err) {
  const message = err instanceof WkaiError ? err.message : `Unexpected error: ${err.message}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wraps a handler so a backend error reaches the agent as text, not a crash. */
function tool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return await handler(args ?? {});
    } catch (err) {
      return fail(err);
    }
  });
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

tool(
  "wkai_create_session",
  {
    title: "Open a workshop room",
    description:
      "Creates a session and connects as its instructor. Returns the six-character room code students join with, and the session id every other tool takes. The instructor token is held in this process — you do not need to pass it back.",
    inputSchema: {
      instructorName: z.string().min(1).max(100).describe("Name students see as the instructor"),
      workshopTitle: z.string().min(1).max(200).describe("Title of the session"),
      sessionPassword: z.string().max(128).optional().describe("Optional password students must enter"),
      workspaceName: z
        .string()
        .max(120)
        .optional()
        .describe("Folder of related sessions; created on first use, so later sessions share material"),
    },
  },
  async (args) => {
    const { roomCode, session, instructorToken } = await client.createSession(args);
    await client.connectInstructor({ sessionId: session.id, roomCode, instructorToken });
    return ok({
      roomCode,
      sessionId: session.id,
      workshopTitle: session.workshopTitle,
      instructorName: session.instructorName,
      studentUrl: `join with code ${roomCode}`,
      connected: true,
    });
  }
);

tool(
  "wkai_connect_instructor",
  {
    title: "Attach to an existing room",
    description:
      "Opens an instructor socket on a session this process did not create. Needs the instructor token issued when the room was made.",
    inputSchema: {
      sessionId: z.string().describe("Session id"),
      instructorToken: z.string().describe("Instructor token from session creation"),
      roomCode: z.string().length(6).optional().describe("Room code, for nicer messages"),
    },
  },
  async ({ sessionId, instructorToken, roomCode }) => {
    const p = await client.connectInstructor({ sessionId, roomCode: roomCode ?? "??????", instructorToken });
    return ok({ sessionId, connected: true, studentCount: p.room.studentCount });
  }
);

tool(
  "wkai_lookup_room",
  {
    title: "Look up a room code",
    description:
      "Checks whether a room exists, whether it is still running, and whether it needs a password. No token required.",
    inputSchema: { roomCode: z.string().length(6).describe("Six-character room code") },
  },
  async ({ roomCode }) => ok(await client.lookupRoom(roomCode))
);

tool(
  "wkai_open_sessions",
  {
    title: "List rooms this agent holds open",
    description: "Every session this MCP process currently has an instructor socket on.",
    inputSchema: {},
  },
  async () => ok({ sessions: client.openSessions(), backendUrl: BACKEND_URL })
);

tool(
  "wkai_end_session",
  {
    title: "End a workshop",
    description:
      "Closes the room. Students are told before it is torn down, and no one can join afterwards. This cannot be undone.",
    inputSchema: { sessionId: z.string().describe("Session id") },
  },
  async ({ sessionId }) => {
    const p = client.instructor(sessionId);
    const result = await client.endSession(sessionId, p.token);
    p.close();
    return ok({ ended: true, status: result.session.status, endedAt: result.session.endedAt });
  }
);

// ─── Watching the room ────────────────────────────────────────────────────────

tool(
  "wkai_session_state",
  {
    title: "What is happening in the room",
    description:
      "The room as it stands: how many students, the guide cards published so far, shared files, and every question in the inbox.",
    inputSchema: { sessionId: z.string().describe("Session id") },
  },
  async ({ sessionId }) => {
    const p = client.instructor(sessionId);
    const room = p.room;
    return ok({
      roomCode: p.roomCode,
      workshopTitle: room.session?.workshopTitle ?? null,
      ended: room.ended,
      studentCount: room.studentCount,
      students: room.students,
      guideBlocks: room.guideBlocks.length,
      sharedFiles: room.sharedFiles,
      inbox: [...room.inbox.values()].map((m) => ({
        messageId: m.messageId,
        studentId: m.studentId,
        studentName: m.studentName,
        message: m.message,
        reply: m.reply ?? null,
        answered: Boolean(m.reply),
      })),
    });
  }
);

tool(
  "wkai_list_students",
  {
    title: "Who is in the room",
    description: "Students currently connected, newest roster the server sent.",
    inputSchema: { sessionId: z.string().describe("Session id") },
  },
  async ({ sessionId }) => {
    const p = client.instructor(sessionId);
    return ok({ studentCount: p.room.studentCount, students: p.room.students });
  }
);

tool(
  "wkai_events",
  {
    title: "What has happened since last check",
    description:
      "Events received on the instructor socket after `cursor` — joins, questions, AI replies, guide cards, comprehension results. Pass the returned cursor next time to page forward.",
    inputSchema: {
      sessionId: z.string().describe("Session id"),
      cursor: z.number().int().min(0).optional().describe("Last cursor you saw; omit for everything buffered"),
      types: z.array(z.string()).optional().describe("Only these event types"),
    },
  },
  async ({ sessionId, cursor = 0, types }) => {
    const p = client.instructor(sessionId);
    let events = p.since(cursor);
    if (types?.length) events = events.filter((e) => types.includes(e.type));
    return ok({ cursor: p.seq, count: events.length, events });
  }
);

tool(
  "wkai_get_guide",
  {
    title: "Read the guide",
    description: "Every guide card published in this session, oldest first.",
    inputSchema: { sessionId: z.string().describe("Session id") },
  },
  async ({ sessionId }) => {
    const p = client.instructor(sessionId);
    return ok(await client.getGuide(sessionId, p.token));
  }
);

// ─── Acting as the instructor ─────────────────────────────────────────────────

tool(
  "wkai_reply_to_student",
  {
    title: "Answer a question",
    description:
      "Replies to one question. The first answer wins: replying cancels the AI fallback that would otherwise answer after 45 seconds, so a student never gets two.",
    inputSchema: {
      sessionId: z.string().describe("Session id"),
      messageId: z.string().describe("messageId from the inbox or a student-message event"),
      studentId: z.string().describe("Who asked"),
      reply: z.string().min(1).describe("The answer"),
    },
  },
  async ({ sessionId, messageId, studentId, reply }) => {
    client.instructor(sessionId).send("instructor-reply", { messageId, studentId, reply });
    return ok({ sent: true, messageId });
  }
);

tool(
  "wkai_speak",
  {
    title: "Say something to the room",
    description:
      "Feeds a line of instructor speech to the backend, exactly as the desktop app does with transcribed audio. This is what becomes guide cards: the text is summarised, checked for intent, and published to every student. Use it to teach a session, not just to react to one.",
    inputSchema: {
      sessionId: z.string().describe("Session id"),
      transcript: z.string().min(1).describe("What the instructor said"),
    },
  },
  async ({ sessionId, transcript }) => {
    client.instructor(sessionId).send("audio-transcript", { transcript, recentFiles: [] });
    return ok({
      sent: true,
      note: "Guide cards arrive asynchronously — poll wkai_events for guide-block or live-explanation.",
    });
  }
);

tool(
  "wkai_send_screen_frame",
  {
    title: "Show the room your screen",
    description:
      "Sends one screenshot into the vision pipeline, as the desktop app does while sharing. The backend decides whether the frame is instructional and may publish guide cards from it.",
    inputSchema: {
      sessionId: z.string().describe("Session id"),
      imagePath: z.string().describe("Path to a PNG or JPEG on this machine"),
    },
  },
  async ({ sessionId, imagePath }) => {
    const bytes = await readFile(imagePath);
    client.instructor(sessionId).send("screen-frame", { frameB64: bytes.toString("base64") });
    return ok({ sent: true, bytes: bytes.length, note: "Results arrive as ai-frame-result / guide-block events." });
  }
);

tool(
  "wkai_share_file",
  {
    title: "Share a file or link",
    description: "Puts a file or URL in front of every student in the room.",
    inputSchema: {
      sessionId: z.string().describe("Session id"),
      name: z.string().min(1).describe("Name students see"),
      url: z.string().min(1).describe("Where it lives"),
      sizeBytes: z.number().int().positive().optional().describe("Size, if known"),
    },
  },
  async ({ sessionId, name, url, sizeBytes }) => {
    client.instructor(sessionId).send("file-shared", { name, url, sizeBytes });
    return ok({ shared: true, name, url });
  }
);

// ─── Acting as a student ──────────────────────────────────────────────────────

tool(
  "wkai_join_as_student",
  {
    title: "Join a room as a student",
    description:
      "Joins with a room code and holds the student's socket open, so you can see the session from a student's side and ask questions from it.",
    inputSchema: {
      roomCode: z.string().length(6).describe("Room code"),
      studentName: z.string().max(60).optional().describe("Name shown to the instructor"),
      sessionPassword: z.string().optional().describe("Required if the room is protected"),
    },
  },
  async ({ roomCode, studentName = "Agent", sessionPassword }) => {
    const { participant, session } = await client.joinAsStudent({ roomCode, studentName, sessionPassword });
    return ok({
      studentId: participant.identity.studentId,
      studentName: participant.identity.studentName,
      sessionId: session.id,
      workshopTitle: session.workshopTitle,
      connected: true,
    });
  }
);

tool(
  "wkai_student_ask",
  {
    title: "Ask a question as a student",
    description:
      "Sends a question from a joined student. It reaches the instructor's inbox, and the AI answers it if no human does within 45 seconds.",
    inputSchema: {
      studentId: z.string().describe("studentId from wkai_join_as_student"),
      message: z.string().min(1).describe("The question"),
    },
  },
  async ({ studentId, message }) => {
    const p = client.student(studentId);
    const messageId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    p.send("student-message", { messageId, message });
    return ok({ sent: true, messageId, note: "Poll wkai_student_events for the reply." });
  }
);

tool(
  "wkai_student_events",
  {
    title: "What a student has seen",
    description:
      "Events on a joined student's socket — guide cards, replies, shared files, the session ending. This is the student's view of the room.",
    inputSchema: {
      studentId: z.string().describe("studentId from wkai_join_as_student"),
      cursor: z.number().int().min(0).optional().describe("Last cursor you saw"),
      types: z.array(z.string()).optional().describe("Only these event types"),
    },
  },
  async ({ studentId, cursor = 0, types }) => {
    const p = client.student(studentId);
    let events = p.since(cursor);
    if (types?.length) events = events.filter((e) => types.includes(e.type));
    return ok({ cursor: p.seq, count: events.length, events });
  }
);

tool(
  "wkai_student_leave",
  {
    title: "Leave the room as a student",
    description: "Closes that student's socket. The instructor sees the count drop.",
    inputSchema: { studentId: z.string().describe("studentId from wkai_join_as_student") },
  },
  async ({ studentId }) => {
    client.student(studentId).close();
    client.students.delete(studentId);
    return ok({ left: true, studentId });
  }
);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    client.closeAll();
    process.exit(0);
  });
}

await server.connect(new StdioServerTransport());
