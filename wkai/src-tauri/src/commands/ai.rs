use xcap::Monitor;
use base64::{engine::general_purpose, Engine as _};
use std::io::Cursor;
use image::ImageFormat;

#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;
    let monitor = monitors.first().ok_or("No monitor found")?;
    
    let image = monitor.capture_image().map_err(|e| format!("Failed to capture image: {}", e))?;
    
    let mut buffer = Cursor::new(Vec::new());
    // Use JPEG for smaller payload (AI doesn't need lossless)
    image.write_to(&mut buffer, ImageFormat::Jpeg).map_err(|e| format!("Failed to encode image: {}", e))?;
    
    let b64 = general_purpose::STANDARD.encode(buffer.get_ref());
    Ok(b64)
}
