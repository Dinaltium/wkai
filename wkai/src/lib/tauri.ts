import { invoke } from "@tauri-apps/api/core";
import type { Session, CaptureConfig, WatchedFile } from "../types";

// ─── Session Commands ─────────────────────────────────────────────────────────

export async function createSession(
  instructorName: string,
  workshopTitle: string
): Promise<Session> {
  return invoke<Session>("create_session", { instructorName, workshopTitle });
}

export async function endSession(sessionId: string): Promise<void> {
  return invoke("end_session", { sessionId });
}

export async function getSessionStatus(sessionId: string): Promise<string> {
  return invoke("get_session_status", { sessionId });
}

// ─── Capture Commands ─────────────────────────────────────────────────────────

export async function startCapture(config: CaptureConfig): Promise<void> {
  return invoke("start_capture", {
    config: {
      frames_per_minute: config.framesPerMinute,
      capture_audio: config.captureAudio,
      session_id: config.sessionId,
    },
  });
}

export async function stopCapture(): Promise<void> {
  return invoke("stop_capture");
}

// ─── File Commands ────────────────────────────────────────────────────────────

export async function watchFolder(folderPath: string): Promise<void> {
  return invoke("watch_folder", { folderPath });
}

export async function shareFile(
  sessionId: string,
  filePath: string
): Promise<string> {
  return invoke<string>("share_file", { sessionId, filePath });
}

export async function listWatchedFiles(
  folderPath: string
): Promise<WatchedFile[]> {
  return invoke<WatchedFile[]>("list_watched_files", { folderPath });
}
