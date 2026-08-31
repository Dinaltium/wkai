use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use image::codecs::jpeg::JpegEncoder;
use image::ImageEncoder;

use crate::native_capture::frame_pipeline::CaptureFrame;
use crate::native_capture::traits::CaptureBackend;
use crate::native_capture::types::*;
use super::devices;
use super::permissions;

/// Shared mutable state accessible from both the main thread and the capture thread.
struct SharedState {
    status: CaptureStatus,
    metrics: CaptureMetrics,
}

/// A raw (unencoded) captured frame, handed from the capture thread to the
/// encode thread. Kept as `Arc<Mutex<Option<_>>>` "latest wins" state, same
/// pattern as the frame-pull IPC command — never a queue, so a slow encode
/// can't build a backlog of stale raw frames either; it just always grabs
/// whatever is currently newest.
struct RawFrame {
    rgb: image::RgbImage,
    capture_call_ms: u128,
    timestamp_ms: u64,
}

/// Windows implementation of the `CaptureBackend` trait using xcap.
pub struct WindowsCaptureBackend {
    shared: Arc<Mutex<SharedState>>,
    // Capture and encode run on separate threads (see start_capture) so
    // encoding frame N overlaps with capturing frame N+1 instead of paying
    // capture_ms + encode_ms serially for every single frame — measured
    // ~35-50ms capture + ~50-90ms encode serially was capping this at
    // ~8-10fps even after the encoder itself got fast.
    capture_threads: Vec<JoinHandle<()>>,
    stop_flag: Arc<AtomicBool>,
}

