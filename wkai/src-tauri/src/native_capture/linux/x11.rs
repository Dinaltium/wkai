//! Native capture for X11 sessions, over plain XGetImage via x11rb.
//!
//! Pure Rust, no PipeWire, so it links against nothing newer than the
//! Ubuntu 22.04 base the lab machines run. Wayland sessions cannot be read
//! this way and fall back to the portal backend (see `capture.rs`).
//!
//! Same two-thread shape as the Windows backend: a capture thread that grabs
//! and converts, an encode thread that JPEGs whatever is newest. See the
//! comments there for why the stages are split.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use jpeg_encoder::{ColorType as JpegColorType, Encoder as JpegEncoder};
use x11rb::connection::Connection;
use x11rb::protocol::randr::ConnectionExt as _;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, ImageFormat, MapState, Window};
use x11rb::rust_connection::RustConnection;

use crate::native_capture::frame_pipeline::CaptureFrame;
use crate::native_capture::traits::CaptureBackend;
use crate::native_capture::types::*;

struct SharedState {
    status: CaptureStatus,
    metrics: CaptureMetrics,
}

struct RawFrame {
    rgb: image::RgbImage,
    capture_call_ms: u128,
    timestamp_ms: u64,
}

/// A rectangle on the root window, in root coordinates.
#[derive(Clone, Copy, Debug)]
struct Rect {
    x: i16,
    y: i16,
    w: u16,
    h: u16,
}

pub struct X11CaptureBackend {
    shared: Arc<Mutex<SharedState>>,
    capture_threads: Vec<JoinHandle<()>>,
    stop_flag: Arc<AtomicBool>,
}

/// True when this process can talk to an X server. Wayland sessions running
/// XWayland also answer here, but XGetImage on XWayland's root only shows
/// X11 clients, so the session type is checked first by the caller.
pub fn x11_available() -> bool {
    std::env::var_os("DISPLAY").is_some() && x11rb::connect(None).is_ok()
}

