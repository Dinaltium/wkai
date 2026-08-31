use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::native_capture::events::*;
use crate::native_capture::types::*;

/// A frame produced by the capture backend and sent through the flume channel.
#[derive(Debug, Clone)]
pub struct CaptureFrame {
    /// JPEG-encoded image data.
    pub jpeg_data: Vec<u8>,
    /// Width of the captured image (after resize).
    pub width: u32,
    /// Height of the captured image (after resize).
    pub height: u32,
    /// Unix epoch milliseconds when the frame was captured.
    pub timestamp_ms: u64,
}

/// The frame pipeline runs in its own thread.  It receives `CaptureFrame`s from
/// the capture backend, base64-encodes them, and emits Tauri events.
pub struct FramePipeline;

impl FramePipeline {
    /// Spawn the pipeline thread.  Returns its `JoinHandle`.
    ///
    /// * `app_handle`   – used to emit status/metrics events to the frontend.
    /// * `frame_rx`     – receiving end of the capture-backend channel.
    /// * `_config`      – capture config (reserved for future use in the pipeline).
    /// * `stop_flag`    – shared flag; when set to `true` the pipeline drains and exits.
    /// * `latest_frame` – overwritten with each frame instead of pushed as an
    ///   event. Frame delivery to the frontend is pull-based (`get_latest_frame`
    ///   command): a push-per-frame event has no backpressure once it enters the
    ///   webview's IPC queue, so a frontend that falls behind for even a moment
    ///   ends up replaying a growing backlog of stale frames instead of catching
    ///   up to the current one.
    pub fn start(
        app_handle: tauri::AppHandle,
        frame_rx: flume::Receiver<CaptureFrame>,
        _config: CaptureConfig,
        stop_flag: Arc<AtomicBool>,
        latest_frame: Arc<Mutex<Option<CaptureFrame>>>,
    ) -> JoinHandle<()> {
        std::thread::Builder::new()
            .name("capture-pipeline".into())
            .spawn(move || {
                log::info!("[FramePipeline] started");

                let mut total_frames: u64 = 0;
                let mut dropped_frames: u64 = 0;
                let mut last_metrics_emit = Instant::now();
                let mut fps_counter: u64 = 0;
                let mut fps_window_start = Instant::now();
                let mut current_fps: f64 = 0.0;
                let mut last_frame_size: u64 = 0;

                loop {
                    if stop_flag.load(Ordering::Relaxed) {
                        log::info!("[FramePipeline] stop flag set, exiting");
                        break;
                    }

                    // Non-blocking receive with a short timeout so we can
                    // re-check the stop flag regularly.
                    let frame = match frame_rx.recv_timeout(Duration::from_millis(50)) {
                        Ok(f) => f,
                        Err(flume::RecvTimeoutError::Timeout) => continue,
                        Err(flume::RecvTimeoutError::Disconnected) => {
                            log::info!("[FramePipeline] channel disconnected, exiting");
                            break;
                        }
                    };

                    total_frames += 1;
                    fps_counter += 1;
                    last_frame_size = frame.jpeg_data.len() as u64;

                    // Overwrite the latest frame — base64 encoding happens lazily
                    // in the `get_latest_frame` command, only for frames the
                    // frontend actually pulls, instead of on every captured frame.
                    if let Ok(mut slot) = latest_frame.lock() {
                        *slot = Some(frame);
                    }

                    // Update FPS rolling window (~1 second).
                    let elapsed = fps_window_start.elapsed();
                    if elapsed >= Duration::from_secs(1) {
                        current_fps =
                            fps_counter as f64 / elapsed.as_secs_f64();
                        fps_counter = 0;
                        fps_window_start = Instant::now();
                    }

                    // Emit metrics roughly every second.
                    if last_metrics_emit.elapsed() >= Duration::from_secs(1) {
                        let metrics = CaptureMetrics {
                            fps: current_fps,
                            dropped_frames,
                            total_frames,
                            capture_time_ms: 0, // filled by backend
                            frame_size_bytes: last_frame_size,
                        };
                        let _ = app_handle.emit(CAPTURE_METRICS_EVENT, &metrics);
                        last_metrics_emit = Instant::now();
                    }
                }

                log::info!(
                    "[FramePipeline] exited – total_frames={total_frames}, dropped={dropped_frames}"
                );
            })
            .expect("failed to spawn capture-pipeline thread")
    }
}
