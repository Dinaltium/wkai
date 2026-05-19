// ─── Native Capture Types ───────────────────────────────────────────────────

export interface MonitorInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface WindowInfo {
  id: string;
  title: string;
  appName: string;
  width: number;
  height: number;
}

export type CaptureTargetType = "monitor" | "window";

export interface CaptureTarget {
  type: CaptureTargetType;
  id: string;
}

export type CaptureQualityType = "low" | "medium" | "high" | "auto";

export type CaptureFramerateType = 15 | 24 | 30 | 60 | "auto";

export interface CaptureConfig {
  fps: number;
  quality: CaptureQualityType;
  preview_width: number;
}

export type CaptureStatusType =
  | "idle"
  | "initializing"
  | "capturing"
  | "stopping"
  | "error";

export interface CaptureStatus {
  status: CaptureStatusType;
  error?: string;
  backend: string;
}

export interface CaptureMetrics {
  fps: number;
  dropped_frames: number;
  total_frames: number;
  capture_time_ms: number;
  frame_size_bytes: number;
}

export interface CaptureDevices {
  monitors: MonitorInfo[];
  windows: WindowInfo[];
}

export type PlatformBackend = "windows" | "linux" | "macos" | "unknown";

export type RecordingFormat = "mp4" | "webm";

export interface FramePayload {
  data: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface CaptureErrorPayload {
  message: string;
  recoverable: boolean;
}
