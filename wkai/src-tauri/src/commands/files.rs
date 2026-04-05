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

/// Shares a file by uploading it to Cloudinary via the backend REST API,
/// then the backend broadcasts the download URL to all students via WebSocket.
///
/// The Rust side reads the file bytes and POSTs multipart form data to
/// /api/files/upload — the backend handles Cloudinary and WS broadcast.
#[tauri::command]
pub async fn share_file(
    session_id: String,
    file_path: String,
    backend_url: String,
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

    let file_bytes = std::fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    log::info!("Uploading '{}' for session {}", file_name, session_id);

    // Build multipart form — matches what multer expects on the backend
    let file_part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(file_name.clone())
        .mime_str("application/octet-stream")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .text("sessionId", session_id)
        .part("file", file_part);

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/api/files/upload", backend_url))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Upload failed: {}", e))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Backend upload error: {}", body));
    }

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse upload response: {}", e))?;

    let url = body["url"]
        .as_str()
        .unwrap_or("")
        .to_string();

    log::info!("File '{}' uploaded successfully: {}", file_name, url);
    Ok(url)
}

/// Lists all files in the watched folder, sorted by most recently modified.
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
    let modified_at = chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339();

    Some(WatchedFile {
        name:        path.file_name()?.to_str()?.to_string(),
        path:        path.to_str()?.to_string(),
        size_bytes:  meta.len(),
        modified_at,
    })
}