impl WindowsCaptureBackend {
    pub fn new() -> Self {
        Self {
            shared: Arc::new(Mutex::new(SharedState {
                status: CaptureStatus {
                    status: CaptureStatusType::Idle,
                    error: None,
                    backend: "windows-xcap".to_string(),
                },
                metrics: CaptureMetrics::default(),
            })),
            capture_threads: Vec::new(),
            stop_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    fn set_status(&self, status_type: CaptureStatusType, error: Option<String>) {
        if let Ok(mut s) = self.shared.lock() {
            s.status.status = status_type;
            s.status.error = error;
        }
    }
}

impl CaptureBackend for WindowsCaptureBackend {
    fn initialize(&mut self) -> anyhow::Result<()> {
        self.set_status(CaptureStatusType::Initializing, None);
        permissions::check_capture_permissions()?;
        self.set_status(CaptureStatusType::Idle, None);
        log::info!("[WindowsCaptureBackend] initialized successfully");
        Ok(())
    }

    fn list_monitors(&self) -> anyhow::Result<Vec<MonitorInfo>> {
        devices::list_monitors()
    }

    fn list_windows(&self) -> anyhow::Result<Vec<WindowInfo>> {
        devices::list_windows()
    }

    fn start_capture(
        &mut self,
        target: CaptureTarget,
        config: CaptureConfig,
        frame_tx: flume::Sender<CaptureFrame>,
    ) -> anyhow::Result<()> {
        // Prevent double-start.
        if let Ok(s) = self.shared.lock() {
            if s.status.status == CaptureStatusType::Capturing {
                return Err(anyhow::anyhow!("Capture is already running"));
            }
        }

        self.stop_flag.store(false, Ordering::SeqCst);
        self.set_status(CaptureStatusType::Capturing, None);

        let stop_flag = Arc::clone(&self.stop_flag);
        let shared = Arc::clone(&self.shared);
        let fps = config.fps.max(1);
        let frame_interval = Duration::from_micros(1_000_000 / fps as u64);
        let jpeg_quality = config.quality.jpeg_quality();
        let preview_width = config.preview_width;

        let latest_raw: Arc<Mutex<Option<RawFrame>>> = Arc::new(Mutex::new(None));

        // ── Capture thread: grab + resize + convert only ───────────────────
        let capture_stop_flag = Arc::clone(&stop_flag);
        let capture_shared = Arc::clone(&shared);
        let capture_latest_raw = Arc::clone(&latest_raw);
        let capture_target = target.clone();

        let capture_handle = std::thread::Builder::new()
            .name("capture-loop".into())
            .spawn(move || {
                log::info!(
                    "[capture-loop] starting – target={:?}, fps={fps}, jpeg_q={jpeg_quality}, preview_w={preview_width}",
                    capture_target.target_type
                );

                // ── Resolve the capture source ──────────────────────────
                let monitor = match capture_target.target_type {
                    CaptureTargetType::Monitor => {
                        let monitors = match xcap::Monitor::all() {
                            Ok(m) => m,
                            Err(e) => {
                                log::error!("[capture-loop] failed to list monitors: {e}");
                                if let Ok(mut s) = capture_shared.lock() {
                                    s.status.status = CaptureStatusType::Error;
                                    s.status.error = Some(format!("Monitor enumeration failed: {e}"));
                                }
                                return;
                            }
                        };

                        // Match by index-based id  ("monitor-0", "monitor-1", …)
                        let idx: usize = capture_target
                            .id
                            .strip_prefix("monitor-")
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0);

                        match monitors.into_iter().nth(idx) {
                            Some(m) => m,
                            None => {
                                log::error!("[capture-loop] monitor index {idx} not found");
                                if let Ok(mut s) = capture_shared.lock() {
                                    s.status.status = CaptureStatusType::Error;
                                    s.status.error = Some(format!("Monitor {idx} not found"));
                                }
                                return;
                            }
                        }
                    }
                    CaptureTargetType::Window => {
                        // For window capture we fall back to the primary monitor for now.
                        // Full per-window capture can be added later.
                        log::warn!("[capture-loop] Window capture requested – falling back to primary monitor");
                        let monitors = match xcap::Monitor::all() {
                            Ok(m) => m,
                            Err(e) => {
                                log::error!("[capture-loop] failed to list monitors: {e}");
                                if let Ok(mut s) = capture_shared.lock() {
                                    s.status.status = CaptureStatusType::Error;
                                    s.status.error = Some(format!("Monitor enumeration failed: {e}"));
                                }
                                return;
                            }
                        };
                        monitors
                            .into_iter()
                            .find(|m| m.is_primary().unwrap_or(false))
                            .or_else(|| xcap::Monitor::all().ok().and_then(|m| m.into_iter().next()))
                            .unwrap_or_else(|| {
                                log::error!("[capture-loop] no monitors available");
                                panic!("No monitors available for fallback window capture");
                            })
                    }
                };

                log::info!(
                    "[capture-loop] capturing from monitor: {}",
                    monitor.name().unwrap_or_else(|_| "unknown".to_string())
                );

                loop {
                    if capture_stop_flag.load(Ordering::Relaxed) {
                        log::info!("[capture-loop] stop flag set, breaking");
                        break;
                    }

                    let frame_start = Instant::now();

                    // Capture the screen.
                    let capture_call_start = Instant::now();
                    let img = match monitor.capture_image() {
                        Ok(i) => i,
                        Err(e) => {
                            log::warn!("[capture-loop] capture_image failed: {e}");
                            // Brief sleep to avoid busy-looping on persistent errors.
                            std::thread::sleep(Duration::from_millis(100));
                            continue;
                        }
                    };
                    let capture_call_ms = capture_call_start.elapsed().as_millis();

                    // Resize if needed. preview_width == 0 means "native, do not
                    // resize" — and native is the fast path: downscaling a
                    // 1920x1200 RGBA frame costs ~64ms, roughly three times the
                    // JPEG encode itself, so shrinking the frame lowers quality
                    // *and* framerate.
                    let (src_w, src_h) = (img.width(), img.height());
                    let resized = if preview_width > 0 && src_w > preview_width {
                        let scale = preview_width as f64 / src_w as f64;
                        let new_h = (src_h as f64 * scale).round() as u32;
                        image::imageops::resize(
                            &img,
                            preview_width,
                            new_h,
                            image::imageops::FilterType::Triangle,
                        )
                    } else {
                        img
                    };

                    // Drop the alpha channel: xcap hands back RGBA, and JPEG has
                    // no alpha, so encoding Rgba8 fails on every single frame
                    // ("does not support the color type `Rgba8`"). Screens are
                    // opaque, so there is nothing to preserve.
                    let rgb = image::DynamicImage::ImageRgba8(resized).into_rgb8();

                    let timestamp_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    if let Ok(mut slot) = capture_latest_raw.lock() {
                        *slot = Some(RawFrame {
                            rgb,
                            capture_call_ms,
                            timestamp_ms,
                        });
                    }

                    // Sleep for the remainder of the frame interval.
                    let elapsed = frame_start.elapsed();
                    if elapsed < frame_interval {
                        std::thread::sleep(frame_interval - elapsed);
                    }
                }

                log::info!("[capture-loop] exited");
            })?;

        // ── Encode thread: JPEG-encode whatever is currently newest ────────
        let encode_stop_flag = Arc::clone(&stop_flag);
        let encode_shared = Arc::clone(&shared);
        let encode_latest_raw = Arc::clone(&latest_raw);

        let encode_handle = std::thread::Builder::new()
            .name("encode-loop".into())
            .spawn(move || {
                log::info!("[encode-loop] starting");

                let mut total_frames: u64 = 0;
                let mut dropped_frames: u64 = 0;
                let mut last_timestamp_ms: u64 = 0;

                loop {
                    if encode_stop_flag.load(Ordering::Relaxed) {
                        log::info!("[encode-loop] stop flag set, breaking");
                        break;
                    }

                    let raw = {
                        let mut slot = match encode_latest_raw.lock() {
                            Ok(s) => s,
                            Err(_) => continue,
                        };
                        // Only take it if it's actually new — otherwise we'd
                        // busy-loop re-encoding the same frame while capture
                        // is still working on the next one.
                        match slot.as_ref() {
                            Some(f) if f.timestamp_ms != last_timestamp_ms => slot.take(),
                            _ => None,
                        }
                    };

                    let Some(raw) = raw else {
                        std::thread::sleep(Duration::from_millis(2));
                        continue;
                    };
                    last_timestamp_ms = raw.timestamp_ms;

                    let (out_w, out_h) = (raw.rgb.width(), raw.rgb.height());

                    // JPEG-encode.
                    let encode_start = Instant::now();
                    let mut jpeg_buf: Vec<u8> = Vec::with_capacity((out_w * out_h * 3 / 4) as usize);
                    {
                        let mut cursor = Cursor::new(&mut jpeg_buf);
                        let encoder = JpegEncoder::new_with_quality(&mut cursor, jpeg_quality);
                        if let Err(e) = encoder.write_image(
                            raw.rgb.as_raw(),
                            out_w,
                            out_h,
                            image::ExtendedColorType::Rgb8,
                        ) {
                            log::warn!("[encode-loop] JPEG encode failed: {e}");
                            continue;
                        }
                    }
                    let encode_ms = encode_start.elapsed().as_millis();

                    let capture_frame = CaptureFrame {
                        jpeg_data: jpeg_buf,
                        width: out_w,
                        height: out_h,
                        timestamp_ms: raw.timestamp_ms,
                    };

                    let frame_size = capture_frame.jpeg_data.len() as u64;

                    // Send frame.  Use `try_send` — if the channel is full we drop.
                    match frame_tx.try_send(capture_frame) {
                        Ok(()) => {
                            total_frames += 1;
                        }
                        Err(flume::TrySendError::Full(_)) => {
                            dropped_frames += 1;
                        }
                        Err(flume::TrySendError::Disconnected(_)) => {
                            log::info!("[encode-loop] channel disconnected, exiting");
                            break;
                        }
                    }

                    // Update shared metrics.
                    if let Ok(mut s) = encode_shared.lock() {
                        s.metrics.total_frames = total_frames;
                        s.metrics.dropped_frames = dropped_frames;
                        s.metrics.capture_time_ms = raw.capture_call_ms as u64;
                        s.metrics.frame_size_bytes = frame_size;
                    }

                    // TEMP DIAGNOSTIC — pin down where the per-frame time actually
                    // goes (capture call vs JPEG encode) before guessing again.
                    // Remove once the bottleneck is confirmed fixed.
                    log::info!(
                        "[capture-timing] capture={}ms encode={encode_ms}ms size={frame_size}B dim={out_w}x{out_h} q={jpeg_quality}",
                        raw.capture_call_ms
                    );
                }

                // Mark status as idle when the loop ends normally.
                if let Ok(mut s) = encode_shared.lock() {
                    if s.status.status == CaptureStatusType::Capturing {
                        s.status.status = CaptureStatusType::Idle;
                    }
                }

                log::info!(
                    "[encode-loop] exited – total={total_frames}, dropped={dropped_frames}"
                );
            })?;

        self.capture_threads = vec![capture_handle, encode_handle];
        Ok(())
    }

    fn stop_capture(&mut self) -> anyhow::Result<()> {
        self.set_status(CaptureStatusType::Stopping, None);
        self.stop_flag.store(true, Ordering::SeqCst);

        for handle in self.capture_threads.drain(..) {
            handle
                .join()
                .map_err(|_| anyhow::anyhow!("Capture thread panicked"))?;
        }

        self.set_status(CaptureStatusType::Idle, None);
        log::info!("[WindowsCaptureBackend] capture stopped");
        Ok(())
    }

    fn get_status(&self) -> CaptureStatus {
        self.shared
            .lock()
            .map(|s| s.status.clone())
            .unwrap_or_default()
    }

    fn get_metrics(&self) -> CaptureMetrics {
        self.shared
            .lock()
            .map(|s| s.metrics.clone())
            .unwrap_or_default()
    }

    fn cleanup(&mut self) -> anyhow::Result<()> {
        self.stop_capture()?;
        log::info!("[WindowsCaptureBackend] cleaned up");
        Ok(())
    }

    fn backend_name(&self) -> &'static str {
        "windows-xcap"
    }
}
