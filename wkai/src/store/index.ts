import { create } from "zustand";
import type {
  Session,
  CaptureState,
  GuideBlock,
  SharedFile,
  AppSettings,
} from "../types";

interface AppStore {
  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;

  // ─── Session ───────────────────────────────────────────────────────────────
  session: Session | null;
  setSession: (session: Session | null) => void;

  // ─── Capture ───────────────────────────────────────────────────────────────
  capture: CaptureState;
  setCapture: (partial: Partial<CaptureState>) => void;

  // ─── Guide Content ─────────────────────────────────────────────────────────
  guideBlocks: GuideBlock[];
  addGuideBlock: (block: GuideBlock) => void;
  clearGuide: () => void;

  // ─── Shared Files ──────────────────────────────────────────────────────────
  sharedFiles: SharedFile[];
  addSharedFile: (file: SharedFile) => void;

  // ─── Student Count ─────────────────────────────────────────────────────────
  studentCount: number;
  setStudentCount: (n: number) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  instructorName: "",
  watchFolder: "",
  backendUrl: "http://localhost:4000",
  openaiApiKey: "",
  framesPerMinute: 6,
  captureAudio: true,
};

export const useAppStore = create<AppStore>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),

  session: null,
  setSession: (session) => set({ session }),

  capture: {
    isCapturing: false,
    lastFrameAt: null,
    framesSent: 0,
    aiProcessing: false,
  },
  setCapture: (partial) =>
    set((s) => ({ capture: { ...s.capture, ...partial } })),

  guideBlocks: [],
  addGuideBlock: (block) =>
    set((s) => ({ guideBlocks: [...s.guideBlocks, block] })),
  clearGuide: () => set({ guideBlocks: [] }),

  sharedFiles: [],
  addSharedFile: (file) =>
    set((s) => ({ sharedFiles: [file, ...s.sharedFiles] })),

  studentCount: 0,
  setStudentCount: (n) => set({ studentCount: n }),
}));
