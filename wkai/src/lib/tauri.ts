import { invoke } from "@tauri-apps/api/core";
import type { ExplorerFileEntry, Session, WatchedFile } from "../types";

// ─── Session Commands ─────────────────────────────────────────────────────────

export async function createSession(
  instructorName: string,
  workshopTitle: string,
  backendUrl: string,
  sessionPassword?: string
): Promise<Session> {
  return invoke<Session>("create_session", {
    instructorName,
    workshopTitle,
    backendUrl,
    sessionPassword,
  });
}

export async function endSession(
  sessionId: string,
  backendUrl: string,
  instructorToken?: string
): Promise<void> {
  return invoke("end_session", { sessionId, backendUrl, instructorToken });
}

export async function getSessionStatus(
  sessionId: string,
  backendUrl: string
): Promise<string> {
  return invoke("get_session_status", { sessionId, backendUrl });
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

export async function captureScreen(): Promise<string> {
  return invoke<string>("capture_screen");
}

// ─── Native Recording (Phase 1a: FFmpeg-driven) ───────────────────────────────

export type CaptureMode = "gpu-dda" | "cpu-gdi";
export type VideoEncoder = "nvenc-h264" | "nvenc-hevc" | "qsv-h264" | "amf-h264" | "x264";
export type RateControl =
  | { mode: "cbr"; bitrateKbps: number }
  | { mode: "crf"; quality: number };

export interface RecordConfig {
  captureMode: CaptureMode;
  fps: number;
  width?: number | null;
  height?: number | null;
  encoder: VideoEncoder;
  rateControl: RateControl;
  keyframeIntervalSecs: number;
  container: "mp4" | "mkv";
  audioDevice?: string | null;
  audioBitrateKbps: number;
  outputPath: string;
}

/** Start a native recording (FFmpeg captures+encodes to disk). No browser MediaRecorder. */
export async function startRecording(config: RecordConfig, ffmpegPath?: string): Promise<void> {
  return invoke("start_recording", { config, ffmpegPath });
}

/** Stop and finalize the recording; resolves with the output file path. */
export async function stopRecording(): Promise<string> {
  return invoke<string>("stop_recording");
}

/** True while a recording is active. */
export async function recordingStatus(): Promise<boolean> {
  return invoke<boolean>("recording_status");
}

interface UrlImportDiagnosis {
  accessible: boolean;
  reason: string;
  technical?: string;
}

interface UrlImportResponse {
  accessible: boolean;
  files: ExplorerFileEntry[];
  diagnosis: UrlImportDiagnosis;
}

export async function importFilesFromUrl(
  url: string,
  backendUrl: string
): Promise<UrlImportResponse> {
  const res = await fetch(`${backendUrl}/api/files/import-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.diagnosis?.reason ?? body?.error ?? `URL import failed (${res.status})`;
    throw new Error(message);
  }

  return body as UrlImportResponse;
}