import axios from "axios";
import type { Session, GuideBlock, SharedFile } from "../types";

/**
 * Single source of truth for where the backend lives.
 *
 * The socket now reads the same value the REST client does. It used to read
 * only VITE_BACKEND_WS and fall back to ws://localhost:4000, so a hosted
 * student joined over HTTPS fine and then never opened a WebSocket at all —
 * no signalling, and therefore no video.
 *
 * A bare host (no scheme) inherits the page's protocol rather than being
 * forced to http/ws: on an HTTPS-served page an insecure ws:// connection is
 * blocked as mixed content before it ever reaches the server.
 */
export function getBackendUrl(): string {
  const raw = (
    sessionStorage.getItem('wkai_backend_url') ??
    import.meta.env.VITE_BACKEND_URL ??
    'http://localhost:4000'
  ).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return `${secure ? 'https' : 'http'}://${raw.replace(/^\/\//, '')}`;
}

/**
 * WebSocket origin, derived from the same backend URL the REST client uses.
 *
 * VITE_BACKEND_WS is honoured only for its host: its scheme is re-derived from
 * the page, because a deployment that still carries `ws://host` in its build
 * env would otherwise be blocked as mixed content on an HTTPS page and the
 * student would silently never connect.
 */
export function getBackendWsUrl(): string {
  const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const pageIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(pageHost);
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';

  let explicit = (import.meta.env.VITE_BACKEND_WS ?? '')
    .trim()
    .replace(/^wss?:\/\//i, '')
    .replace(/^https?:\/\//i, '');
  // A deployment that shipped with the repo's localhost default would point the
  // socket at the student's own machine while REST talks to the real backend.
  // Nothing is listening there, so drop it and follow the REST host instead.
  if (explicit && !pageIsLocal && /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(explicit)) {
    explicit = '';
  }

  const base = explicit || getBackendUrl().replace(/^https?:\/\//i, '');
  return `${secure ? 'wss' : 'ws'}://${base}`.replace(/\/+$/, '');
}

const api = axios.create({ baseURL: getBackendUrl() });

export interface JoinRoomResponse {
  session: Session;
  guideBlocks: GuideBlock[];
  sharedFiles: SharedFile[];
  /** Signed token carrying the server-assigned identity; presented on the WS connection. */
  joinToken: string;
  /** Server-assigned student id (not client-chosen — prevents impersonation). */
  studentId: string;
  studentName: string;
}

/** Join a room. The server assigns the studentId and returns a signed join token. */
export async function joinRoom(
  roomCode: string,
  studentName: string,
  sessionPassword?: string
): Promise<JoinRoomResponse> {
  const { data } = await api.post<JoinRoomResponse>(
    `/api/sessions/${roomCode.toUpperCase()}/join`,
    { studentName, sessionPassword }
  );
  return data;
}

export async function getRoomState(roomCode: string, joinToken?: string): Promise<JoinRoomResponse> {
  const { data } = await api.get<JoinRoomResponse>(
    `/api/sessions/${roomCode.toUpperCase()}`,
    { params: joinToken ? { joinToken } : undefined }
  );
  return data;
}

/** Submit a student error for AI diagnosis via REST (fallback if WS unavailable). */
export async function diagnoseError(errorMessage: string) {
  const { data } = await api.post("/api/ai/diagnose", { errorMessage });
  return data;
}
