import axios from "axios";
import type { Session, GuideBlock, SharedFile } from "../types";

/** The port the backend listens on, when we have to guess a host ourselves. */
const DEFAULT_BACKEND_PORT = (import.meta.env.VITE_BACKEND_PORT ?? '4000').trim();

/** localhost in its several spellings. */
function isLoopback(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(host);
}

/**
 * An address that only means anything on one particular network — a wifi LAN
 * or this machine. The distinction matters because a host like this baked into
 * a build is only correct until the router hands out a different lease.
 */
function isLanHost(host: string): boolean {
  if (!host) return false;
  if (isLoopback(host)) return true;
  if (/\.local$/i.test(host)) return true;
  return (
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function splitHostPort(hostPort: string): { host: string; port: string } {
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(hostPort);
  return { host: m?.[1] ?? hostPort, port: m?.[2] ?? '' };
}

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
 *
 * On a LAN the host is worked out from the page rather than configured. A
 * student reaches this app by opening the instructor's machine at, say,
 * http://172.25.2.218:3000 — so the backend is that same machine on the
 * backend port, and no file needs to know the number. A build-time LAN address
 * goes stale the moment the wifi hands out a different lease, and the symptom
 * is not an error message: every request goes to an address nobody answers.
 *
 * A configured VITE_BACKEND_URL still wins whenever it names a public host —
 * that is a real deployment pointing at a real backend. It is overridden only
 * when it names a LAN address that disagrees with the page the student is
 * actually looking at, which is exactly the stale-lease case.
 */
export function getBackendUrl(): string {
  const override = sessionStorage.getItem('wkai_backend_url')?.trim();
  const configured = (import.meta.env.VITE_BACKEND_URL ?? '').trim();
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const scheme = secure ? 'https' : 'http';

  const withScheme = (value: string) =>
    /^https?:\/\//i.test(value) ? value : `${scheme}://${value.replace(/^\/\//, '')}`;

  // A hand-entered address is a deliberate act; nothing second-guesses it.
  if (override) return withScheme(override);

  const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const configuredHostPort = configured.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const { host: configuredHost, port: configuredPort } = splitHostPort(configuredHostPort);

  // Keep a configured backend unless it points somewhere only reachable on a
  // network we are demonstrably not on.
  if (configured && !(isLanHost(configuredHost) && pageHost && configuredHost !== pageHost)) {
    return withScheme(configured);
  }

  // Follow the page. Its port is the app's, not the backend's, so use the
  // configured backend port when there was one and the default otherwise.
  if (pageHost) {
    const port = configuredPort || DEFAULT_BACKEND_PORT;
    // A public host with no configuration is a deployment served behind one
    // origin; guessing a port there would break a working same-origin setup.
    if (!isLanHost(pageHost)) return `${scheme}://${pageHost}${window.location.port ? `:${window.location.port}` : ''}`;
    return `${scheme}://${pageHost}:${port}`;
  }

  return `http://localhost:${DEFAULT_BACKEND_PORT}`;
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
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';

  let explicit = (import.meta.env.VITE_BACKEND_WS ?? '')
    .trim()
    .replace(/^wss?:\/\//i, '')
    .replace(/^https?:\/\//i, '');
  // Same staleness test the REST host uses. A build that shipped with the
  // repo's localhost default — or with last month's wifi lease — would point
  // the socket at an address nobody answers while REST talks to the real
  // backend. Drop it and follow the REST host instead.
  const { host: explicitHost } = splitHostPort(explicit.replace(/\/+$/, ''));
  if (explicit && isLanHost(explicitHost) && pageHost && explicitHost !== pageHost) {
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

export interface RoomPreflight {
  id: string;
  roomCode: string;
  status: Session["status"];
  passwordRequired: boolean;
}

/**
 * Ask what a room needs before trying to enter it.
 *
 * Without this the student app had to guess: the join form showed a password
 * box on every room with "(only if asked for one)" next to it, and a link
 * straight to /room/:code joined with no password at all, so a protected room
 * failed with "check the code" when the code was perfectly correct.
 */
export async function getRoomPreflight(roomCode: string): Promise<RoomPreflight> {
  const { data } = await api.get<RoomPreflight>(`/api/sessions/${roomCode.toUpperCase()}`);
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
