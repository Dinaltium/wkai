use xcap::Monitor;
use base64::{engine::general_purpose, Engine as _};
use std::io::Cursor;
use image::ImageFormat;

#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    let monitors = Monitor::all().map_err(|e| {
        log::error!("Failed to list monitors: {}", e);
        format!("Failed to list monitors: {}", e)
    })?;
    
    let monitor = monitors.first().ok_or_else(|| {
        log::error!("No monitor found during capture");
        "No monitor found".to_string()
    })?;
    
    let image = monitor.capture_image().map_err(|e| {
        log::error!("Failed to capture image: {}", e);
        format!("Failed to capture image: {}", e)
    })?;
    
    let mut dynamic_image = image::DynamicImage::ImageRgba8(image);
    
    // Resize if too large (e.g. 4K) to save bandwidth and CPU
    if dynamic_image.width() > 1920 {
        dynamic_image = dynamic_image.resize(1920, 1080, image::imageops::FilterType::Triangle);
    }
    
    let mut buffer = Cursor::new(Vec::new());
    // Use JPEG for smaller payload (AI doesn't need lossless)
    dynamic_image.write_to(&mut buffer, ImageFormat::Jpeg).map_err(|e| {
        log::error!("Failed to encode image: {}", e);
        format!("Failed to encode image: {}", e)
    })?;
    
    let b64 = general_purpose::STANDARD.encode(buffer.get_ref());
    Ok(b64)
}
