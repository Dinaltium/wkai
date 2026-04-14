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

export interface CaptureState {
  isCapturing: boolean;
  lastFrameAt: string | null;
  framesSent: number;
  aiProcessing: boolean;
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
  | "webrtc-session-reset";

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
}