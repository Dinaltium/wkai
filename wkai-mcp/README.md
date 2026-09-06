# wkai-mcp

An MCP server that lets an AI agent run a WKAI workshop session.

It speaks the same protocol the instructor desktop app speaks — HTTP for
creating and ending rooms, a WebSocket for everything that happens inside one.
It does not drive the Tauri window, so an agent can run a session with the
desktop app closed, or alongside a human who has it open.

## Setup

```bash
npm install
```

Register it with your MCP client. In this repo's `.mcp.json`:

```json
{
  "mcpServers": {
    "wkai": {
      "command": "node",
      "args": ["wkai-mcp/src/index.js"],
      "env": { "WKAI_BACKEND_URL": "http://localhost:4000" }
    }
  }
}
```

`WKAI_BACKEND_URL` defaults to `http://localhost:4000`.

## Tools

**Rooms**

| Tool | Does |
| --- | --- |
| `wkai_create_session` | Opens a room and connects as its instructor. Returns the room code. |
| `wkai_connect_instructor` | Attaches to a room this process did not create, given its token. |
| `wkai_lookup_room` | Checks a code: exists, still running, password required. No token needed. |
| `wkai_open_sessions` | Rooms this process currently holds a socket on. |
| `wkai_end_session` | Closes the room. Students are told first. Not reversible. |

**Watching**

| Tool | Does |
| --- | --- |
| `wkai_session_state` | Student count, guide cards, shared files, and the question inbox. |
| `wkai_list_students` | Who is connected. |
| `wkai_events` | Everything received since a cursor — joins, questions, AI replies, guide cards. |
| `wkai_get_guide` | Every guide card published, oldest first. |

**Acting as the instructor**

| Tool | Does |
| --- | --- |
| `wkai_reply_to_student` | Answers a question. Cancels the AI fallback so nobody gets two answers. |
| `wkai_speak` | Feeds a line of instructor speech in. This is what becomes guide cards. |
| `wkai_send_screen_frame` | Sends a screenshot into the vision pipeline. |
| `wkai_share_file` | Puts a file or link in front of the room. |

**Acting as a student**

Half of what is worth knowing about a session is what a student sees, and a demo
needs somebody in the room asking questions.

| Tool | Does |
| --- | --- |
| `wkai_join_as_student` | Joins with a room code and holds that student's socket. |
| `wkai_student_ask` | Asks a question from a joined student. |
| `wkai_student_events` | The student's view: guide cards, replies, files, the room closing. |
| `wkai_student_leave` | Disconnects that student. |

## Events are polled, not pushed

MCP tools are request/response, so the server keeps a rolling log per socket
(the most recent 500 events) rather than streaming. `wkai_events` and
`wkai_student_events` return a `cursor`; pass it back to get only what is new.

## Teaching a session

`wkai_speak` is the one to reach for. Guide cards are not written directly —
they are produced from instructor speech by the backend's agent chain, so an
agent that talks through a topic generates the same material a human would.
Cards arrive asynchronously; poll `wkai_events` for `guide-block` and
`live-explanation`.

That path needs `GROQ_API_KEY` set on the backend. Everything else — rooms,
students, questions, replies, files — works without it.

## Testing

From the repo root, against a stack the harness boots:

```bash
npm run test:mcp
```

## What this can do to a live room

These tools act as a real instructor on a real session: `wkai_end_session`
closes a room out from under everyone in it, and `wkai_share_file` and
`wkai_reply_to_student` put content in front of students immediately. Point
`WKAI_BACKEND_URL` at a scratch backend while developing, not at one with a
class in it.
