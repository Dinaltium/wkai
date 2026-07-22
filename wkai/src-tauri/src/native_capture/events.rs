use serde::{Deserialize, Serialize};

use crate::native_capture::types::{CaptureMetrics, CaptureStatus};

// ── Event name constants ────────────────────────────────────────────────────

/// Tauri event carrying a JPEG-encoded frame.
pub const CAPTURE_FRAME_EVENT: &str = "native-capture:frame";

/// Tauri event carrying current capture status.
pub const CAPTURE_STATUS_EVENT: &str = "native-capture:status";

/// Tauri event carrying capture metrics.
pub const CAPTURE_METRICS_EVENT: &str = "native-capture:metrics";

/// Tauri event carrying an error message.
pub const CAPTURE_ERROR_EVENT: &str = "native-capture:error";

/// Tauri event fired when available devices change.
pub const CAPTURE_DEVICE_CHANGE_EVENT: &str = "native-capture:device-change";

// ── Payload structs ─────────────────────────────────────────────────────────

/// Payload emitted with each frame event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FramePayload {
    /// Base64-encoded JPEG data.
    pub data: String,
    pub width: u32,
    pub height: u32,
    /// Unix epoch milliseconds when the frame was captured.
    pub timestamp: u64,
}

/// Payload emitted with status events.
pub type StatusPayload = CaptureStatus;

/// Payload emitted with metrics events.
pub type MetricsPayload = CaptureMetrics;

/// Payload emitted with error events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPayload {
    pub message: String,
    pub recoverable: bool,
}
