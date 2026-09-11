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

/// WebKitGTK ships with media streams switched off and, absent a handler,
/// denies every permission request. Both must be flipped or getDisplayMedia
/// and getUserMedia fail silently — and on Linux the screen share *is*
/// getDisplayMedia, since there is no native capture backend there.
///
/// Every user-media request is granted: the page is our own bundled UI, and
/// the instructor is the one who clicked "share".
#[cfg(target_os = "linux")]
pub fn suppress_native_media_prompts<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    window.with_webview(|platform| {
        use webkit2gtk::glib::object::ObjectExt;
        use webkit2gtk::{
            DeviceInfoPermissionRequest, PermissionRequestExt, SettingsExt,
            UserMediaPermissionRequest, WebViewExt,
        };

        let webview = platform.inner();
        if let Some(settings) = webview.settings() {
            settings.set_enable_media_stream(true);
            settings.set_enable_mediasource(true);
        }
        webview.connect_permission_request(|_, request| {
            let grant = request.is::<UserMediaPermissionRequest>()
                || request.is::<DeviceInfoPermissionRequest>();
            if grant {
                request.allow();
            } else {
                request.deny();
            }
            true
        });
    })?;
    Ok(())
}

/// WKWebView routes its prompts through the app, not a floating bar; nothing
/// to do here.
#[cfg(target_os = "macos")]
pub fn suppress_native_media_prompts<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
