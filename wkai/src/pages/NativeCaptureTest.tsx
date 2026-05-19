import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

import { useNativeCapture } from "../hooks/useNativeCapture";
import { useCaptureDevices } from "../hooks/useCaptureDevices";
import { useCaptureMetrics } from "../hooks/useCaptureMetrics";
import { useAppStore } from "../store";

import { CapturePreview } from "../components/nativeCapture/CapturePreview";
import { DeviceSelector } from "../components/nativeCapture/DeviceSelector";
import { CaptureControls } from "../components/nativeCapture/CaptureControls";
import { CaptureMetrics } from "../components/nativeCapture/CaptureMetrics";
import {
  NativeCaptureDebug,
  type DebugLogEntry,
} from "../components/nativeCapture/NativeCaptureDebug";
import { PlatformBadge } from "../components/nativeCapture/PlatformBadge";

import type {
  CaptureTarget,
  CaptureQualityType,
  CaptureFramerateType,
} from "../types/nativeCapture";

const FRAMERATE_MAP: Record<string, number> = {
  auto: 30,
  "15": 15,
  "24": 24,
  "30": 30,
  "60": 60,
};

export function NativeCaptureTest() {
  const capture = useNativeCapture();
  const devices = useCaptureDevices();
  const metricsHook = useCaptureMetrics();
  const { settings } = useAppStore();

  const [selectedTarget, setSelectedTarget] = useState<CaptureTarget | null>(
    null
  );
  const [framerate, setFramerate] = useState<CaptureFramerateType>("auto");
  const [quality, setQuality] = useState<CaptureQualityType>("auto");
  const [debugOpen, setDebugOpen] = useState(true);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const logCountRef = useRef(0);

  const addLog = useCallback(
    (message: string, level: DebugLogEntry["level"] = "info") => {
      logCountRef.current += 1;
      setDebugLogs((prev) => [
        ...prev.slice(-99),
        {
          timestamp: new Date().toLocaleTimeString(),
          message,
          level,
        },
      ]);
    },
    []
  );

  const handleStart = useCallback(async () => {
    if (!selectedTarget) return;
    const fpsValue = FRAMERATE_MAP[String(framerate)] ?? 30;
    addLog(
      `Starting capture: ${selectedTarget.type} ${selectedTarget.id} @ ${fpsValue}fps, quality=${quality}`,
      "info"
    );
    try {
      await capture.startCapture(selectedTarget, {
        fps: fpsValue,
        quality,
        preview_width: 1280,
      }, {
        saveLocal: settings.saveLocalRecording,
        dir: settings.recordingDirectory || "",
        format: settings.recordingFormat || "mp4"
      });
      addLog("Capture started successfully", "success");
    } catch (e) {
      addLog(
        `Failed to start: ${e instanceof Error ? e.message : String(e)}`,
        "error"
      );
    }
  }, [selectedTarget, framerate, quality, capture, addLog]);

  const handleStop = useCallback(async () => {
    addLog("Stopping capture...", "info");
    try {
      await capture.stopCapture();
      addLog("Capture stopped", "success");
    } catch (e) {
      addLog(
        `Failed to stop: ${e instanceof Error ? e.message : String(e)}`,
        "error"
      );
    }
  }, [capture, addLog]);

  // Use metrics from either the capture hook or the dedicated metrics hook
  const activeMetrics =
    capture.metrics.total_frames > 0
      ? capture.metrics
      : metricsHook.metrics;

  return (
    <div className="h-full overflow-auto bg-wkai-bg">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/session"
              className="flex items-center gap-1.5 text-xs text-wkai-text-dim hover:text-wkai-text transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Session
            </Link>
            <PlatformBadge
              platform={capture.platform}
              backend={capture.status.backend}
            />
          </div>
          <div className="flex items-center gap-2">
            {capture.error && (
              <span className="text-xs text-red-400 bg-red-500/10 px-2.5 py-1 rounded-md">
                {capture.error}
              </span>
            )}
          </div>
        </div>

        {/* ─── Main Grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Left: Preview */}
          <div className="space-y-3">
            <CapturePreview
              canvasRef={capture.canvasRef}
              attachCanvas={capture.attachCanvas}
              status={capture.status.status}
            />
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            {/* Device Selector */}
            <div className="card p-3">
              <DeviceSelector
                monitors={devices.monitors}
                windows={devices.windows}
                selectedTarget={selectedTarget}
                onSelect={setSelectedTarget}
                isLoading={devices.isLoading}
                onRefresh={() => {
                  addLog("Refreshing device list...", "info");
                  devices.refreshDevices();
                }}
              />
            </div>

            {/* Controls */}
            <div className="card p-3">
              <CaptureControls
                status={capture.status}
                onStart={handleStart}
                onStop={handleStop}
                selectedTarget={selectedTarget}
                framerate={framerate}
                quality={quality}
                onFramerateChange={setFramerate}
                onQualityChange={setQuality}
                isLoading={capture.isLoading}
              />
            </div>

            {/* Metrics */}
            <div className="card p-3">
              <CaptureMetrics
                metrics={activeMetrics}
                fpsHistory={metricsHook.fpsHistory}
              />
            </div>
          </div>
        </div>

        {/* ─── Debug Panel (collapsible) ──────────────────────────────── */}
        <div>
          <button
            onClick={() => setDebugOpen(!debugOpen)}
            className="flex items-center gap-2 text-xs text-wkai-text-dim hover:text-wkai-text transition-colors mb-2"
          >
            {debugOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Debug Console
          </button>
          {debugOpen && (
            <NativeCaptureDebug
              logs={debugLogs}
              onClear={() => setDebugLogs([])}
            />
          )}
        </div>
      </div>
    </div>
  );
}
