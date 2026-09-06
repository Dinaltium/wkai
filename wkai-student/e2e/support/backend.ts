import { BACKEND_URL } from "../../../e2e/harness/stack.mjs";

/**
 * The instructor side of a browser test.
 *
 * The instructor app is a Tauri desktop build, so these tests drive its half of
 * the conversation over the same HTTP API it uses. That keeps the browser tests
 * about what the student sees, while still exercising real sessions rather than
 * mocks.
 */

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export interface OpenedSession {
  roomCode: string;
  sessionId: string;
  instructorToken: string;
}

export async function openSession(
  options: { instructorName?: string; workshopTitle?: string; sessionPassword?: string } = {}
): Promise<OpenedSession> {
  const roomCode = randomRoomCode();
  const res = await fetch(`${BACKEND_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomCode,
      instructorName: options.instructorName ?? "Ada Lovelace",
      workshopTitle: options.workshopTitle ?? "Debugging in the small",
      sessionPassword: options.sessionPassword,
    }),
  });
  if (!res.ok) {
    throw new Error(`Could not open a session for the test: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return {
    roomCode,
    sessionId: data.session.id,
    instructorToken: data.instructorToken,
  };
}

export async function endSession(session: OpenedSession): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/sessions/${session.sessionId}/end`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${session.instructorToken}` },
  });
  if (!res.ok) {
    throw new Error(`Could not end the test session: ${res.status} ${await res.text()}`);
  }
}
