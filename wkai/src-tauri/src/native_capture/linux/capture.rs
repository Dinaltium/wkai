use crate::native_capture::frame_pipeline::CaptureFrame;
use crate::native_capture::traits::CaptureBackend;
use crate::native_capture::types::*;

/// Stub Linux capture backend – not yet implemented.
pub struct LinuxCaptureBackend;

impl LinuxCaptureBackend {
    pub fn new() -> Self {
        Self
    }
}

impl CaptureBackend for LinuxCaptureBackend {
    fn initialize(&mut self) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("Linux native capture not yet implemented"))
    }

    fn list_monitors(&self) -> anyhow::Result<Vec<MonitorInfo>> {
        Err(anyhow::anyhow!("Linux native capture not yet implemented"))
    }

    fn list_windows(&self) -> anyhow::Result<Vec<WindowInfo>> {
        Err(anyhow::anyhow!("Linux native capture not yet implemented"))
    }

    fn start_capture(
        &mut self,
        _target: CaptureTarget,
        _config: CaptureConfig,
        _frame_tx: flume::Sender<CaptureFrame>,
    ) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("Linux native capture not yet implemented"))
    }

    fn stop_capture(&mut self) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("Linux native capture not yet implemented"))
    }

    fn get_status(&self) -> CaptureStatus {
        CaptureStatus {
            status: CaptureStatusType::Idle,
            error: None,
            backend: "linux-stub".to_string(),
        }
    }

    fn get_metrics(&self) -> CaptureMetrics {
        CaptureMetrics::default()
    }

    fn cleanup(&mut self) -> anyhow::Result<()> {
        Ok(())
    }

    fn backend_name(&self) -> &'static str {
        "linux-stub"
    }
}
