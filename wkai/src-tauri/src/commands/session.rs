use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub room_code: String,
    pub instructor_name: String,
    pub workshop_title: String,
    pub started_at: String,
    pub status: SessionStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Idle,
    Active,
    Paused,
    Ended,
}

/// Creates a new WKAI workshop session and returns the room code.
/// Called when the instructor clicks "Start Session".
#[tauri::command]
pub async fn create_session(
    instructor_name: String,
    workshop_title: String,
) -> Result<SessionInfo, String> {
    let session_id = Uuid::new_v4().to_string();
    // Room code: 6 uppercase alphanumeric characters derived from UUID
    let room_code = session_id[..6].to_uppercase().replace('-', "X");

    let now = chrono::Utc::now().to_rfc3339();

    let session = SessionInfo {
        id: session_id,
        room_code,
        instructor_name,
        workshop_title,
        started_at: now,
        status: SessionStatus::Active,
    };

    log::info!("Session created: {} (room: {})", session.id, session.room_code);

    // TODO: Register this session with the Node.js backend via HTTP
    // let _ = register_session_with_backend(&session).await;

    Ok(session)
}

/// Ends the current session and stops all capture processes.
#[tauri::command]
pub async fn end_session(session_id: String) -> Result<(), String> {
    log::info!("Ending session: {}", session_id);
    // TODO: Notify backend, flush any buffered AI content
    Ok(())
}

/// Returns current session status for the UI to display.
#[tauri::command]
pub async fn get_session_status(session_id: String) -> Result<SessionStatus, String> {
    // TODO: Query backend for real status
    let _ = session_id;
    Ok(SessionStatus::Active)
}
