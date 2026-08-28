use serde::{Deserialize, Serialize};

/// Information about a display monitor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// Information about a capturable window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub id: String,
    pub title: String,
    pub app_name: String,
    pub width: u32,
    pub height: u32,
}

/// The type of capture target.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureTargetType {
    Monitor,
    Window,
}

/// A capture target specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureTarget {
    #[serde(rename = "type")]
    pub target_type: CaptureTargetType,
    pub id: String,
}

/// Quality preset for JPEG encoding.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CaptureQuality {
    Low,
    Medium,
    High,
    Auto,
}

impl CaptureQuality {
    /// Returns the JPEG quality parameter (1-100) for this preset.
    pub fn jpeg_quality(&self) -> u8 {
        match self {
            CaptureQuality::Low => 60,
            CaptureQuality::Medium => 80,
            CaptureQuality::High => 92,
            CaptureQuality::Auto => 85,
        }
    }
}

/// Configuration for a capture session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureConfig {
    pub fps: u32,
    pub quality: CaptureQuality,
    pub preview_width: u32,
}

impl Default for CaptureConfig {
    fn default() -> Self {
        Self {
            fps: 30,
            quality: CaptureQuality::Medium,
            preview_width: 1280,
        }
    }
}

/// The current status type of the capture system.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CaptureStatusType {
    Idle,
    Initializing,
    Capturing,
    Stopping,
    Error,
}

/// Current capture status with optional error message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureStatus {
    pub status: CaptureStatusType,
    pub error: Option<String>,
    pub backend: String,
}

impl Default for CaptureStatus {
    fn default() -> Self {
        Self {
            status: CaptureStatusType::Idle,
            error: None,
            backend: String::from("unknown"),
        }
    }
}

/// Runtime metrics for the capture pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureMetrics {
    pub fps: f64,
    pub dropped_frames: u64,
    pub total_frames: u64,
    pub capture_time_ms: u64,
    pub frame_size_bytes: u64,
}

impl Default for CaptureMetrics {
    fn default() -> Self {
        Self {
            fps: 0.0,
            dropped_frames: 0,
            total_frames: 0,
            capture_time_ms: 0,
            frame_size_bytes: 0,
        }
    }
}

/// Available capture devices on the system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureDevices {
    pub monitors: Vec<MonitorInfo>,
    pub windows: Vec<WindowInfo>,
}

/// Platform backend identifier.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PlatformBackend {
    Windows,
    Linux,
    MacOs,
    Unknown,
}

impl PlatformBackend {
    /// Returns a human-readable display name for the backend.
    pub fn display_name(&self) -> &'static str {
        match self {
            PlatformBackend::Windows => "Windows Native (xcap)",
            PlatformBackend::Linux => "Linux Native (xcap)",
            PlatformBackend::MacOs => "macOS Native (xcap)",
            PlatformBackend::Unknown => "Unknown Platform",
        }
    }
}
