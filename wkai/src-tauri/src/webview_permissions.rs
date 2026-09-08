//! Keeps device consent inside the app's own dialog.
//!
//! WebView2 draws its permission prompt as browser chrome — a toast pinned to
//! the top-left of the window, outside the page, unstyleable and unmovable from
//! JS. So an instructor who had already answered our own "WKAI wants to use
//! your microphone" dialog was immediately asked the same question again by a
//! bar that looks nothing like the app and names `http://tauri.localhost`
//! rather than WKAI.
//!
//! The frontend asks first (see `session/mediaPermission.ts`) and only calls
//! `getUserMedia` once the instructor has agreed, so by the time WebView2 raises
//! its request the decision is already made. Answering it here removes the
//! second prompt and leaves our dialog as the single consent surface.
//!
//! Only the kinds our dialog actually covers are auto-answered. Anything else —
//! geolocation, notifications, clipboard — still gets WebView2's default
//! handling, because nothing in the app has asked the instructor about those.

#[cfg(target_os = "windows")]
pub fn suppress_native_media_prompts<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    window.with_webview(|webview| unsafe {
        let core = match webview.controller().CoreWebView2() {
            Ok(core) => core,
            Err(e) => {
                log::error!("No CoreWebView2 to attach permission handler to: {e}");
                return;
            }
        };

        let mut token = Default::default();
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            // windows-rs models this getter as an out-parameter, not a return.
            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
            args.PermissionKind(&mut kind)?;
            if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
            {
                // Already consented to in MediaPermissionDialog.
                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
            }
            Ok(())
        }));

        if let Err(e) = core.add_PermissionRequested(&handler, &mut token) {
            log::error!("Failed to attach WebView2 permission handler: {e}");
        }
    })?;

    Ok(())
}

/// Non-Windows targets get WebView2's behaviour for free: WKWebView and
/// WebKitGTK route their prompts through the app, not a floating bar.
#[cfg(not(target_os = "windows"))]
pub fn suppress_native_media_prompts<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
