use tauri::{
    Manager, Runtime,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

mod commands;
mod session;
mod ai;
mod audio;
mod file_watcher;
mod native_capture;
mod recording;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        // Register plugins
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())

        // Register all Tauri commands (callable from JS frontend)
        .invoke_handler(tauri::generate_handler![
            commands::session::create_session,
            commands::session::end_session,
            commands::session::get_session_status,
            commands::files::watch_folder,
            commands::files::share_file,
            commands::files::list_watched_files,
            commands::ai::capture_screen,
            commands::native_capture::get_platform_backend,
            commands::native_capture::list_capture_devices,
            commands::native_capture::start_native_capture,
            commands::native_capture::stop_native_capture,
            commands::native_capture::get_capture_status,
            commands::native_capture::get_capture_metrics,
            commands::native_capture::get_latest_frame,
            commands::native_capture::append_to_recording,
            commands::recording::start_recording,
            commands::recording::stop_recording,
            commands::recording::recording_status,
            audio::list_audio_input_devices,
            audio::start_audio_capture,
            audio::stop_audio_capture,
        ])

        // Setup system tray
        .setup(|app| {
            // Initialize native capture manager as managed state
            let manager = native_capture::CaptureManager::new(app.handle().clone());
            app.manage(std::sync::Arc::new(std::sync::Mutex::new(manager)));

            // Native recording (FFmpeg-driven) managed state.
            app.manage(commands::recording::RecordingManager::default());

            setup_tray(app)?;
            Ok(())
        })

        .run(tauri::generate_context!())
        .expect("error while running WKAI application");
}

fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let quit = MenuItem::with_id(app, "quit", "Quit WKAI", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let status = MenuItem::with_id(app, "status", "Status: Idle", false, None::<&str>)?;

    let menu = Menu::with_items(app, &[&status, &separator, &show, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                log::info!("Quit requested from tray");
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
