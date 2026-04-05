// ─── Session ────────────────────────────────────────────────────────────────

export type SessionStatus = "idle" | "active" | "paused" | "ended";

export interface Session {
  id: string;
  roomCode: string;
  instructorName: string;
  workshopTitle: string;
  startedAt: string;
  status: SessionStatus;
}

// ─── AI Guide Content ────────────────────────────────────────────────────────

export type GuideBlockType = "step" | "tip" | "code" | "explanation" | "comprehension";

export interface GuideBlock {
  id: string;
  type: GuideBlockType;
  title?: string;
  content: string;
  code?: string;
  language?: string;
  timestamp: string;
  locked?: boolean;
}

export interface ComprehensionQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  guideBlockId: string; // unlocks this block on correct answer
}

// ─── Files ───────────────────────────────────────────────────────────────────

export interface WatchedFile {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface SharedFile {
  id: string;
  name: string;
  url: string;
  sharedAt: string;
  sizeBytes: number;
}

// ─── Capture ─────────────────────────────────────────────────────────────────

export interface CaptureConfig {
  framesPerMinute: number;
  captureAudio: boolean;
  sessionId: string;
}

export interface CaptureState {
  isCapturing: boolean;
  lastFrameAt: string | null;
  framesSent: number;
  aiProcessing: boolean;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WsEventType =
  | "guide-block"
  | "comprehension-question"
  | "file-shared"
  | "student-joined"
  | "student-left"
  | "error-resolved"
  | "session-ended";

export interface WsEvent<T = unknown> {
  type: WsEventType;
  sessionId: string;
  payload: T;
  timestamp: string;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppSettings {
  instructorName: string;
  watchFolder: string;
  backendUrl: string;
  openaiApiKey: string;
  framesPerMinute: number;
  captureAudio: boolean;
}
