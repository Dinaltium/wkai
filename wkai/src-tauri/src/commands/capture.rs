use base64::{engine::general_purpose, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::DynamicImage;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use std::time::Instant;

static CAPTURING: AtomicBool = AtomicBool::new(false);

const MAX_FRAME_WIDTH: u32 = 1024;
const AI_FRAME_QUALITY: u8 = 75;

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
pub struct CaptureError {
    pub message: String,
    pub timestamp: String,
}

#[tauri::command]
pub async fn start_capture(app: AppHandle, config: CaptureConfig) -> Result<(), String> {
    if CAPTURING.swap(true, Ordering::SeqCst) {
        return Err("Capture already running".to_string());
    }

    log::info!(
        "[Capture] Starting for session={} fps_per_min={} stream={}",
        config.session_id,
        config.frames_per_minute,
        config.stream_to_students
    );

    let session_id = config.session_id.clone();
    let interval_secs = (60u64 / config.frames_per_minute.max(1) as u64).max(5);
    tauri::async_runtime::spawn(async move {
        let _ = app.emit("capture-status", serde_json::json!({ "running": true }));
        let mut frame_count: u64 = 0;

        loop {
            if !CAPTURING.load(Ordering::SeqCst) {
                break;
            }

            let attempt_started = Instant::now();
            let _ = app.emit(
                "capture-debug",
                serde_json::json!({ "stage": "attempt", "frameCount": frame_count, "ts": chrono::Utc::now().to_rfc3339() }),
            );

            let result = tokio::time::timeout(
                tokio::time::Duration::from_secs(10),
                tokio::task::spawn_blocking(|| capture_frame_jpeg()),
            )
            .await;

            match result {
                Err(_) => {
                    let msg = "Screen capture timed out after 10s".to_string();
                    log::error!("[Capture] {}", msg);
                    let _ = app.emit(
                        "capture-error",
                        CaptureError {
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                }
                Ok(Err(join_err)) => {
                    let msg = format!("Capture task join failed: {join_err}");
                    log::error!("[Capture] {}", msg);
                    let _ = app.emit(
                        "capture-error",
                        CaptureError {
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                }
                Ok(Ok(Ok((frame_b64, w, h)))) => {
                    frame_count += 1;
                    log::debug!(
                        "[Capture] Frame #{} captured ({}x{} -> base64 len={})",
                        frame_count,
                        w,
                        h,
                        frame_b64.len()
                    );
                    let elapsed_ms = attempt_started.elapsed().as_millis();
                    let _ = app.emit(
                        "capture-debug",
                        serde_json::json!({ "stage": "captured", "frameCount": frame_count, "elapsedMs": elapsed_ms, "w": w, "h": h }),
                    );

                    let _ = app.emit(
                        "screen-frame",
                        ScreenFramePayload {
                            session_id: session_id.clone(),
                            frame_b64,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            width: w,
                            height: h,
                            stream_to_students: config.stream_to_students,
                        },
                    );
                }
                Ok(Ok(Err(e))) => {
                    log::error!("[Capture] Frame capture failed: {}", e);
                    let elapsed_ms = attempt_started.elapsed().as_millis();
                    let _ = app.emit(
                        "capture-debug",
                        serde_json::json!({ "stage": "failed", "frameCount": frame_count, "elapsedMs": elapsed_ms, "error": e }),
                    );
                    let _ = app.emit(
                        "capture-error",
                        CaptureError {
                            message: e,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;
        }

        let _ = app.emit("capture-status", serde_json::json!({ "running": false }));
        log::info!("[Capture] Loop exited for session={}", session_id);
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_capture(app: AppHandle) -> Result<(), String> {
    CAPTURING.store(false, Ordering::SeqCst);
    let _ = app.emit("capture-status", serde_json::json!({ "running": false }));
    log::info!("[Capture] Stop requested");
    Ok(())
}

#[tauri::command]
pub async fn capture_test_frame() -> Result<String, String> {
    let (frame_b64, w, h) = capture_frame_jpeg()?;
    log::info!(
        "[Capture] Test frame captured: {}x{} base64_len={}",
        w,
        h,
        frame_b64.len()
    );
    Ok(frame_b64)
}

fn capture_frame_jpeg() -> Result<(String, u32, u32), String> {
    let screens = Screen::all().map_err(|e| format!("Screen::all() failed: {e}"))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let screen = screens
        .into_iter()
        .max_by_key(|s| {
            let info = s.display_info;
            info.width * info.height
        })
        .ok_or("Could not select a screen")?;

    let raw_image = screen
        .capture()
        .map_err(|e| format!("Screen::capture() failed: {e}"))?;

    let img = DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(raw_image.width(), raw_image.height(), raw_image.into_raw())
            .ok_or("Failed to create RgbaImage from raw bytes")?,
    );

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
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, AI_FRAME_QUALITY);
    encoder
        .encode(&rgb, w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    let b64 = general_purpose::STANDARD.encode(&jpeg_bytes);
    Ok((b64, w, h))
}
