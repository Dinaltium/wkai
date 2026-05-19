use crate::native_capture::types::*;
use crate::native_capture::frame_pipeline::CaptureFrame;

/// Trait defining the interface for platform-specific capture backends.
///
/// All methods are synchronous because capture runs in a dedicated `std::thread`,
/// not on the tokio async runtime.
pub trait CaptureBackend: Send {
    /// One-time initialization (check permissions, warm up APIs).
    fn initialize(&mut self) -> anyhow::Result<()>;

    /// Enumerate available monitors.
    fn list_monitors(&self) -> anyhow::Result<Vec<MonitorInfo>>;

    /// Enumerate available windows.
    fn list_windows(&self) -> anyhow::Result<Vec<WindowInfo>>;

    /// Start a continuous capture loop, sending JPEG-encoded frames through `frame_tx`.
    fn start_capture(
        &mut self,
        target: CaptureTarget,
        config: CaptureConfig,
        frame_tx: flume::Sender<CaptureFrame>,
    ) -> anyhow::Result<()>;

    /// Signal the capture loop to stop and wait for it to finish.
    fn stop_capture(&mut self) -> anyhow::Result<()>;

    /// Return the current capture status.
    fn get_status(&self) -> CaptureStatus;

    /// Return the latest capture metrics.
    fn get_metrics(&self) -> CaptureMetrics;

    /// Clean up all resources held by the backend.
    fn cleanup(&mut self) -> anyhow::Result<()>;

    /// A human-readable name for this backend.
    fn backend_name(&self) -> &'static str;
}
