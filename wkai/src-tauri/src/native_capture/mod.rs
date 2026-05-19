pub mod types;
pub mod traits;
pub mod events;
pub mod frame_pipeline;
pub mod manager;

#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod mac;

pub use manager::CaptureManager;
pub use types::*;
