import { create } from "zustand";
import type {
  Session,
  GuideBlock,
  ComprehensionQuestion,
  SharedFile,
  ErrorResolution,
  RoomTab,
} from "../types";

interface StudentStore {
  // ─── Identity ──────────────────────────────────────────────────────────────
  studentId: string;

  // ─── Session ───────────────────────────────────────────────────────────────
  session: Session | null;
  setSession: (s: Session | null) => void;
  sessionEnded: boolean;
  setSessionEnded: (v: boolean) => void;

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

  // ─── UI ────────────────────────────────────────────────────────────────────
  activeTab: RoomTab;
  setActiveTab: (t: RoomTab) => void;
}

// Stable random student ID for this browser session
const STUDENT_ID =
  sessionStorage.getItem("wkai_student_id") ??
  (() => {
    const id = `s_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem("wkai_student_id", id);
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

  activeTab: "guide",
  setActiveTab: (activeTab) => {
    set({ activeTab });
    if (activeTab === "files") set({ newFileCount: 0 });
  },
}));
