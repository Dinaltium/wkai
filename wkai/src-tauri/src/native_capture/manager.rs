use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

use crate::native_capture::frame_pipeline::{CaptureFrame, FramePipeline};
use crate::native_capture::traits::CaptureBackend;
use crate::native_capture::types::*;

/// Central manager that owns the capture backend, frame pipeline, and lifecycle.
///
/// Stored as Tauri managed state: `Arc<Mutex<CaptureManager>>`.
pub struct CaptureManager {
    app_handle: tauri::AppHandle,
    backend: Option<Box<dyn CaptureBackend>>,
    pipeline_handle: Option<JoinHandle<()>>,
    stop_flag: Arc<AtomicBool>,
    config: CaptureConfig,
    initialized: bool,
}

impl CaptureManager {
    /// Create a new, un-initialized manager.
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            backend: None,
            pipeline_handle: None,
            stop_flag: Arc::new(AtomicBool::new(false)),
            config: CaptureConfig::default(),
            initialized: false,
        }
    }

    /// Detect the current platform and instantiate the appropriate backend.
    fn detect_platform(&self) -> Box<dyn CaptureBackend> {
        #[cfg(target_os = "windows")]
        {
            log::info!("[CaptureManager] detected platform: Windows");
            Box::new(crate::native_capture::windows::WindowsCaptureBackend::new())
        }
        #[cfg(target_os = "linux")]
        {
            log::info!("[CaptureManager] detected platform: Linux");
            Box::new(crate::native_capture::linux::LinuxCaptureBackend::new())
        }
        #[cfg(target_os = "macos")]
        {
            log::info!("[CaptureManager] detected platform: macOS");
            Box::new(crate::native_capture::mac::MacCaptureBackend::new())
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
        {
            compile_error!("Unsupported target OS for native capture");
        }
    }

    /// Initialize the manager: detect platform, create + initialize backend.
    pub fn initialize(&mut self) -> anyhow::Result<()> {
        if self.initialized {
            log::info!("[CaptureManager] already initialized");
            return Ok(());
        }

        let mut backend = self.detect_platform();
        backend.initialize()?;
        self.backend = Some(backend);
        self.initialized = true;
        log::info!("[CaptureManager] initialization complete");
        Ok(())
    }

    /// Ensure the manager is initialized (lazy init).
    fn ensure_initialized(&mut self) -> anyhow::Result<()> {
        if !self.initialized {
            self.initialize()?;
        }
        Ok(())
    }

    /// Get the name of the active backend.
    pub fn backend_name(&mut self) -> anyhow::Result<String> {
        self.ensure_initialized()?;
        Ok(self
            .backend
            .as_ref()
            .map(|b| b.backend_name().to_string())
            .unwrap_or_else(|| "none".to_string()))
    }

    /// List available monitors.
    pub fn list_monitors(&mut self) -> anyhow::Result<Vec<MonitorInfo>> {
        self.ensure_initialized()?;
        self.backend
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No backend available"))?
            .list_monitors()
    }

    /// List available windows.
    pub fn list_windows(&mut self) -> anyhow::Result<Vec<WindowInfo>> {
        self.ensure_initialized()?;
        self.backend
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No backend available"))?
            .list_windows()
    }

    /// Start capturing from the given target with the given config.
    pub fn start_capture(
        &mut self,
        target: CaptureTarget,
        config: CaptureConfig,
    ) -> anyhow::Result<()> {
        self.ensure_initialized()?;

        // Create a bounded channel so back-pressure works.
        let (frame_tx, frame_rx) = flume::bounded::<CaptureFrame>(4);

        self.stop_flag = Arc::new(AtomicBool::new(false));
        self.config = config.clone();

        // Start the capture backend (spawns its own thread internally).
        self.backend
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("No backend available"))?
            .start_capture(target, config.clone(), frame_tx)?;

        // Start the frame pipeline thread.
        let pipeline = FramePipeline::start(
            self.app_handle.clone(),
            frame_rx,
            config,
            Arc::clone(&self.stop_flag),
        );
        self.pipeline_handle = Some(pipeline);

        log::info!("[CaptureManager] capture started");
        Ok(())
    }

    /// Stop the active capture session.
    pub fn stop_capture(&mut self) -> anyhow::Result<()> {
        // Signal both the pipeline and backend to stop.
        self.stop_flag.store(true, Ordering::SeqCst);

        if let Some(backend) = self.backend.as_mut() {
            backend.stop_capture()?;
        }

        if let Some(handle) = self.pipeline_handle.take() {
            let _ = handle.join();
        }

        log::info!("[CaptureManager] capture stopped");
        Ok(())
    }

    /// Get current capture status.
    pub fn get_status(&mut self) -> anyhow::Result<CaptureStatus> {
        self.ensure_initialized()?;
        Ok(self
            .backend
            .as_ref()
            .map(|b| b.get_status())
            .unwrap_or_default())
    }

    /// Get current capture metrics.
    pub fn get_metrics(&mut self) -> anyhow::Result<CaptureMetrics> {
        self.ensure_initialized()?;
        Ok(self
            .backend
            .as_ref()
            .map(|b| b.get_metrics())
            .unwrap_or_default())
    }

    /// Clean up all resources.
    pub fn cleanup(&mut self) -> anyhow::Result<()> {
        self.stop_capture()?;
        if let Some(backend) = self.backend.as_mut() {
            backend.cleanup()?;
        }
        log::info!("[CaptureManager] cleaned up");
        Ok(())
    }
}
