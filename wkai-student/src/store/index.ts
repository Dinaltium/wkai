import { create } from "zustand";
import type {
  Session,
  GuideBlock,
  ComprehensionQuestion,
  SharedFile,
  ErrorResolution,
  RoomTab,
  LiveExplanation,
  ChatMessage,
  DebugLogEntry,
  DebugLogLevel,
} from "../types";

interface StudentStore {
  // ─── Identity ──────────────────────────────────────────────────────────────
  studentId: string;
  joinToken: string | null;
  // Server-assigned identity + signed token, set on successful join.
  setAuth: (studentId: string, joinToken: string) => void;

  // ─── Session ───────────────────────────────────────────────────────────────
  session: Session | null;
  setSession: (s: Session | null) => void;
  sessionEnded: boolean;
  setSessionEnded: (v: boolean) => void;
  instructorOffline: boolean;
  setInstructorOffline: (v: boolean) => void;

  // ─── Connection ────────────────────────────────────────────────────────────
  connected: boolean;
  setConnected: (v: boolean) => void;
  studentCount: number;
  setStudentCount: (n: number) => void;

  // ─── Guide ─────────────────────────────────────────────────────────────────
  guideBlocks: GuideBlock[];
  addGuideBlock: (b: GuideBlock) => void;
  setGuideBlocks: (blocks: GuideBlock[]) => void;

  // ─── Comprehension ─────────────────────────────────────────────────────────
  pendingQuestion: ComprehensionQuestion | null;
  setPendingQuestion: (q: ComprehensionQuestion | null) => void;
  answeredQuestions: Set<string>;
  markAnswered: (id: string) => void;

  // ─── Files ─────────────────────────────────────────────────────────────────
  sharedFiles: SharedFile[];
  addSharedFile: (f: SharedFile) => void;
  setSharedFiles: (files: SharedFile[]) => void;
  newFileCount: number;
  clearNewFileCount: () => void;

  // ─── Error helper ──────────────────────────────────────────────────────────
  resolution: ErrorResolution | null;
  setResolution: (r: ErrorResolution | null) => void;
  errorDiagnosing: boolean;
  setErrorDiagnosing: (v: boolean) => void;

  // ─── AI Helper ─────────────────────────────────────────────────────────────
  colabAdvice: string | null;
  setColabAdvice: (a: string | null) => void;
  colabFollowUps: string[];
  setColabFollowUps: (f: string[]) => void;

  // ─── Live ──────────────────────────────────────────────────────────────────
  latestLiveExplanation: LiveExplanation | null;
  setLatestLiveExplanation: (e: LiveExplanation | null) => void;
  backgroundLiveEnabled: boolean;
  setBackgroundLiveEnabled: (v: boolean) => void;

  // ─── Messages ──────────────────────────────────────────────────────────────
  chatMessages: ChatMessage[];
  addChatMessage: (m: ChatMessage) => void;

  // ─── Debug ─────────────────────────────────────────────────────────────────
  debugLogs: DebugLogEntry[];
  addDebugLog: (msg: string, level?: DebugLogLevel) => void;
  clearDebugLogs: () => void;
  screenPreview: string | null;
  setScreenPreview: (url: string | null) => void;

  // ─── UI ────────────────────────────────────────────────────────────────────
  activeTab: RoomTab;
  setActiveTab: (t: RoomTab) => void;
}

// Identity is assigned by the server on join and persisted so a page reload in
// the room keeps the same signed token. Falls back to a placeholder before the
// first join (overwritten by setAuth).
const STUDENT_ID_KEY = "wkai_student_id";
const JOIN_TOKEN_KEY = "wkai_join_token";

const STUDENT_ID =
  sessionStorage.getItem(STUDENT_ID_KEY) ??
  (() => {
    const id = `s_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(STUDENT_ID_KEY, id);
    return id;
  })();

const SESSION_STORAGE_KEY = "wkai_student_session";

function readStoredSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export const useStore = create<StudentStore>((set) => ({
  studentId: STUDENT_ID,
  joinToken: sessionStorage.getItem(JOIN_TOKEN_KEY),
  setAuth: (studentId, joinToken) => {
    sessionStorage.setItem(STUDENT_ID_KEY, studentId);
    sessionStorage.setItem(JOIN_TOKEN_KEY, joinToken);
    set({ studentId, joinToken });
  },

  session: readStoredSession(),
  setSession: (session) => {
    if (session) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    set({ session });
  },
  sessionEnded: false,
  setSessionEnded: (sessionEnded) => set({ sessionEnded }),
  instructorOffline: false,
  setInstructorOffline: (instructorOffline) => set({ instructorOffline }),

  connected: false,
  setConnected: (connected) => set({ connected }),
  studentCount: 0,
  setStudentCount: (studentCount) => set({ studentCount }),

  guideBlocks: [],
  addGuideBlock: (b) => set((s) => ({ guideBlocks: [...s.guideBlocks, b] })),
  setGuideBlocks: (guideBlocks) => set({ guideBlocks }),

  pendingQuestion: null,
  setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
  answeredQuestions: new Set(),
  markAnswered: (id) =>
    set((s) => ({ answeredQuestions: new Set([...s.answeredQuestions, id]) })),

  sharedFiles: [],
  addSharedFile: (f) =>
    set((s) => ({
      sharedFiles: [f, ...s.sharedFiles],
      newFileCount: s.activeTab !== "files" ? s.newFileCount + 1 : 0,
    })),
  setSharedFiles: (sharedFiles) => set({ sharedFiles }),
  newFileCount: 0,
  clearNewFileCount: () => set({ newFileCount: 0 }),

  resolution: null,
  setResolution: (resolution) => set({ resolution }),
  errorDiagnosing: false,
  setErrorDiagnosing: (errorDiagnosing) => set({ errorDiagnosing }),

  colabAdvice: null,
  setColabAdvice: (colabAdvice) => set({ colabAdvice }),
  colabFollowUps: [],
  setColabFollowUps: (colabFollowUps) => set({ colabFollowUps }),

  latestLiveExplanation: null,
  setLatestLiveExplanation: (latestLiveExplanation) => set({ latestLiveExplanation }),
  backgroundLiveEnabled: true,
  setBackgroundLiveEnabled: (backgroundLiveEnabled) => set({ backgroundLiveEnabled }),

  chatMessages: [],
  addChatMessage: (m) => set((s) => ({ chatMessages: [...s.chatMessages, m] })),

  debugLogs: [],
  addDebugLog: (message, level = "info") =>
    set((s) => ({
      debugLogs: [
        ...s.debugLogs,
        { id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString(), message, level },
      ].slice(-100),
    })),
  clearDebugLogs: () => set({ debugLogs: [] }),
  screenPreview: null,
  setScreenPreview: (screenPreview) => set({ screenPreview }),

  activeTab: "guide",
  setActiveTab: (activeTab) => {
    set({ activeTab });
    if (activeTab === "files") set({ newFileCount: 0 });
  },
}));
