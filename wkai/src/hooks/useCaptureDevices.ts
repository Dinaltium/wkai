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
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return { monitors, windows, isLoading, error, refreshDevices };
}
