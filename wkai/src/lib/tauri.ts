import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ExplorerFileEntry, Session, WatchedFile } from "../types";

/**
 * Outside the Tauri runtime (the browser preview used for UI work) `invoke`
 * is not wired up, and calling it surfaced "Cannot read properties of
 * undefined (reading 'invoke')" straight into the UI. Session create/end are
 * plain HTTP under the hood, so they fall back to fetch; everything else is
 * genuinely native and now says so in words.
 */
function nativeOnly(feature: string): never {
  throw new Error(`${feature} needs the WKAI desktop app — it is not available in a browser.`);
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Backend returned ${res.status}`);
  }
  return (await res.json()) as T;
}

// ─── Session Commands ─────────────────────────────────────────────────────────

export async function createSession(
  instructorName: string,
  workshopTitle: string,
  backendUrl: string,
  sessionPassword?: string,
  workspaceName?: string
): Promise<Session> {
  if (isTauri()) {
    return invoke<Session>("create_session", {
      instructorName,
      workshopTitle,
      backendUrl,
      sessionPassword,
      workspaceName: workspaceName || null,
    });
  }

  const data = await postJson<{ session: Session; instructorToken: string }>(
    `${backendUrl}/api/sessions`,
    {
      roomCode: generateRoomCode(),
      instructorName,
      workshopTitle,
      sessionPassword,
      workspaceName: workspaceName || null,
    }
  );
  return { ...data.session, instructorToken: data.instructorToken };
}

export async function endSession(
  sessionId: string,
  backendUrl: string,
  instructorToken?: string
): Promise<void> {
  if (isTauri()) {
    return invoke("end_session", { sessionId, backendUrl, instructorToken });
  }
  await postJson(`${backendUrl}/api/sessions/${sessionId}/end`, undefined, instructorToken);
}

export async function getSessionStatus(
  sessionId: string,
  backendUrl: string
): Promise<string> {
  return invoke("get_session_status", { sessionId, backendUrl });
}

// ─── File Commands ────────────────────────────────────────────────────────────

export async function watchFolder(folderPath: string): Promise<void> {
  if (!isTauri()) nativeOnly("Watching a folder");
  return invoke("watch_folder", { folderPath });
}

export async function shareFile(
  sessionId: string,
  filePath: string,
  backendUrl: string
): Promise<string> {
  if (!isTauri()) nativeOnly("Sharing a file from disk");
  return invoke<string>("share_file", { sessionId, filePath, backendUrl });
}

export async function listWatchedFiles(
  folderPath: string
): Promise<WatchedFile[]> {
  if (!isTauri()) nativeOnly("Reading a local folder");
  return invoke<WatchedFile[]>("list_watched_files", { folderPath });
}

export async function captureScreen(): Promise<string> {
  if (!isTauri()) nativeOnly("Screen capture");
  return invoke<string>("capture_screen");
}

// ─── Audio Commands ───────────────────────────────────────────────────────────
// Mic → 30s WAV chunks emitted as "audio-chunk" events, which useTauriEvents
// forwards to Whisper. Separate from the mic track added to the WebRTC stream:
// that one is for students to hear, this one is for transcription.

export async function listAudioInputDevices(): Promise<string[]> {
  return invoke<string[]>("list_audio_input_devices");
}

/** Resolves to the name of the input device actually opened. */
export async function startAudioCapture(
  sessionId: string,
  deviceName?: string
): Promise<string> {
  return invoke<string>("start_audio_capture", { sessionId, deviceName: deviceName || null });
}

export async function stopAudioCapture(): Promise<void> {
  return invoke("stop_audio_capture");
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