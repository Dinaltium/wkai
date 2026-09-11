// On Linux the app has no native capture (xcap would drag in PipeWire and a
// glibc floor above Ubuntu 22.04). The frontend grabs AI frames from its own
// screen-share stream there, so this command only needs to say so clearly.
#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    Err("Native screen capture is not available on Linux; frames come from the browser capture stream.".to_string())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    use image::ImageFormat;
    use std::io::Cursor;
    use xcap::Monitor;
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
    
    // The vision model is billed by image area, and this is the single largest
    // cost in the whole session: one 1920x1200 frame is ~3,900 tokens against a
    // 200,000/day allowance. At a frame every 25s that is about twenty minutes
    // of teaching before the day's budget is gone and the guide goes quiet —
    // which reads as the AI being broken rather than out of credit.
    //
    // 1280 wide keeps editor text legible enough to quote code exactly (the
    // prompt requires verbatim extraction) while costing roughly half as much,
    // and the old threshold left the common 1920-wide desktop untouched.
    const MAX_AI_FRAME_WIDTH: u32 = 1280;
    if dynamic_image.width() > MAX_AI_FRAME_WIDTH {
        let height = MAX_AI_FRAME_WIDTH * dynamic_image.height() / dynamic_image.width();
        dynamic_image = dynamic_image.resize(
            MAX_AI_FRAME_WIDTH,
            height,
            image::imageops::FilterType::Triangle,
        );
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
