/// Check whether the current process has sufficient permissions for screen capture.
///
/// On Windows, screen capture via the Desktop Duplication API (used internally by
/// xcap) is generally available to all interactive desktop sessions.  We simply log
/// and return Ok.
pub fn check_capture_permissions() -> anyhow::Result<()> {
    log::info!("[permissions] Windows capture permission check – OK (no special permissions required)");
    Ok(())
}
