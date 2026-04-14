// ─── Session ──────────────────────────────────────────────────────────────────
export interface Session {
  id: string;
  roomCode: string;
  instructorName: string;
  workshopTitle: string;
  status: "active" | "paused" | "ended";
  startedAt: string;
}

// ─── Guide ────────────────────────────────────────────────────────────────────
export type BlockType = "step" | "tip" | "code" | "explanation" | "comprehension";

export interface GuideBlock {
  id: string;
  sessionId: string;
  type: BlockType;
  title:    string | null;
  content:  string;
  code:     string | null;
  language: string | null;
  locked:   boolean;
  timestamp: string;
}

// ─── Comprehension ────────────────────────────────────────────────────────────
export interface ComprehensionQuestion {
  id: string;
  sessionId: string;
  guideBlockId: string | null;
  question: string;
  options:  string[];
  correctIndex: number;
  explanation: string;
}

export interface ComprehensionResult {
  questionId: string;
  correct: boolean;
  explanation: string;
}

// ─── Files ────────────────────────────────────────────────────────────────────
export interface SharedFile {
  id: string;
  name: string;
  url: string;
  sizeBytes: number | null;
  sharedAt: string;
}

// ─── Error resolution ─────────────────────────────────────────────────────────
export interface ErrorResolution {
  diagnosis:    string;
  fixCommand:   string | null;
  fixSteps:     string[] | null;
  isSetupError: boolean;
  severity:     "blocking" | "warning" | "info";
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

// ─── WebSocket ────────────────────────────────────────────────────────────────
export type WsEventType =
  | "session-state"
  | "guide-block"
  | "comprehension-question"
  | "comprehension-result"
  | "file-shared"
  | "screen-preview"
  | "student-joined"
  | "student-left"
  | "error-resolved"
  | "student-message"
  | "instructor-reply"
  | "ai-reply"
  | "webrtc-offer"
  | "webrtc-answer"
  | "webrtc-ice-candidate"
  | "webrtc-session-reset"
  | "session-ended"
  | "error";

export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp?: string;
}

// ─── Tab ─────────────────────────────────────────────────────────────────────
export type RoomTab = "guide" | "files" | "editor" | "error" | "live" | "messages";

export interface ChatMessage {
  id: string;
  role: "student" | "instructor" | "ai";
  text: string;
  timestamp: string;
  pending?: boolean;
}

export type DebugLogLevel = "info" | "warn" | "error" | "success";

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: DebugLogLevel;
}
