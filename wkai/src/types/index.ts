// ─── Session ────────────────────────────────────────────────────────────────

export type SessionStatus = "idle" | "active" | "paused" | "ended";

export interface Session {
  id: string;
  roomCode: string;
  instructorName: string;
  workshopTitle: string;
  startedAt: string;
  status: SessionStatus;
  /** Signed session-ownership token — sent on the WS connection and end-session call. */
  instructorToken?: string;
  /** Folder this session belongs to; its earlier sessions feed the AI's context. */
  workspaceId?: string | null;
  workspaceName?: string | null;
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

export type ExplorerSource = "folder" | "upload" | "url";

export interface ExplorerFileEntry {
  name: string;
  path: string;
  sizeBytes: number | null;
  source: ExplorerSource;
  ghost?: boolean;
  url?: string;
}

export interface SharedFile {
  id: string;
  name: string;
  url: string;
  sharedAt: string;
  sizeBytes: number;
  type?: "shared" | "material";
}

export interface StudentInfo {
  studentId: string;
  studentName: string;
  joinedAt: string;
}

export interface InstructorMessage {
  messageId: string;
  studentId: string;
  studentName: string;
  message: string;
  timestamp: string;
  replied: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  ownerName?: string | null;
  createdAt?: string;
  sessionCount?: number;
  lastSessionAt?: string;
}

export interface WebRtcOfferPayload {
  sdp: RTCSessionDescriptionInit;
  targetStudentId?: string;
}

export interface WebRtcAnswerPayload {
  sdp: RTCSessionDescriptionInit;
  studentId: string;
}

export interface WebRtcIceCandidatePayload {
  candidate: RTCIceCandidateInit;
  studentId?: string;
}

export interface WebRtcSessionResetPayload {
  reason?: string;
}

export interface WebRtcRequestOfferPayload {
  studentId: string;
  reason?: string;
}

// ─── Debug Logs ───────────────────────────────────────────────────────────────

export type DebugLogLevel = "info" | "warn" | "error" | "success";

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: DebugLogLevel;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WsEventType =
  | "guide-block"
  | "comprehension-question"
  | "file-shared"
  | "student-joined"
  | "student-left"
  | "error-resolved"
  | "session-ended"
  | "student-message"
  | "instructor-reply"
  | "ai-reply"
  | "webrtc-offer"
  | "webrtc-answer"
  | "webrtc-ice-candidate"
  | "webrtc-session-reset"
  | "webrtc-request-offer"
  | "student-list"
  | "ai-frame-result"
  | "session-state";

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
  groqApiKey: string;
  saveLocalRecording: boolean;
  recordingDirectory: string;
  recordingFormat: "mp4" | "webm";
  captureFramerate: 15 | 24 | 30 | 60 | "auto";
  captureQuality: "low" | "medium" | "high" | "auto";
  /** Periodic screen-frame → Groq vision → guide-block summarization. Costs an API call per frame. */
  aiGuideBlocksEnabled: boolean;
  /** Mic audio → Whisper transcription. Costs an API call per audio chunk. */
  aiTranscriptionEnabled: boolean;
  /** Input device name for transcription. Empty = system default. */
  micDevice: string;
}

/**
 * Per-session override of the AI/recording toggles above. Seeded from
 * AppSettings when a session starts, then lives independently — flipping
 * one off for "this session" never writes back to the global default.
 */
export interface SessionAiSettings {
  aiGuideBlocksEnabled: boolean;
  aiTranscriptionEnabled: boolean;
  saveLocalRecording: boolean;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // seconds
  isMuted: boolean;
}