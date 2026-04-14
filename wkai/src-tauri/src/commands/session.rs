use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub roomCode: String,
    pub instructorName: String,
    pub workshopTitle: String,
    pub startedAt: String,
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
    session_password: Option<String>,
) -> Result<SessionInfo, String> {
    let session_id = Uuid::new_v4().to_string();
    // Room code: first 6 chars of UUID, uppercased, dashes replaced
    let room_code = session_id[..6].to_uppercase().replace('-', "X");
    let now = chrono::Utc::now().to_rfc3339();

    let _session = SessionInfo {
        id: session_id.clone(),
        roomCode: room_code.clone(),
        instructorName: instructor_name.clone(),
        workshopTitle: workshop_title.clone(),
        startedAt: now.clone(),
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
            "sessionPassword": session_password,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach backend: {}", e))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Backend error: {}", body));
    }

    // Backend returns { session: {...}, ... }, we need to extract the session
    let response: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let backend_session = response
        .get("session")
        .ok_or("Backend did not return session object")?;

    // Merge backend data (id, startedAt) with local data
    let merged = SessionInfo {
        id:             backend_session["id"].as_str().unwrap_or(&session_id).to_string(),
        roomCode:       backend_session["roomCode"].as_str().unwrap_or(&room_code).to_string(),
        instructorName: backend_session["instructorName"].as_str().unwrap_or(&instructor_name).to_string(),
        workshopTitle:  backend_session["workshopTitle"].as_str().unwrap_or(&workshop_title).to_string(),
        startedAt:      backend_session["startedAt"].as_str().unwrap_or(&now).to_string(),
        status:         SessionStatus::Active,
    };

    log::info!("Session registered with backend successfully");
    Ok(merged)
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