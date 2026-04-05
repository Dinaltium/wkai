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

export const useStore = create<StudentStore>((set, get) => ({
  studentId: STUDENT_ID,

  session: null,
  setSession: (session) => set({ session }),
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
