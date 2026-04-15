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