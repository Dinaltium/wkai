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

/// Creates a new WKAI workshop session.
/// Generates a room code locally, then registers the session with the
/// Node.js backend so students can join via WebSocket.
#[tauri::command]
pub async fn create_session(
    instructor_name: String,
    workshop_title: String,
    backend_url: String,
) -> Result<SessionInfo, String> {
    let session_id = Uuid::new_v4().to_string();
    // Room code: first 6 chars of UUID, uppercased, dashes replaced
    let room_code = session_id[..6].to_uppercase().replace('-', "X");
    let now = chrono::Utc::now().to_rfc3339();

    let session = SessionInfo {
        id: session_id.clone(),
        room_code: room_code.clone(),
        instructor_name: instructor_name.clone(),
        workshop_title: workshop_title.clone(),
        started_at: now,
        status: SessionStatus::Active,
    };

    log::info!("Creating session: {} (room: {})", session_id, room_code);

    // Register with the Node.js backend — students validate room code here
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/api/sessions", backend_url))
        .json(&serde_json::json!({
            "instructorName": instructor_name,
            "workshopTitle":  workshop_title,
            "roomCode":       room_code,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach backend: {}", e))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Backend error: {}", body));
    }

    log::info!("Session registered with backend successfully");
    Ok(session)
}

/// Ends the current session — notifies backend, which cleans up
/// Redis memory, WebSocket room, and broadcasts session-ended to students.
#[tauri::command]
pub async fn end_session(
    session_id: String,
    backend_url: String,
) -> Result<(), String> {
    log::info!("Ending session: {}", session_id);

    let client = reqwest::Client::new();
    let res = client
        .patch(format!("{}/api/sessions/{}/end", backend_url, session_id))
        .send()
        .await
        .map_err(|e| format!("Failed to reach backend: {}", e))?;

    if !res.status().is_success() {
        // Log but don't block — local cleanup should still proceed
        let body = res.text().await.unwrap_or_default();
        log::warn!("Backend end-session returned error: {}", body);
    }

    Ok(())
}

/// Returns the current session status from the backend.
#[tauri::command]
pub async fn get_session_status(
    session_id: String,
    backend_url: String,
) -> Result<SessionStatus, String> {
    let client = reqwest::Client::new();
    let res = client
        .get(format!("{}/api/sessions/{}/status", backend_url, session_id))
        .send()
        .await
        .map_err(|e| format!("Failed to reach backend: {}", e))?;

    if res.status().is_success() {
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let status_str = body["status"].as_str().unwrap_or("active");
        let status = match status_str {
            "active" => SessionStatus::Active,
            "paused" => SessionStatus::Paused,
            "ended"  => SessionStatus::Ended,
            _        => SessionStatus::Active,
        };
        Ok(status)
    } else {
        // Default to active if status check fails — non-critical
        Ok(SessionStatus::Active)
    }
}