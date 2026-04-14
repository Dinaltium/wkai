import { create } from "zustand";
import type {
  Session,
  CaptureState,
  GuideBlock,
  SharedFile,
  WatchedFile,
  AppSettings,
  DebugLogEntry,
  DebugLogLevel,
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

  // ─── Shared Files (already sent to students) ───────────────────────────────
  sharedFiles: SharedFile[];
  addSharedFile: (file: SharedFile) => void;

  // ─── Watched Files (local folder — available to share) ────────────────────
  watchedFiles: WatchedFile[];
  setWatchedFiles: (files: WatchedFile[]) => void;

  // ─── Student Count ─────────────────────────────────────────────────────────
  studentCount: number;
  setStudentCount: (n: number) => void;
  streamingToStudents: boolean;
  setStreamingToStudents: (v: boolean) => void;

  // ─── Debug Console ─────────────────────────────────────────────────────────
  debugLogs: DebugLogEntry[];
  addDebugLog: (message: string, level?: DebugLogLevel) => void;
  clearDebugLogs: () => void;
  debugPanelOpen: boolean;
  setDebugPanelOpen: (v: boolean) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  instructorName:  "",
  watchFolder:     "",
  backendUrl:      "http://localhost:4000",
  groqApiKey:      "",
  framesPerMinute: 6,
  captureAudio:    true,
};

export const useAppStore = create<AppStore>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),

  session: null,
  setSession: (session) => set({ session }),

  capture: {
    isCapturing:  false,
    lastFrameAt:  null,
    framesSent:   0,
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

  watchedFiles: [],
  setWatchedFiles: (watchedFiles) => set({ watchedFiles }),

  studentCount: 0,
  setStudentCount: (n) => set({ studentCount: n }),
  streamingToStudents: true,
  setStreamingToStudents: (streamingToStudents) => set({ streamingToStudents }),

  debugLogs: [],
  addDebugLog: (message, level = "info") =>
    set((s) => ({
      debugLogs: [
        ...s.debugLogs.slice(-49),
        {
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toLocaleTimeString(),
          message,
          level,
        },
      ],
    })),
  clearDebugLogs: () => set({ debugLogs: [] }),
  debugPanelOpen: false,
  setDebugPanelOpen: (debugPanelOpen) => set({ debugPanelOpen }),
}));