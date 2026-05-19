use crate::native_capture::types::{MonitorInfo, WindowInfo};

/// List all available monitors using xcap.
pub fn list_monitors() -> anyhow::Result<Vec<MonitorInfo>> {
    let monitors = xcap::Monitor::all()
        .map_err(|e| anyhow::anyhow!("Failed to enumerate monitors: {e}"))?;

    let infos: Vec<MonitorInfo> = monitors
        .iter()
        .enumerate()
        .map(|(idx, m)| {
            MonitorInfo {
                id: format!("monitor-{idx}"),
                name: m.name().unwrap_or_else(|_| format!("Display {}", idx + 1)),
                width: m.width().unwrap_or(0),
                height: m.height().unwrap_or(0),
                is_primary: m.is_primary().unwrap_or(false),
            }
        })
        .collect();

    log::info!("[devices] found {} monitor(s)", infos.len());
    Ok(infos)
}

/// List all visible windows using xcap.
pub fn list_windows() -> anyhow::Result<Vec<WindowInfo>> {
    let windows = xcap::Window::all()
        .map_err(|e| anyhow::anyhow!("Failed to enumerate windows: {e}"))?;

    let infos: Vec<WindowInfo> = windows
        .iter()
        .enumerate()
        .filter(|(_, w)| {
            // Skip windows with empty titles or zero dimensions
            let title = w.title().unwrap_or_default();
            !title.is_empty() && w.width().unwrap_or(0) > 0 && w.height().unwrap_or(0) > 0
        })
        .map(|(idx, w)| {
            WindowInfo {
                id: format!("window-{}", w.id().unwrap_or(0)),
                title: w.title().unwrap_or_default(),
                app_name: w.app_name().unwrap_or_default(),
                width: w.width().unwrap_or(0),
                height: w.height().unwrap_or(0),
            }
        })
        .collect();

    log::info!("[devices] found {} window(s)", infos.len());
    Ok(infos)
}
