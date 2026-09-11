use crate::native_capture::frame_pipeline::CaptureFrame;
use crate::native_capture::traits::CaptureBackend;
use crate::native_capture::types::*;

/// Linux has no native capture path in this app: capturing the screen there
/// means PipeWire through the desktop portal, and the crate that wraps it
/// pins a glibc newer than the machines this ships to.
///
/// Instead the webview does the capture itself with getDisplayMedia, which
/// goes through the same portal, works on X11 and Wayland alike, and needs no
/// native dependency. This backend only has to give the target picker one
/// entry to select; the frontend recognises the backend name and takes over.
pub struct LinuxCaptureBackend;

/// The id the frontend matches on to route capture through the browser.
pub const PORTAL_TARGET_ID: &str = "portal";

impl LinuxCaptureBackend {
    pub fn new() -> Self {
        Self
    }
}

impl CaptureBackend for LinuxCaptureBackend {
    fn initialize(&mut self) -> anyhow::Result<()> {
        Ok(())
    }

    fn list_monitors(&self) -> anyhow::Result<Vec<MonitorInfo>> {
        Ok(vec![MonitorInfo {
            id: PORTAL_TARGET_ID.to_string(),
            name: "Screen or window (system picker)".to_string(),
            width: 0,
            height: 0,
            is_primary: true,
        }])
    }

    fn list_windows(&self) -> anyhow::Result<Vec<WindowInfo>> {
        Ok(Vec::new())
    }

    fn start_capture(
        &mut self,
        _target: CaptureTarget,
        _config: CaptureConfig,
        _frame_tx: flume::Sender<CaptureFrame>,
    ) -> anyhow::Result<()> {
        Err(anyhow::anyhow!(
            "Linux capture runs in the webview via getDisplayMedia; start_native_capture is not used here."
        ))
    }

    fn stop_capture(&mut self) -> anyhow::Result<()> {
        Ok(())
    }

    fn get_status(&self) -> CaptureStatus {
        CaptureStatus {
            status: CaptureStatusType::Idle,
            error: None,
            backend: "linux-portal".to_string(),
        }
    }

    fn get_metrics(&self) -> CaptureMetrics {
        CaptureMetrics::default()
    }

    fn cleanup(&mut self) -> anyhow::Result<()> {
        Ok(())
    }

    fn backend_name(&self) -> &'static str {
        "linux-portal"
    }
}
