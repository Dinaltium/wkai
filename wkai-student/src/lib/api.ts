import axios from "axios";
import type { Session, GuideBlock, SharedFile } from "../types";

function getBackendUrl(): string {
  return (
    sessionStorage.getItem('wkai_backend_url') ??
    import.meta.env.VITE_BACKEND_URL ??
    'http://localhost:4000'
  );
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
