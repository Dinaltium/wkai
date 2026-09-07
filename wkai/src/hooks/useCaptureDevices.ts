import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  MonitorInfo,
  WindowInfo,
  CaptureDevices,
} from "../types/nativeCapture";

export function useCaptureDevices() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  // Cameras come from the webview, not the Rust capture backend: a USB webcam,
  // and equally a phone connected over USB or Wi-Fi through a phone-as-webcam
  // app, both register as ordinary video input devices here.
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const devices = await invoke<CaptureDevices>("list_capture_devices");
      setMonitors(devices.monitors);
      setWindows(devices.windows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }

    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((d) => d.kind === "videoinput"));
    } catch {
      setCameras([]);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return { monitors, windows, cameras, isLoading, error, refreshDevices };
}
