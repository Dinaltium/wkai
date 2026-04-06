use base64::{engine::general_purpose, Engine as _};
use image::ImageEncoder;
use image::codecs::png::PngEncoder;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

static CAPTURING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize)]
pub struct CaptureConfig {
    /// How many frames per minute to capture (default: 6 = every 10 seconds)
    pub frames_per_minute: u32,
    /// Whether to also capture audio
    pub capture_audio: bool,
    /// The session ID this capture is tied to
    pub session_id: String,
}

/// Starts the background screen + audio capture loop.
/// Frames are captured, base64 encoded, and sent to the AI pipeline.
#[tauri::command]
pub async fn start_capture(
    app: AppHandle,
    config: CaptureConfig,
) -> Result<(), String> {
    if CAPTURING.load(Ordering::SeqCst) {
        return Err("Capture already running".to_string());
    }

    CAPTURING.store(true, Ordering::SeqCst);
    log::info!(
        "Starting capture for session {} at {} fps/min",
        config.session_id,
        config.frames_per_minute
    );

    let session_id = config.session_id.clone();
    let interval_secs = 60 / config.frames_per_minute.max(1);

    // Spawn the capture loop in a background thread
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async move {
            while CAPTURING.load(Ordering::SeqCst) {
                match capture_screen_frame() {
                    Ok(frame_b64) => {
                        // Emit the frame to the frontend so it can forward to the AI pipeline
                        let _ = app.emit("screen-frame", ScreenFramePayload {
                            session_id: session_id.clone(),
                            frame_b64,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        });
                    }
                    Err(e) => {
                        log::error!("Screen capture failed: {}", e);
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs as u64)).await;
            }

            log::info!("Capture loop exited for session {}", session_id);
        });
    });

    Ok(())
}

/// Stops the screen + audio capture loop.
#[tauri::command]
pub async fn stop_capture() -> Result<(), String> {
    CAPTURING.store(false, Ordering::SeqCst);
    log::info!("Capture stopped");
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScreenFramePayload {
    pub session_id: String,
    pub frame_b64: String,
    pub timestamp: String,
}

/// Captures the primary screen and returns a base64-encoded PNG.
fn capture_screen_frame() -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let primary = screens.into_iter().next().ok_or("No screen found")?;
    let image = primary.capture().map_err(|e| e.to_string())?;

    let mut png_bytes = Vec::new();
    let encoder = PngEncoder::new(&mut png_bytes);
    encoder
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ColorType::Rgba8.into(),
        )
        .map_err(|e| e.to_string())?;

    let encoded = general_purpose::STANDARD.encode(&png_bytes);
    Ok(encoded)
}