impl X11CaptureBackend {
    pub fn new() -> Self {
        Self {
            shared: Arc::new(Mutex::new(SharedState {
                status: CaptureStatus {
                    status: CaptureStatusType::Idle,
                    error: None,
                    backend: "linux-x11".to_string(),
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

fn connect() -> anyhow::Result<(RustConnection, usize)> {
    Ok(x11rb::connect(None)?)
}

/// RandR monitors in root coordinates, primary first.
fn monitors(conn: &RustConnection, root: Window) -> anyhow::Result<Vec<(String, Rect, bool)>> {
    let reply = conn.randr_get_monitors(root, true)?.reply()?;
    let mut out = Vec::new();
    for m in reply.monitors {
        let name = conn
            .get_atom_name(m.name)?
            .reply()
            .map(|r| String::from_utf8_lossy(&r.name).into_owned())
            .unwrap_or_else(|_| "Monitor".to_string());
        out.push((name, Rect { x: m.x, y: m.y, w: m.width, h: m.height }, m.primary));
    }
    out.sort_by_key(|(_, _, primary)| !primary);
    Ok(out)
}

fn atom(conn: &RustConnection, name: &str) -> anyhow::Result<u32> {
    Ok(conn.intern_atom(false, name.as_bytes())?.reply()?.atom)
}

fn window_title(conn: &RustConnection, win: Window) -> String {
    // _NET_WM_NAME (UTF-8) is what modern toolkits set; WM_NAME is the fallback.
    if let (Ok(net_name), Ok(utf8)) = (atom(conn, "_NET_WM_NAME"), atom(conn, "UTF8_STRING")) {
        if let Some(r) = conn.get_property(false, win, net_name, utf8, 0, 1024).ok().and_then(|c| c.reply().ok()) {
            if !r.value.is_empty() {
                return String::from_utf8_lossy(&r.value).into_owned();
            }
        }
    }
    conn.get_property(false, win, AtomEnum::WM_NAME, AtomEnum::STRING, 0, 1024)
        .ok()
        .and_then(|c| c.reply().ok())
        .filter(|r| !r.value.is_empty())
        .map(|r| String::from_utf8_lossy(&r.value).into_owned())
        .unwrap_or_default()
}

fn window_class(conn: &RustConnection, win: Window) -> String {
    conn.get_property(false, win, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 1024)
        .ok()
        .and_then(|c| c.reply().ok())
        .map(|r| {
            // WM_CLASS is "instance\0class\0"; the class is the app name.
            let parts: Vec<&[u8]> = r.value.split(|b| *b == 0).filter(|p| !p.is_empty()).collect();
            parts
                .get(1)
                .or(parts.first())
                .map(|p| String::from_utf8_lossy(p).into_owned())
                .unwrap_or_default()
        })
        .unwrap_or_default()
}

/// Geometry of a window in root coordinates, or None if it is not viewable.
fn window_rect(conn: &RustConnection, root: Window, win: Window) -> Option<Rect> {
    let attrs = conn.get_window_attributes(win).ok()?.reply().ok()?;
    if attrs.map_state != MapState::VIEWABLE {
        return None;
    }
    let geo = conn.get_geometry(win).ok()?.reply().ok()?;
    let pos = conn.translate_coordinates(win, root, 0, 0).ok()?.reply().ok()?;
    if geo.width == 0 || geo.height == 0 {
        return None;
    }
    Some(Rect { x: pos.dst_x, y: pos.dst_y, w: geo.width, h: geo.height })
}

/// Top-level windows the window manager knows about, via _NET_CLIENT_LIST.
fn client_windows(conn: &RustConnection, root: Window) -> anyhow::Result<Vec<Window>> {
    let list = atom(conn, "_NET_CLIENT_LIST")?;
    let r = conn.get_property(false, root, list, AtomEnum::WINDOW, 0, 4096)?.reply()?;
    Ok(r.value32().map(|v| v.collect()).unwrap_or_default())
}

/// Clamp a rect to the root window so GetImage never asks for off-screen pixels.
fn clamp(rect: Rect, root_w: u16, root_h: u16) -> Rect {
    let x0 = rect.x.max(0);
    let y0 = rect.y.max(0);
    let x1 = (rect.x as i32 + rect.w as i32).min(root_w as i32);
    let y1 = (rect.y as i32 + rect.h as i32).min(root_h as i32);
    Rect {
        x: x0,
        y: y0,
        w: (x1 - x0 as i32).max(0) as u16,
        h: (y1 - y0 as i32).max(0) as u16,
    }
}

/// One frame of the root window over `rect`, as RGB.
fn grab(conn: &RustConnection, root: Window, rect: Rect) -> anyhow::Result<image::RgbImage> {
    let reply = conn
        .get_image(ImageFormat::Z_PIXMAP, root, rect.x, rect.y, rect.w, rect.h, !0)?
        .reply()?;
    let (w, h) = (rect.w as u32, rect.h as u32);
    let data = reply.data;

    // Depth-24 ZPixmap on every mainstream X server is 32 bits per pixel,
    // little-endian: B G R pad. Depth 16 and packed 24 are not worth the
    // code — they have not shipped as a desktop default in fifteen years.
    let bytes_per_px = (data.len() / (w as usize * h as usize).max(1)).max(1);
    if bytes_per_px != 4 {
        anyhow::bail!("unsupported X11 pixel layout: {bytes_per_px} bytes per pixel (depth {})", reply.depth);
    }

    let mut rgb = Vec::with_capacity((w * h * 3) as usize);
    for px in data.chunks_exact(4) {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    image::RgbImage::from_raw(w, h, rgb).ok_or_else(|| anyhow::anyhow!("frame size mismatch"))
}

impl CaptureBackend for X11CaptureBackend {
    fn initialize(&mut self) -> anyhow::Result<()> {
        self.set_status(CaptureStatusType::Initializing, None);
        let (conn, screen_num) = connect()?;
        let root = conn.setup().roots[screen_num].root;
        let n = monitors(&conn, root)?.len();
        self.set_status(CaptureStatusType::Idle, None);
        log::info!("[X11CaptureBackend] initialized, {n} monitor(s)");
        Ok(())
    }

    fn list_monitors(&self) -> anyhow::Result<Vec<MonitorInfo>> {
        let (conn, screen_num) = connect()?;
        let root = conn.setup().roots[screen_num].root;
        Ok(monitors(&conn, root)?
            .into_iter()
            .enumerate()
            .map(|(i, (name, r, primary))| MonitorInfo {
                id: format!("monitor-{i}"),
                name,
                width: r.w as u32,
                height: r.h as u32,
                is_primary: primary,
            })
            .collect())
    }

    fn list_windows(&self) -> anyhow::Result<Vec<WindowInfo>> {
        let (conn, screen_num) = connect()?;
        let root = conn.setup().roots[screen_num].root;
        let mut out = Vec::new();
        for win in client_windows(&conn, root)? {
            let Some(rect) = window_rect(&conn, root, win) else { continue };
            let title = window_title(&conn, win);
            if title.is_empty() {
                continue;
            }
            out.push(WindowInfo {
                id: format!("window-{win}"),
                title,
                app_name: window_class(&conn, win),
                width: rect.w as u32,
                height: rect.h as u32,
            });
        }
        Ok(out)
    }

    fn start_capture(
        &mut self,
        target: CaptureTarget,
        config: CaptureConfig,
        frame_tx: flume::Sender<CaptureFrame>,
    ) -> anyhow::Result<()> {
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

        // ── Capture thread ────────────────────────────────────────────────
        let capture_stop_flag = Arc::clone(&stop_flag);
        let capture_shared = Arc::clone(&shared);
        let capture_latest_raw = Arc::clone(&latest_raw);

        let capture_handle = std::thread::Builder::new()
            .name("capture-loop".into())
            .spawn(move || {
                let fail = |msg: String| {
                    log::error!("[capture-loop] {msg}");
                    if let Ok(mut s) = capture_shared.lock() {
                        s.status.status = CaptureStatusType::Error;
                        s.status.error = Some(msg);
                    }
                };

                let (conn, screen_num) = match connect() {
                    Ok(c) => c,
                    Err(e) => return fail(format!("X11 connection failed: {e}")),
                };
                let screen = &conn.setup().roots[screen_num];
                let root = screen.root;
                let (root_w, root_h) = (screen.width_in_pixels, screen.height_in_pixels);

                // Resolve the target to a rect on the root window. A window is
                // captured as the region of the root it occupies: that is what
                // the audience would see, and it sidesteps GetImage returning
                // stale or black pixels for redirected windows.
                let rect = match target.target_type {
                    CaptureTargetType::Monitor => {
                        let idx: usize = target.id.strip_prefix("monitor-").and_then(|s| s.parse().ok()).unwrap_or(0);
                        match monitors(&conn, root).ok().and_then(|m| m.into_iter().nth(idx)) {
                            Some((_, r, _)) => r,
                            None => return fail(format!("Monitor {idx} not found")),
                        }
                    }
                    CaptureTargetType::Window => {
                        let win: Window = match target.id.strip_prefix("window-").and_then(|s| s.parse().ok()) {
                            Some(w) => w,
                            None => return fail(format!("Bad window id {}", target.id)),
                        };
                        match window_rect(&conn, root, win) {
                            Some(r) => r,
                            None => return fail("Window is not visible".to_string()),
                        }
                    }
                };
                let rect = clamp(rect, root_w, root_h);
                if rect.w == 0 || rect.h == 0 {
                    return fail("Capture region is empty".to_string());
                }
                log::info!("[capture-loop] X11 capturing {:?} at {fps}fps, jpeg_q={jpeg_quality}", rect);

                loop {
                    if capture_stop_flag.load(Ordering::Relaxed) {
                        break;
                    }
                    let frame_start = Instant::now();

                    let capture_call_start = Instant::now();
                    let img = match grab(&conn, root, rect) {
                        Ok(i) => i,
                        Err(e) => {
                            log::warn!("[capture-loop] GetImage failed: {e}");
                            std::thread::sleep(Duration::from_millis(100));
                            continue;
                        }
                    };
                    let capture_call_ms = capture_call_start.elapsed().as_millis();

                    let (src_w, src_h) = (img.width(), img.height());
                    let rgb = if preview_width > 0 && src_w > preview_width {
                        let scale = preview_width as f64 / src_w as f64;
                        let new_h = (src_h as f64 * scale).round() as u32;
                        image::imageops::resize(&img, preview_width, new_h, image::imageops::FilterType::Triangle)
                    } else {
                        img
                    };

                    let timestamp_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
                    if let Ok(mut slot) = capture_latest_raw.lock() {
                        *slot = Some(RawFrame { rgb, capture_call_ms, timestamp_ms });
                    }

                    let elapsed = frame_start.elapsed();
                    if elapsed < frame_interval {
                        std::thread::sleep(frame_interval - elapsed);
                    }
                }
                log::info!("[capture-loop] exited");
            })?;

        // ── Encode thread ─────────────────────────────────────────────────
        let encode_stop_flag = Arc::clone(&stop_flag);
        let encode_shared = Arc::clone(&shared);
        let encode_latest_raw = Arc::clone(&latest_raw);

        let encode_handle = std::thread::Builder::new()
            .name("encode-loop".into())
            .spawn(move || {
                let mut total_frames: u64 = 0;
                let mut dropped_frames: u64 = 0;
                let mut last_timestamp_ms: u64 = 0;

                loop {
                    if encode_stop_flag.load(Ordering::Relaxed) {
                        break;
                    }
                    let raw = {
                        let mut slot = match encode_latest_raw.lock() {
                            Ok(s) => s,
                            Err(_) => continue,
                        };
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
                    let mut jpeg_buf: Vec<u8> = Vec::with_capacity((out_w * out_h / 4) as usize);
                    {
                        let encoder = JpegEncoder::new(&mut jpeg_buf, jpeg_quality);
                        if let Err(e) = encoder.encode(raw.rgb.as_raw(), out_w as u16, out_h as u16, JpegColorType::Rgb) {
                            log::warn!("[encode-loop] JPEG encode failed: {e}");
                            continue;
                        }
                    }

                    let frame_size = jpeg_buf.len() as u64;
                    match frame_tx.try_send(CaptureFrame { jpeg_data: jpeg_buf, width: out_w, height: out_h, timestamp_ms: raw.timestamp_ms }) {
                        Ok(()) => total_frames += 1,
                        Err(flume::TrySendError::Full(_)) => dropped_frames += 1,
                        Err(flume::TrySendError::Disconnected(_)) => break,
                    }

                    if let Ok(mut s) = encode_shared.lock() {
                        s.metrics.total_frames = total_frames;
                        s.metrics.dropped_frames = dropped_frames;
                        s.metrics.capture_time_ms = raw.capture_call_ms as u64;
                        s.metrics.frame_size_bytes = frame_size;
                    }
                }

                if let Ok(mut s) = encode_shared.lock() {
                    if s.status.status == CaptureStatusType::Capturing {
                        s.status.status = CaptureStatusType::Idle;
                    }
                }
                log::info!("[encode-loop] exited – total={total_frames}, dropped={dropped_frames}");
            })?;

        self.capture_threads = vec![capture_handle, encode_handle];
        Ok(())
    }

    fn stop_capture(&mut self) -> anyhow::Result<()> {
        self.set_status(CaptureStatusType::Stopping, None);
        self.stop_flag.store(true, Ordering::SeqCst);
        for handle in self.capture_threads.drain(..) {
            handle.join().map_err(|_| anyhow::anyhow!("Capture thread panicked"))?;
        }
        self.set_status(CaptureStatusType::Idle, None);
        Ok(())
    }

    fn get_status(&self) -> CaptureStatus {
        self.shared.lock().map(|s| s.status.clone()).unwrap_or_default()
    }

    fn get_metrics(&self) -> CaptureMetrics {
        self.shared.lock().map(|s| s.metrics.clone()).unwrap_or_default()
    }

    fn cleanup(&mut self) -> anyhow::Result<()> {
        self.stop_capture()
    }

    fn backend_name(&self) -> &'static str {
        "linux-x11"
    }
}
