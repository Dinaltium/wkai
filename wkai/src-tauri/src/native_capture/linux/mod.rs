pub mod capture;
pub mod x11;

use crate::native_capture::traits::CaptureBackend;

pub use capture::LinuxCaptureBackend;

/// Picks the Linux backend for this session.
///
/// X11 sessions get native XGetImage capture: no portal dialog, window and
/// monitor pickers work like on Windows, and nothing newer than the 22.04
/// base is linked. Anything else (Wayland, or no X server at all) gets the
/// portal backend, where the webview captures via getDisplayMedia.
///
/// XDG_SESSION_TYPE is checked before probing X, because a Wayland session
/// still exposes an XWayland DISPLAY whose root only shows X11 clients.
pub fn new_backend() -> Box<dyn CaptureBackend> {
    let session = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
    let wayland = session.eq_ignore_ascii_case("wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some();
    if !wayland && x11::x11_available() {
        log::info!("[CaptureManager] Linux session is X11 - using native capture");
        Box::new(x11::X11CaptureBackend::new())
    } else {
        log::info!("[CaptureManager] Linux session is {session:?} - using portal capture");
        Box::new(LinuxCaptureBackend::new())
    }
}
