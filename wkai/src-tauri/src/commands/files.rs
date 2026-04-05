use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchedFile {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileChangedPayload {
    pub file: WatchedFile,
    pub event: String, // "created" | "modified" | "deleted"
}

/// Starts watching a folder for new/modified files.
/// When a file changes, emits a "file-changed" event to the frontend.
#[tauri::command]
pub async fn watch_folder(app: AppHandle, folder_path: String) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);

    if !path.exists() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }

    log::info!("Watching folder: {}", folder_path);

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher = RecommendedWatcher::new(tx, Config::default()).unwrap();
        watcher.watch(&path, RecursiveMode::NonRecursive).unwrap();

        for res in rx {
            match res {
                Ok(event) => {
                    let event_kind = match event.kind {
                        EventKind::Create(_) => "created",
                        EventKind::Modify(_) => "modified",
                        EventKind::Remove(_) => "deleted",
                        _ => continue,
                    };

                    for path in event.paths {
                        if let Some(file) = read_file_meta(&path) {
                            let _ = app.emit(
                                "file-changed",
                                FileChangedPayload {
                                    file,
                                    event: event_kind.to_string(),
                                },
                            );
                        }
                    }
                }
                Err(e) => log::error!("Watch error: {:?}", e),
            }
        }
    });

    Ok(())
}

/// Shares a specific file to all students in the room.
/// The file is uploaded to Firebase Storage and the URL is broadcast via WebSocket.
#[tauri::command]
pub async fn share_file(
    session_id: String,
    file_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    log::info!(
        "Sharing file '{}' for session {}",
        file_name,
        session_id
    );

    // TODO: Upload to Firebase Storage
    // TODO: Broadcast download URL to all students via WebSocket

    Ok(format!("https://storage.wkai.app/{}/{}", session_id, file_name))
}

/// Lists all files in the watched folder.
#[tauri::command]
pub async fn list_watched_files(folder_path: String) -> Result<Vec<WatchedFile>, String> {
    let path = PathBuf::from(&folder_path);

    if !path.exists() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }

    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        if let Some(file) = read_file_meta(&entry.path()) {
            files.push(file);
        }
    }

    // Most recently modified first
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(files)
}

fn read_file_meta(path: &PathBuf) -> Option<WatchedFile> {
    if path.is_dir() {
        return None;
    }

    let meta = std::fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    let modified_at = chrono::DateTime::<chrono::Utc>::from(modified)
        .to_rfc3339();

    Some(WatchedFile {
        name: path.file_name()?.to_str()?.to_string(),
        path: path.to_str()?.to_string(),
        size_bytes: meta.len(),
        modified_at,
    })
}
