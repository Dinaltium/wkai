use base64::{engine::general_purpose, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use xcap::Monitor;

static CAPTURING: AtomicBool = AtomicBool::new(false);
const MAX_FRAME_WIDTH: u32 = 1024;
const JPEG_QUALITY: u8 = 75;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureConfig {
    pub frames_per_minute: u32,
    pub capture_audio: bool,
    pub session_id: String,
    pub stream_to_students: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScreenFramePayload {
    pub session_id: String,
    pub frame_b64: String,
    pub timestamp: String,
    pub width: u32,
    pub height: u32,
    pub stream_to_students: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDebugPayload {
    pub stage: String,
    pub frame_count: u64,
    pub elapsed_ms: Option<u128>,
    pub w: Option<u32>,
    pub h: Option<u32>,
    pub error: Option<String>,
    pub ts: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureError {
    pub message: String,
    pub timestamp: String,
}

fn emit_frontend<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Some(window) = app.get_webview_window("main") {
        if window.emit(event, payload.clone()).is_ok() {
            println!("[Capture] emit_frontend window ok: {}", event);
            return;
        }
        println!("[Capture] emit_frontend window failed: {}", event);
    } else {
        println!("[Capture] emit_frontend missing main window: {}", event);
    }
    if app.emit(event, payload).is_ok() {
        println!("[Capture] emit_frontend app ok: {}", event);
    } else {
        println!("[Capture] emit_frontend app failed: {}", event);
    }
}

#[tauri::command]
pub async fn start_capture(app: AppHandle, config: CaptureConfig) -> Result<(), String> {
    if CAPTURING.swap(true, Ordering::SeqCst) {
        return Err("Capture already running".to_string());
    }

    let interval_ms = ((60_000u64) / (config.frames_per_minute.max(1) as u64)).max(5_000);
    println!(
        "[Capture] Starting: session={} fpm={} stream={} interval={}ms",
        config.session_id, config.frames_per_minute, config.stream_to_students, interval_ms
    );
    emit_frontend(&app, "capture-status", serde_json::json!({ "running": true }));

    match Monitor::all() {
        Ok(monitors) => {
            println!("[Capture] xcap found {} monitor(s)", monitors.len());
            for (i, m) in monitors.iter().enumerate() {
                println!(
                    "[Capture]   Monitor {}: {}x{} is_primary={}",
                    i,
                    m.width(),
                    m.height(),
                    m.is_primary()
                );
            }
        }
        Err(e) => {
            let msg = format!("xcap Monitor::all() failed: {e}");
            println!("[Capture] ERROR: {}", msg);
            CAPTURING.store(false, Ordering::SeqCst);
            emit_frontend(&app, "capture-status", serde_json::json!({ "running": false }));
            return Err(msg);
        }
    }

    let app_clone = app.clone();
    let session_id = config.session_id.clone();
    let stream_to_students = config.stream_to_students;

    tauri::async_runtime::spawn(async move {
        let mut frame_count: u64 = 0;
        let mut consecutive_failures: u32 = 0;
        println!("[Capture] Loop started");

        loop {
            if !CAPTURING.load(Ordering::SeqCst) {
                println!("[Capture] Stop flag set, exiting loop");
                break;
            }

            let ts_start = std::time::Instant::now();
            frame_count += 1;
            println!("[Capture] Attempting frame #{}", frame_count);

            emit_frontend(
                &app_clone,
                "capture-debug",
                CaptureDebugPayload {
                    stage: "attempt".to_string(),
                    frame_count,
                    elapsed_ms: None,
                    w: None,
                    h: None,
                    error: None,
                    ts: chrono::Utc::now().to_rfc3339(),
                },
            );

            let capture_result = tokio::task::spawn_blocking(capture_frame_jpeg_xcap).await;
            let elapsed = ts_start.elapsed().as_millis();

            match capture_result {
                Ok(Ok((frame_b64, w, h))) => {
                    consecutive_failures = 0;
                    println!(
                        "[Capture] Frame #{} OK: {}x{} b64_len={} elapsed={}ms",
                        frame_count,
                        w,
                        h,
                        frame_b64.len(),
                        elapsed
                    );
                    emit_frontend(
                        &app_clone,
                        "capture-debug",
                        CaptureDebugPayload {
                            stage: "captured".to_string(),
                            frame_count,
                            elapsed_ms: Some(elapsed),
                            w: Some(w),
                            h: Some(h),
                            error: None,
                            ts: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                    emit_frontend(
                        &app_clone,
                        "screen-frame",
                        ScreenFramePayload {
                            session_id: session_id.clone(),
                            frame_b64,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            width: w,
                            height: h,
                            stream_to_students,
                        },
                    );
                }
                Ok(Err(e)) => {
                    consecutive_failures += 1;
                    println!(
                        "[Capture] Frame #{} FAILED (consecutive={}): {}",
                        frame_count, consecutive_failures, e
                    );
                    emit_frontend(
                        &app_clone,
                        "capture-debug",
                        CaptureDebugPayload {
                            stage: "failed".to_string(),
                            frame_count,
                            elapsed_ms: Some(elapsed),
                            w: None,
                            h: None,
                            error: Some(e.clone()),
                            ts: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                    emit_frontend(
                        &app_clone,
                        "capture-error",
                        CaptureError {
                            message: e,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                    if consecutive_failures >= 5 {
                        println!("[Capture] 5 consecutive failures — aborting capture loop");
                        CAPTURING.store(false, Ordering::SeqCst);
                        emit_frontend(
                            &app_clone,
                            "capture-status",
                            serde_json::json!({ "running": false }),
                        );
                        break;
                    }
                }
                Err(join_err) => {
                    consecutive_failures += 1;
                    let msg = format!("spawn_blocking panicked: {join_err}");
                    println!("[Capture] Frame #{} JOIN ERROR: {}", frame_count, msg);
                    emit_frontend(
                        &app_clone,
                        "capture-error",
                        CaptureError {
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(interval_ms)).await;
        }

        emit_frontend(
            &app_clone,
            "capture-status",
            serde_json::json!({ "running": false }),
        );
        println!("[Capture] Loop exited cleanly");
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_capture(app: AppHandle) -> Result<(), String> {
    println!("[Capture] Stop requested");
    CAPTURING.store(false, Ordering::SeqCst);
    emit_frontend(&app, "capture-status", serde_json::json!({ "running": false }));
    Ok(())
}

#[tauri::command]
pub async fn capture_test_frame() -> Result<String, String> {
    let result = tokio::task::spawn_blocking(capture_frame_jpeg_xcap)
        .await
        .map_err(|e| format!("spawn_blocking panicked: {e}"))??;
    println!(
        "[Capture] Test frame: {}x{} b64_len={}",
        result.1,
        result.2,
        result.0.len()
    );
    Ok(result.0)
}

fn capture_frame_jpeg_xcap() -> Result<(String, u32, u32), String> {
    let monitors = Monitor::all().map_err(|e| format!("Monitor::all() failed: {e}"))?;
    if monitors.is_empty() {
        return Err("No monitors found by xcap".to_string());
    }
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary())
        .or_else(|| monitors.iter().max_by_key(|m| m.width() * m.height()))
        .ok_or("Could not select a monitor")?;

    let raw = monitor
        .capture_image()
        .map_err(|e| format!("Monitor::capture_image() failed: {e}"))?;
    let img = DynamicImage::ImageRgba8(raw);

    let (orig_w, orig_h) = (img.width(), img.height());
    let img = if orig_w > MAX_FRAME_WIDTH {
        let scale = MAX_FRAME_WIDTH as f32 / orig_w as f32;
        let new_h = (orig_h as f32 * scale) as u32;
        img.resize(MAX_FRAME_WIDTH, new_h, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let (w, h) = (img.width(), img.height());
    let rgb = img.to_rgb8();
    let mut jpeg_bytes: Vec<u8> = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, JPEG_QUALITY);
    encoder
        .encode(&rgb, w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    let b64 = general_purpose::STANDARD.encode(&jpeg_bytes);
    Ok((b64, w, h))
}
