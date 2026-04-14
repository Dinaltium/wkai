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
  joinToken?: string;
}

/** Validate a room code and fetch its current state. */
export async function joinRoom(
  roomCode: string,
  studentId: string,
  studentName: string,
  sessionPassword?: string
): Promise<JoinRoomResponse> {
  const { data } = await api.post<JoinRoomResponse>(
    `/api/sessions/${roomCode.toUpperCase()}/join`,
    { studentId, studentName, sessionPassword }
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
