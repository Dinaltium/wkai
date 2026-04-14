import { invoke } from "@tauri-apps/api/core";
import type { Session, CaptureConfig, WatchedFile } from "../types";

// ─── Session Commands ─────────────────────────────────────────────────────────

export async function createSession(
  instructorName: string,
  workshopTitle: string,
  backendUrl: string
): Promise<Session> {
  return invoke<Session>("create_session", {
    instructorName,
    workshopTitle,
    backendUrl,
  });
}

export async function endSession(
  sessionId: string,
  backendUrl: string
): Promise<void> {
  return invoke("end_session", { sessionId, backendUrl });
}

export async function getSessionStatus(
  sessionId: string,
  backendUrl: string
): Promise<string> {
  return invoke("get_session_status", { sessionId, backendUrl });
}

// ─── Capture Commands ─────────────────────────────────────────────────────────

export async function startCapture(config: CaptureConfig): Promise<void> {
  return invoke("start_capture", {
    config: {
      framesPerMinute: config.framesPerMinute,
      captureAudio: config.captureAudio,
      sessionId: config.sessionId,
      streamToStudents: config.streamToStudents ?? true,
    },
  });
}

export async function stopCapture(): Promise<void> {
  return invoke("stop_capture");
}

export async function captureTestFrame(): Promise<string> {
  return invoke<string>("capture_test_frame");
}

// ─── File Commands ────────────────────────────────────────────────────────────

export async function watchFolder(folderPath: string): Promise<void> {
  return invoke("watch_folder", { folderPath });
}

export async function shareFile(
  sessionId: string,
  filePath: string,
  backendUrl: string
): Promise<string> {
  return invoke<string>("share_file", { sessionId, filePath, backendUrl });
}

export async function listWatchedFiles(
  folderPath: string
): Promise<WatchedFile[]> {
  return invoke<WatchedFile[]>("list_watched_files", { folderPath });
}