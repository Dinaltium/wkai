use std::sync::{Arc, Mutex};

use tauri::{ipc::Response, State};

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

/// Pull the most recently captured frame as raw bytes — no base64, no JSON.
/// Returns an empty response when nothing new has landed since the last
/// pull; the caller should not redraw in that case.
///
/// Layout: `[width:u32 LE][height:u32 LE][timestamp_ms:u64 LE][jpeg bytes]`.
///
/// This used to return `Option<FramePayload>` (base64 string in a JSON
/// envelope). That was the actual bottleneck, not JPEG decode: Tauri's normal
/// command return path JSON-serializes the response, so a ~1MB base64 string
/// was being stringified, pushed across the webview IPC bridge, and
/// JSON.parsed back out on every single pull — hundreds of ms per frame,
/// which is exactly the "2fps no matter what" symptom. `tauri::ipc::Response`
/// sends raw bytes with none of that, called from the frontend's own render
/// loop so display speed is bounded by consumption, never by a backlog.
#[tauri::command]
pub async fn get_latest_frame(state: ManagerState<'_>) -> Result<Response, String> {
    let frame = {
        let mgr = state.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
        mgr.take_latest_frame()
    };

    let Some(f) = frame else {
        return Ok(Response::new(Vec::new()));
    };

    let mut buf = Vec::with_capacity(16 + f.jpeg_data.len());
    buf.extend_from_slice(&f.width.to_le_bytes());
    buf.extend_from_slice(&f.height.to_le_bytes());
    buf.extend_from_slice(&f.timestamp_ms.to_le_bytes());
    buf.extend_from_slice(&f.jpeg_data);
    Ok(Response::new(buf))
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
