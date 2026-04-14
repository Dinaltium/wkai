use tauri::{
    Manager, Runtime, Emitter,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

mod capture;
mod commands;
mod session;
mod ai;
mod audio;
mod file_watcher;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        // Register plugins
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())

        // Register all Tauri commands (callable from JS frontend)
        .invoke_handler(tauri::generate_handler![
            commands::session::create_session,
            commands::session::end_session,
            commands::session::get_session_status,
            commands::capture::start_capture,
            commands::capture::stop_capture,
            commands::capture::capture_test_frame,
            commands::files::watch_folder,
            commands::files::share_file,
            commands::files::list_watched_files,
        ])

        // Setup system tray
        .setup(|app| {
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
