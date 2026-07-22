use std::sync::{Arc, Mutex};

use tauri::State;

use crate::native_capture::CaptureManager;
use crate::native_capture::types::*;

type ManagerState<'r> = State<'r, Arc<Mutex<CaptureManager>>>;

/// Return the name of the active platform capture backend.
#[tauri::command]
pub async fn get_platform_backend(state: ManagerState<'_>) -> Result<String, String> {
    state
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?
        .backend_name()
        .map_err(|e| e.to_string())
}

/// List available capture devices (monitors + windows).
#[tauri::command]
pub async fn list_capture_devices(state: ManagerState<'_>) -> Result<CaptureDevices, String> {
    let mut mgr = state.lock().map_err(|e| format!("Lock poisoned: {e}"))?;

    let monitors = mgr.list_monitors().map_err(|e| e.to_string())?;
    let windows = mgr.list_windows().map_err(|e| e.to_string())?;

    Ok(CaptureDevices { monitors, windows })
}

/// Start native screen capture for the given target.
#[tauri::command]
pub async fn start_native_capture(
    target: CaptureTarget,
    config: CaptureConfig,
    state: ManagerState<'_>,
) -> Result<(), String> {
    state
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?
        .start_capture(target, config)
        .map_err(|e| e.to_string())
}

/// Stop an active capture session.
#[tauri::command]
pub async fn stop_native_capture(state: ManagerState<'_>) -> Result<(), String> {
    state
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?
        .stop_capture()
        .map_err(|e| e.to_string())
}

/// Get current capture status.
#[tauri::command]
pub async fn get_capture_status(state: ManagerState<'_>) -> Result<CaptureStatus, String> {
    state
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?
        .get_status()
        .map_err(|e| e.to_string())
}

/// Get current capture metrics.
#[tauri::command]
pub async fn get_capture_metrics(state: ManagerState<'_>) -> Result<CaptureMetrics, String> {
    state
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?
        .get_metrics()
        .map_err(|e| e.to_string())
}

/// Append a video chunk to a recording file on disk.
#[tauri::command]
pub async fn append_to_recording(path: String, chunk: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    file.write_all(&chunk)
        .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
    Ok(())
}
