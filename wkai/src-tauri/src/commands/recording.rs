// Tauri commands for native recording. Sync (not async) on purpose: they hold a
// std Mutex, and holding a MutexGuard across an .await is not allowed. Sync
// commands run on Tauri's blocking thread pool, so the short waits here are fine.

use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::State;

use crate::recording::config::RecordConfig;
use crate::recording::ffmpeg::build_record_args;

#[derive(Default)]
pub struct RecordingState {
    child: Option<Child>,
    output_path: Option<String>,
}

/// Managed state — one active recording per app instance.
pub type RecordingManager = Mutex<RecordingState>;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[tauri::command]
pub fn start_recording(
    config: RecordConfig,
    ffmpeg_path: Option<String>,
    state: State<'_, RecordingManager>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if guard.child.is_some() {
        return Err("A recording is already in progress".into());
    }
    if config.output_path.trim().is_empty() {
        return Err("Output path is required".into());
    }

    // Default to a bundled/system ffmpeg on PATH; the app will point this at the
    // bundled binary once that's wired.
    let bin = ffmpeg_path.unwrap_or_else(|| "ffmpeg".to_string());
    let args = build_record_args(&config);
    log::info!("[recording] start: {} {}", bin, args.join(" "));

    let mut cmd = Command::new(&bin);
    cmd.args(&args)
        .stdin(Stdio::piped()) // send "q" for a clean stop that finalizes the mp4
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to start ffmpeg: {e}"))?;
    guard.output_path = Some(config.output_path.clone());
    guard.child = Some(child);
    Ok(())
}

#[tauri::command]
pub fn stop_recording(state: State<'_, RecordingManager>) -> Result<String, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let mut child = guard.child.take().ok_or("No recording in progress")?;
    let output = guard.output_path.take().unwrap_or_default();

    // Graceful stop: ffmpeg exits and writes the mp4 moov atom when it reads "q"
    // on stdin. Killing hard would corrupt the file.
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"q");
        let _ = stdin.flush();
        // stdin dropped here -> closed
    }

    match child.wait() {
        Ok(status) => log::info!("[recording] ffmpeg exited: {status}"),
        Err(e) => {
            log::warn!("[recording] wait failed ({e}); killing");
            let _ = child.kill();
        }
    }
    Ok(output)
}

#[tauri::command]
pub fn recording_status(state: State<'_, RecordingManager>) -> Result<bool, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    // Reap the child if ffmpeg exited on its own (e.g. an error), so status is honest.
    if let Some(child) = guard.child.as_mut() {
        if let Ok(Some(_)) = child.try_wait() {
            guard.child = None;
            guard.output_path = None;
        }
    }
    Ok(guard.child.is_some())
}
