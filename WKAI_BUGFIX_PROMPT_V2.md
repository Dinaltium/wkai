# WKAI — Bug Fix + Feature Implementation Prompt v2
## For: Cursor / Claude Code / Gemini CLI / Any Agentic AI Coding Assistant

---

## MANDATORY RULES FOR THE AI AGENT

1. Read every file before editing it. Never assume content.
2. Commit after every discrete fix/feature: `fix(scope): description` or `feat(scope): description`.
3. No `any` TypeScript types unless forced by a library.
4. Keep Node.js backend as ESM — `import`/`export` only.
5. LangGraph nodes are pure async functions — take state, return partial state update, never mutate.
6. Never break existing functionality.
7. Run `npx tsc --noEmit` in `wkai/` and `wkai-student/` after every commit.
8. No emojis anywhere in UI text, labels, buttons, or error messages.
9. Groq model names are locked — do not change them.
10. For every Rust change: `cargo check` in `wkai/src-tauri/` before committing.

---

## DIAGNOSED ROOT CAUSES FOR THE CAPTURE BUG

After research the following root causes were identified. Fix them in this exact order.

### Root Cause 1 — Wrong Rust crate: `screenshots` hangs on Windows

The `screenshots` crate uses an older Windows GDI/DXGI path that hangs on many Windows 10/11 configurations when called from inside a Tauri process. The replacement is the `xcap` crate, which uses Windows Graphics Capture API and is what `tauri-plugin-screenshots` and production Tauri apps use in 2024/2025.

### Root Cause 2 — Wrong threading model: `std::thread::spawn` + manual Tokio runtime

The current implementation does:
```rust
std::thread::spawn(move || {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all().build().expect("...");
    rt.block_on(async move { ... });
});
```

This is wrong for Tauri v2. The correct pattern is:
```rust
tauri::async_runtime::spawn(async move {
    loop {
        tokio::task::spawn_blocking(|| { /* xcap capture here */ }).await??;
        app.emit("screen-frame", payload)?;
        tokio::time::sleep(...).await;
    }
});
```

`std::thread::spawn` creates a thread with no Tokio context. Any `tokio::spawn` or `.await` inside dies silently with "no reactor running" panic on some platforms, explaining why zero debug logs appear.

### Root Cause 3 — `app.emit()` with wrong type

In Tauri v2 the `Emitter` trait must be in scope **and** the `AppHandle` clone must be used inside the async closure. Cloning `AppHandle` is cheap and safe.

### Root Cause 4 — Panic inside `std::thread::spawn` kills the loop silently

Any panic inside `std::thread::spawn` terminates that thread. The `screenshots` crate panics on Windows when it cannot acquire a DXGI output. No log, no error event, just silence. This is why adding debug logs didn't help — the thread was already dead by the first capture attempt.

---

## PART 1 — CRITICAL BUG FIX: SCREEN CAPTURE

### Step 1.1 — Update Cargo.toml

**File:** `wkai/src-tauri/Cargo.toml`

Remove `screenshots` and add `xcap`. Also add `windows` feature for screenshot capability:

```toml
[dependencies]
# REMOVE this line:
# screenshots = "0.8"

# ADD these:
xcap = "0.0.14"
image = { version = "0.25", features = ["jpeg", "png"] }
```

Keep all other dependencies unchanged. After editing, run:
```bash
cd wkai/src-tauri && cargo check
```

If `cargo check` shows xcap version issues, try `xcap = "0.0.13"` or check crates.io for the latest stable version.

---

### Step 1.2 — REPLACE ENTIRE FILE: `wkai/src-tauri/src/commands/capture.rs`

This is a complete rewrite. Replace every line with the following:

```rust
// commands/capture.rs
//
// Screen capture loop using `xcap` (Windows Graphics Capture API).
//
// Threading model:
//   tauri::async_runtime::spawn  →  Tauri-managed Tokio executor (correct for Tauri v2)
//   tokio::task::spawn_blocking  →  offloads the blocking xcap call off the async thread
//
// Why NOT std::thread::spawn:
//   A raw OS thread has no Tokio reactor. Any async code inside it panics silently
//   with "no reactor running". This was the original bug.

use base64::{engine::general_purpose, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use xcap::Monitor;

/// Set to true while the capture loop is running.
/// Using Arc<AtomicBool> so it can be shared between the command return
/// and the spawned async task.
static CAPTURING: AtomicBool = AtomicBool::new(false);

/// Maximum width of the frame sent to the AI pipeline.
/// Groq vision works well at 1024 px; larger wastes tokens without adding value.
const MAX_FRAME_WIDTH: u32 = 1024;

/// JPEG quality (0–100). 75 is a good balance between file size and detail.
const JPEG_QUALITY: u8 = 75;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureConfig {
    pub frames_per_minute: u32,
    pub capture_audio: bool,
    pub session_id: String,
    pub stream_to_students: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScreenFramePayload {
    pub session_id: String,
    /// Base64-encoded JPEG (downscaled for the AI pipeline)
    pub frame_b64: String,
    pub timestamp: String,
    pub width: u32,
    pub height: u32,
    pub stream_to_students: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDebugPayload {
    pub stage: String,
    pub frame_count: u64,
    pub elapsed_ms: Option<u128>,
    pub w: Option<u32>,
    pub h: Option<u32>,
    pub error: Option<String>,
    pub ts: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureError {
    pub message: String,
    pub timestamp: String,
}

// ─── start_capture ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_capture(app: AppHandle, config: CaptureConfig) -> Result<(), String> {
    if CAPTURING.swap(true, Ordering::SeqCst) {
        return Err("Capture already running".to_string());
    }

    let interval_ms = ((60_000u64) / (config.frames_per_minute.max(1) as u64)).max(5_000);

    println!(
        "[Capture] Starting: session={} fpm={} stream={} interval={}ms",
        config.session_id, config.frames_per_minute, config.stream_to_students, interval_ms
    );

    // Emit immediately so the frontend sees "capturing = true" before the first frame
    let _ = app.emit("capture-status", serde_json::json!({ "running": true }));

    // Verify xcap can see monitors BEFORE spawning the loop.
    // This catches permission issues early and logs them to the Rust console.
    match Monitor::all() {
        Ok(monitors) => {
            println!("[Capture] xcap found {} monitor(s)", monitors.len());
            for (i, m) in monitors.iter().enumerate() {
                println!(
                    "[Capture]   Monitor {}: {}x{} is_primary={}",
                    i,
                    m.width(),
                    m.height(),
                    m.is_primary()
                );
            }
        }
        Err(e) => {
            let msg = format!("xcap Monitor::all() failed: {e}");
            println!("[Capture] ERROR: {}", msg);
            CAPTURING.store(false, Ordering::SeqCst);
            let _ = app.emit("capture-status", serde_json::json!({ "running": false }));
            return Err(msg);
        }
    }

    // Clone AppHandle — cheap, safe, required for move into async block
    let app_clone = app.clone();
    let session_id = config.session_id.clone();
    let stream_to_students = config.stream_to_students;

    // Use Tauri's async runtime (= Tokio managed by Tauri).
    // This is the ONLY correct way to spawn long-running async tasks in Tauri v2.
    tauri::async_runtime::spawn(async move {
        let mut frame_count: u64 = 0;
        let mut consecutive_failures: u32 = 0;

        println!("[Capture] Loop started");

        loop {
            if !CAPTURING.load(Ordering::SeqCst) {
                println!("[Capture] Stop flag set, exiting loop");
                break;
            }

            let ts_start = std::time::Instant::now();
            frame_count += 1;

            println!("[Capture] Attempting frame #{}", frame_count);

            // Emit a debug event so the frontend debug panel can show "attempting"
            let _ = app_clone.emit(
                "capture-debug",
                CaptureDebugPayload {
                    stage: "attempt".to_string(),
                    frame_count,
                    elapsed_ms: None,
                    w: None,
                    h: None,
                    error: None,
                    ts: chrono::Utc::now().to_rfc3339(),
                },
            );

            // spawn_blocking: xcap capture is a blocking OS call.
            // Running it directly in an async context would block the Tokio executor.
            let capture_result = tokio::task::spawn_blocking(move || {
                capture_frame_jpeg_xcap()
            })
            .await;

            let elapsed = ts_start.elapsed().as_millis();

            match capture_result {
                Ok(Ok((frame_b64, w, h))) => {
                    consecutive_failures = 0;
                    println!(
                        "[Capture] Frame #{} OK: {}x{} b64_len={} elapsed={}ms",
                        frame_count,
                        w,
                        h,
                        frame_b64.len(),
                        elapsed
                    );

                    let _ = app_clone.emit(
                        "capture-debug",
                        CaptureDebugPayload {
                            stage: "captured".to_string(),
                            frame_count,
                            elapsed_ms: Some(elapsed),
                            w: Some(w),
                            h: Some(h),
                            error: None,
                            ts: chrono::Utc::now().to_rfc3339(),
                        },
                    );

                    let _ = app_clone.emit(
                        "screen-frame",
                        ScreenFramePayload {
                            session_id: session_id.clone(),
                            frame_b64,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            width: w,
                            height: h,
                            stream_to_students,
                        },
                    );
                }

                Ok(Err(e)) => {
                    consecutive_failures += 1;
                    println!(
                        "[Capture] Frame #{} FAILED (consecutive={}): {}",
                        frame_count, consecutive_failures, e
                    );

                    let _ = app_clone.emit(
                        "capture-debug",
                        CaptureDebugPayload {
                            stage: "failed".to_string(),
                            frame_count,
                            elapsed_ms: Some(elapsed),
                            w: None,
                            h: None,
                            error: Some(e.clone()),
                            ts: chrono::Utc::now().to_rfc3339(),
                        },
                    );

                    let _ = app_clone.emit(
                        "capture-error",
                        CaptureError {
                            message: e,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    );

                    // After 5 consecutive failures, abort the loop entirely
                    if consecutive_failures >= 5 {
                        println!(
                            "[Capture] 5 consecutive failures — aborting capture loop"
                        );
                        CAPTURING.store(false, Ordering::SeqCst);
                        let _ = app_clone
                            .emit("capture-status", serde_json::json!({ "running": false }));
                        break;
                    }
                }

                Err(join_err) => {
                    // spawn_blocking task panicked
                    consecutive_failures += 1;
                    let msg = format!("spawn_blocking panicked: {join_err}");
                    println!("[Capture] Frame #{} JOIN ERROR: {}", frame_count, msg);

                    let _ = app_clone.emit(
                        "capture-error",
                        CaptureError {
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    );
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(interval_ms)).await;
        }

        let _ = app_clone.emit("capture-status", serde_json::json!({ "running": false }));
        println!("[Capture] Loop exited cleanly");
    });

    Ok(())
}

// ─── stop_capture ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn stop_capture(app: AppHandle) -> Result<(), String> {
    println!("[Capture] Stop requested");
    CAPTURING.store(false, Ordering::SeqCst);
    let _ = app.emit("capture-status", serde_json::json!({ "running": false }));
    Ok(())
}

// ─── capture_test_frame ───────────────────────────────────────────────────────
// Called from the AI Test in Settings to verify the capture pipeline works.

#[tauri::command]
pub async fn capture_test_frame() -> Result<String, String> {
    let result = tokio::task::spawn_blocking(|| capture_frame_jpeg_xcap())
        .await
        .map_err(|e| format!("spawn_blocking panicked: {e}"))??;

    println!(
        "[Capture] Test frame: {}x{} b64_len={}",
        result.1, result.2, result.0.len()
    );
    Ok(result.0)
}

// ─── Internal: xcap capture + resize + JPEG encode ───────────────────────────

fn capture_frame_jpeg_xcap() -> Result<(String, u32, u32), String> {
    // Get all monitors and pick the primary one
    let monitors = Monitor::all().map_err(|e| format!("Monitor::all() failed: {e}"))?;

    if monitors.is_empty() {
        return Err("No monitors found by xcap".to_string());
    }

    // Prefer primary monitor; fall back to the largest one
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary())
        .or_else(|| monitors.iter().max_by_key(|m| m.width() * m.height()))
        .ok_or("Could not select a monitor")?;

    let raw = monitor
        .capture_image()
        .map_err(|e| format!("Monitor::capture_image() failed: {e}"))?;

    // xcap returns an RgbaImage
    let img = DynamicImage::ImageRgba8(raw);

    // Downscale to MAX_FRAME_WIDTH if needed (preserve aspect ratio)
    let (orig_w, orig_h) = (img.width(), img.height());
    let img = if orig_w > MAX_FRAME_WIDTH {
        let scale = MAX_FRAME_WIDTH as f32 / orig_w as f32;
        let new_h = (orig_h as f32 * scale) as u32;
        img.resize(MAX_FRAME_WIDTH, new_h, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let (w, h) = (img.width(), img.height());
    let rgb = img.to_rgb8();

    // Encode as JPEG
    let mut jpeg_bytes: Vec<u8> = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, JPEG_QUALITY);
    encoder
        .encode(&rgb, w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    let b64 = general_purpose::STANDARD.encode(&jpeg_bytes);
    Ok((b64, w, h))
}
```

---

### Step 1.3 — Update `Cargo.toml` dependency list

**File:** `wkai/src-tauri/Cargo.toml`

Replace the entire `[dependencies]` section with:

```toml
[dependencies]
# Tauri core
tauri = { version = "2.0", features = ["tray-icon", "image-png"] }

# Tauri plugins
tauri-plugin-fs           = "2.0"
tauri-plugin-shell        = "2.0"
tauri-plugin-notification = "2.0"

# Serialization
serde       = { version = "1.0", features = ["derive"] }
serde_json  = "1.0"

# Async runtime
tokio = { version = "1.0", features = ["full"] }

# HTTP client (for calling Groq APIs)
reqwest = { version = "0.12", features = ["json", "multipart", "stream"] }

# Screen capture — replaces `screenshots` crate
# xcap uses Windows.Graphics.Capture API which works in all Windows 10/11 apps
xcap = "0.0.14"

# Image processing (resize + JPEG encode)
image = { version = "0.25", features = ["jpeg", "png"] }

# Audio capture
cpal = "0.15"

# File watching (for auto-detect shareable files)
notify = "6.0"

# Base64 (for encoding screenshots before sending)
base64 = "0.22"

# Error handling
anyhow    = "1.0"
thiserror = "1.0"

# Logging
log        = "0.4"
env_logger = "0.11"

# UUID for room/session IDs
uuid = { version = "1.0", features = ["v4"] }

# Time utilities
chrono = { version = "0.4", features = ["serde"] }

# Channel for threading
flume = "0.11"
```

After editing, run `cargo check` in `wkai/src-tauri/` and resolve any version conflicts.

---

### Step 1.4 — Update `lib.rs` command registration

**File:** `wkai/src-tauri/src/lib.rs`

The `Emitter` import warning was because it was imported but the compiler thought it was unused. In Tauri v2 the `Emitter` trait must be imported for `app.emit()` to work. The warning is a false positive — keep the import or move it to a `use` inside each function that calls `.emit()`.

Ensure the handler registration includes `capture_test_frame`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::session::create_session,
    commands::session::end_session,
    commands::session::get_session_status,
    commands::capture::start_capture,
    commands::capture::stop_capture,
    commands::capture::capture_test_frame,
    commands::files::watch_folder,
    commands::files::share_file,
    commands::files::list_watched_files,
])
```

Remove `Emitter` from the top-level `use` in `lib.rs` — it's only needed inside individual functions. The compiler warning about unused import will go away.

---

### Step 1.5 — Frontend: update the capture-debug event listener

**File:** `wkai/src/hooks/useTauriEvents.ts`

Update the `capture-debug` event listener to match the new payload shape:

```ts
const unlistenCaptureDebug = listen<{
  stage: string;
  frameCount: number;
  elapsedMs?: number;
  w?: number;
  h?: number;
  error?: string;
  ts?: string;
}>('capture-debug', (event) => {
  const p = event.payload;
  if (p.stage === 'attempt') {
    addDebugLog(`Capture attempt #${p.frameCount}`, 'info');
  } else if (p.stage === 'captured') {
    addDebugLog(
      `Capture OK (${p.w}x${p.h}, ${p.elapsedMs ?? '?'}ms)`,
      'success'
    );
  } else if (p.stage === 'failed') {
    addDebugLog(
      `Capture FAILED (${p.elapsedMs ?? '?'}ms): ${p.error ?? 'unknown'}`,
      'error'
    );
  }
});
```

---

### Step 1.6 — Verify with a smoke test

After making changes, do this immediately:

1. `cargo check` in `wkai/src-tauri/` — must succeed
2. `npm run tauri:dev` in `wkai/`
3. Watch the **PowerShell terminal** (not the browser console) for:
   ```
   [Capture] xcap found 1 monitor(s)
   [Capture]   Monitor 0: 1920x1080 is_primary=true
   [Capture] Loop started
   [Capture] Attempting frame #1
   [Capture] Frame #1 OK: 1024x576 b64_len=... elapsed=...ms
   ```
4. If you see `[Capture] Frame #1 FAILED:` — the error message will tell you exactly what failed
5. Open the instructor app → Start Session → check the Debug panel for `capture-debug` events

**Commit:** `fix(capture): replace screenshots crate with xcap, use tauri::async_runtime::spawn + spawn_blocking`

---

---

## PART 2 — NEW FEATURES

---

## F1 — STUDENT WEB APP: EXIT BUTTON

**Goal:** Students can leave the room and return to the home page at any time.

### F1.1 — Add Leave button to RoomHeader

**File:** `wkai-student/src/components/shared/RoomHeader.tsx`

Add a Leave button on the right side of the header, using `useNavigate`:

```tsx
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

export function RoomHeader() {
  const navigate = useNavigate();
  // ... existing state ...

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-wkai-border bg-wkai-surface px-4">
      {/* Left: existing brand + session title */}
      ...

      {/* Right: status indicators + leave button */}
      <div className="flex items-center gap-3 shrink-0">
        {/* existing status indicators */}
        ...

        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs text-wkai-text-dim hover:text-red-400 transition-colors"
          title="Leave session"
        >
          <LogOut size={13} />
          Leave
        </button>
      </div>
    </header>
  );
}
```

**Commit:** `feat(student): add Leave button to room header`

---

## F2 — SESSION ENDED MODAL WITH 10-SECOND AUTO-KICK

**Goal:** When the instructor ends the session, students see a modal with:
- "Stay" button (shows guide + files only — no live preview)
- "Leave" button
- 10-second countdown that auto-kicks if no input

After staying, disable all tabs except Guide and Files. Remove the Live and Q&A tabs for ended sessions.

### F2.1 — Update SessionEndedModal with countdown

**File:** `wkai-student/src/components/shared/SessionEndedModal.tsx`

Replace the entire file:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, BookOpen } from "lucide-react";
import { useStore } from "../../store";

interface Props {
  onStay: () => void;
}

export function SessionEndedModal({ onStay }: Props) {
  const navigate = useNavigate();
  const { guideBlocks } = useStore();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-wkai-border bg-wkai-surface shadow-2xl space-y-6 p-6 animate-slide-up">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <BookOpen size={22} className="text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-wkai-text">Session Ended</h2>
          <p className="text-sm text-wkai-text-dim">
            The instructor has ended this session.
          </p>
          <p className="text-xs text-wkai-text-dim">
            You will be redirected in{" "}
            <span className="font-bold text-amber-400">{countdown}</span> seconds.
          </p>
        </div>

        <div className="rounded-lg bg-wkai-bg border border-wkai-border p-3 text-center">
          <p className="text-xs text-wkai-text-dim">
            {guideBlocks.length} guide block{guideBlocks.length !== 1 ? "s" : ""} available to review
          </p>
        </div>

        <div className="flex gap-3">
          <button
            className="btn-ghost flex-1 justify-center border border-wkai-border"
            onClick={onStay}
          >
            View Guide
          </button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => navigate("/")}
          >
            <LogOut size={14} />
            Leave Now
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### F2.2 — RoomPage: restrict tabs after session ends

**File:** `wkai-student/src/pages/RoomPage.tsx`

Add local state for whether the modal was dismissed:

```tsx
const [endedModalDismissed, setEndedModalDismissed] = useState(false);
```

After staying, the `activeTab` should be forced to `guide` or `files`. Add this logic:

```tsx
// When session ends and user chooses to stay, force guide tab
function handleStay() {
  setEndedModalDismissed(true);
  // If current tab is live or messages, switch to guide
  const { activeTab, setActiveTab } = useStore.getState();
  if (activeTab === 'live' || activeTab === 'messages') {
    setActiveTab('guide');
  }
}
```

In the modal:
```tsx
{sessionEnded && !endedModalDismissed && (
  <SessionEndedModal onStay={handleStay} />
)}
```

Also hide the Live and Q&A tabs when session has ended by passing `sessionEnded` to `TabBar`:

**File:** `wkai-student/src/components/shared/TabBar.tsx`

```tsx
interface Props {
  sessionEnded?: boolean;
}

export function TabBar({ sessionEnded = false }: Props) {
  const { activeTab, setActiveTab, newFileCount } = useStore();

  // Filter out real-time tabs when session has ended
  const visibleTabs = sessionEnded
    ? TABS.filter((t) => t.id === 'guide' || t.id === 'files')
    : TABS;

  return (
    <nav className="flex shrink-0 border-b border-wkai-border bg-wkai-surface">
      {visibleTabs.map((tab) => (
        // ... existing tab button rendering
      ))}
    </nav>
  );
}
```

Pass `sessionEnded` from `RoomPage`:
```tsx
<TabBar sessionEnded={sessionEnded} />
```

**Commit:** `feat(student): session ended modal with 10s auto-kick, restrict tabs after session ends`

---

## F3 — BACKEND RESTART KICKS OUT INSTRUCTOR AND STUDENTS

**Goal:** When the backend Node.js process restarts (crashes or `npm run dev` hot reload), all connected WebSocket clients detect the disconnection and are redirected to the home/setup page.

### F3.1 — Student app: reconnect limit + redirect on repeated failure

**File:** `wkai-student/src/hooks/useRoomSocket.ts`

Track reconnect attempts. After 3 failed reconnects (backend is down), redirect to home:

```ts
const reconnectAttemptsRef = useRef(0);
const MAX_RECONNECT = 3;

// In the onclose handler:
ws.current.onclose = () => {
  useStore.getState().setConnected(false);
  reconnectAttemptsRef.current += 1;

  if (reconnectAttemptsRef.current >= MAX_RECONNECT) {
    // Backend is not coming back — treat as session ended
    useStore.getState().setSessionEnded(true);
    return;
  }

  // Try to reconnect after 3 seconds
  if (!sessionEnded) {
    setTimeout(connect, 3000);
  }
};
```

Also reset `reconnectAttemptsRef.current = 0` in `onopen`:
```ts
ws.current.onopen = () => {
  reconnectAttemptsRef.current = 0;
  useStore.getState().setConnected(false); // will be set true by session-state
};
```

---

### F3.2 — Instructor app: detect backend disconnect + redirect

**File:** `wkai/src/hooks/useWebSocket.ts`

Same pattern — track reconnect attempts. After 3 failures, clear the session and navigate to setup:

```ts
const reconnectCountRef = useRef(0);
const MAX_RECONNECT = 3;

// In ws.onclose:
ws.current.onclose = () => {
  addDebugLog('WebSocket disconnected', 'warn');
  reconnectCountRef.current += 1;

  if (reconnectCountRef.current >= MAX_RECONNECT) {
    addDebugLog('Backend appears down — clearing session', 'error');
    // Clear session state
    useAppStore.getState().setSession(null);
    useAppStore.getState().setCapture({ isCapturing: false, framesSent: 0, lastFrameAt: null, aiProcessing: false });
    // Navigate to home (use window.location since we are outside React component)
    window.location.hash = '/';
    return;
  }

  if (shouldReconnect.current) {
    reconnectTimeout.current = window.setTimeout(connect, 3000);
  }
};

// In ws.onopen — reset counter:
ws.current.onopen = () => {
  reconnectCountRef.current = 0;
  addDebugLog('WebSocket connected to backend', 'success');
};
```

Note: `window.location.hash = '/'` works for HashRouter. If you are using `createBrowserRouter`, dispatch a navigation via `window.dispatchEvent(new CustomEvent('wkai:navigate', { detail: '/' }))` and handle it in `AppShell.tsx` with a `useNavigate` hook.

**Commit:** `feat(resilience): backend restart kicks instructor and students to home page`

---

## F4 — DEBUG LOG PANEL IN STUDENT APP

**Goal:** A small collapsible debug overlay in the top-right of the student room page showing connection status and last 20 events, so you can verify frames are arriving.

### F4.1 — Student store: debug log state

**File:** `wkai-student/src/store/index.ts`

Add to `StudentStore`:

```ts
debugLogs: DebugLogEntry[];
addDebugLog: (message: string, level?: DebugLogLevel) => void;
clearDebugLogs: () => void;
```

Add types:
```ts
export type DebugLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: DebugLogLevel;
}
```

In create:
```ts
debugLogs: [],
addDebugLog: (message, level = 'info') =>
  set((s) => ({
    debugLogs: [
      ...s.debugLogs.slice(-19), // keep last 20
      {
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toLocaleTimeString(),
        message,
        level,
      },
    ],
  })),
clearDebugLogs: () => set({ debugLogs: [] }),
```

---

### F4.2 — Wire debug log into the student socket hook

**File:** `wkai-student/src/hooks/useRoomSocket.ts`

Import `useStore` and call `addDebugLog` at key points:

```ts
const { addDebugLog } = useStore.getState();

// In onopen:
addDebugLog('Connected to room', 'success');

// In onclose:
addDebugLog('Disconnected from room', 'warn');

// In dispatch for each relevant type:
case 'guide-block':
  addDebugLog(`Guide block received: ${(msg.payload as any).type}`, 'success');
  break;
case 'screen-preview':
  addDebugLog('Screen preview frame received', 'info');
  break;
case 'error-resolved':
  addDebugLog('Error diagnosis received', 'success');
  break;
case 'session-ended':
  addDebugLog('Session ended by instructor', 'warn');
  break;
```

---

### F4.3 — New component: StudentDebugPanel

**File:** `wkai-student/src/components/shared/StudentDebugPanel.tsx` (NEW)

```tsx
import { useState } from "react";
import { Bug, X, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { clsx } from "clsx";
import type { DebugLogLevel } from "../../types";

const LEVEL_COLOR: Record<DebugLogLevel, string> = {
  info:    "text-wkai-text-dim",
  warn:    "text-amber-400",
  error:   "text-red-400",
  success: "text-emerald-400",
};

export function StudentDebugPanel() {
  const [open, setOpen] = useState(false);
  const { debugLogs, clearDebugLogs, connected, screenPreview } = useStore();

  return (
    <div className="absolute top-2 right-2 z-40">
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
          open
            ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
            : "border-wkai-border bg-wkai-surface text-wkai-text-dim hover:text-wkai-text"
        )}
        title="Debug console"
      >
        <Bug size={14} />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-9 w-72 rounded-xl border border-wkai-border bg-wkai-bg shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-wkai-border px-3 py-2">
            <span className="text-xs font-medium text-wkai-text">Debug</span>
            <div className="flex gap-1">
              <button
                onClick={clearDebugLogs}
                className="text-wkai-text-dim hover:text-wkai-text p-0.5"
              >
                <Trash2 size={11} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-wkai-text-dim hover:text-wkai-text p-0.5"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="border-b border-wkai-border px-3 py-1.5 space-y-0.5">
            <StatusRow label="WS connection" active={connected} value={connected ? "Live" : "Disconnected"} />
            <StatusRow label="Screen preview" active={!!screenPreview} value={screenPreview ? "Receiving" : "None"} />
          </div>

          {/* Logs */}
          <div className="max-h-48 overflow-y-auto px-2 py-2 font-mono text-xs space-y-0.5">
            {debugLogs.length === 0 ? (
              <p className="text-wkai-text-dim text-center py-2">No events yet</p>
            ) : (
              [...debugLogs].reverse().map((log) => (
                <div key={log.id} className={clsx("flex gap-2 leading-5", LEVEL_COLOR[log.level])}>
                  <span className="shrink-0 text-wkai-text-dim/50">{log.timestamp}</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, active, value }: { label: string; active: boolean; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-wkai-text-dim">{label}</span>
      <span className={clsx("flex items-center gap-1", active ? "text-emerald-400" : "text-wkai-text-dim")}>
        <span className={clsx("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-400" : "bg-gray-600")} />
        {value}
      </span>
    </div>
  );
}
```

---

### F4.4 — Add to RoomPage

**File:** `wkai-student/src/pages/RoomPage.tsx`

Add in the relative-positioned outer div:

```tsx
import { StudentDebugPanel } from "../components/shared/StudentDebugPanel";

// In JSX, the outer container must be relative:
<div className="relative flex h-full flex-col overflow-hidden bg-wkai-bg">
  <RoomHeader />
  <TabBar sessionEnded={sessionEnded} />
  ...
  <StudentDebugPanel />  {/* top-right overlay */}
  ...
</div>
```

Also add `DebugLogLevel` and `DebugLogEntry` types to `wkai-student/src/types/index.ts`.

**Commit:** `feat(student-debug): top-right debug panel showing WS status and frame events`

---

## F5 — RECORDING SCOPE REDUCTION (FUTURE IMPLEMENTATION NOTE)

Per the discussion, **video recording / screen preview in the student app is deferred** to a future implementation phase. For now:

1. Keep the `ScreenPreview` component as-is — it will show frames if the instructor enables sharing
2. The Live tab remains in the UI but shows "Screen sharing will be available in a future update" if no preview arrives
3. Audio capture (`cpal` / `audio.rs`) is similarly deferred — the UI toggle remains but the capture loop does not start audio recording until explicitly implemented

Update `ScreenPreview.tsx` to show a clearer "future feature" message when no preview:

```tsx
// In the empty state:
<p className="text-sm font-medium text-wkai-text">Screen preview not available</p>
<p className="text-xs text-wkai-text-dim max-w-xs text-center">
  Screen sharing will be enabled in a future update.
  Guide blocks and AI assistance work normally.
</p>
```

**Commit:** `chore(scope): defer video/audio recording to future implementation`

---

## PART 3 — COMPLETE TEST CHECKLIST

### Capture Smoke Test (run this first — before everything else)

After applying Part 1 fixes:

```powershell
# In wkai/src-tauri/
cargo check
# Must exit 0

# Then:
cd wkai && npm run tauri:dev
```

Watch the PowerShell terminal — you should see within 15 seconds of clicking "Start Session":
```
[Capture] xcap found 1 monitor(s)
[Capture]   Monitor 0: 1920x1080 is_primary=true
[Capture] Loop started
[Capture] Attempting frame #1
[Capture] Frame #1 OK: 1024x576 b64_len=XXXXX elapsed=XXXms
```

Then check the backend terminal:
```
[WS] screen-frame received (b64_len=XXXXX, stream=...)
```

If frame #1 fails, the error message in the terminal output will tell you exactly what failed. Common errors and solutions:

| Error | Solution |
|---|---|
| `Monitor::all() failed: Access denied` | Run the app as Administrator once to grant screen capture permission |
| `Monitor::capture_image() failed` | xcap version mismatch — try `xcap = "0.0.13"` |
| `spawn_blocking panicked` | Add `RUST_BACKTRACE=1` env var and re-run to see the panic location |
| `JPEG encode failed` | image crate feature issue — verify `image = { version = "0.25", features = ["jpeg"] }` |

---

### Feature Tests

**F1 — Exit button:**
- Open student app → Join room → click Leave in header → should navigate to `JoinPage`

**F2 — Session ended modal:**
- Join as student, instructor clicks End Session
- Modal appears within 1 second with countdown
- Without clicking: after 10 seconds, student is redirected to home
- Click "View Guide": modal disappears, only Guide and Files tabs remain

**F3 — Backend restart:**
- Have a student connected in a room
- Stop backend (`Ctrl+C` in backend terminal)
- After ~3 reconnect attempts (about 9 seconds), student should see session ended state
- Same for instructor app

**F4 — Student debug panel:**
- Click the Bug icon in top-right of RoomPage
- Should show "WS connection: Live" and "Screen preview: None"
- When a guide block arrives, "Guide block received" should appear in the log

---

## PART 4 — COMMIT SEQUENCE

```
fix(capture): replace screenshots crate with xcap, use tauri::async_runtime::spawn + spawn_blocking
feat(student): add Leave button to room header
feat(student): session ended modal with 10s auto-kick, restrict tabs after session ends
feat(resilience): backend restart kicks instructor and students to home page
feat(student-debug): top-right debug panel showing WS status and frame events
chore(scope): defer video/audio recording to future implementation
```

---

## APPENDIX A — XCAP CRATE REFERENCE

The `xcap` crate API used in this prompt:

```rust
use xcap::Monitor;

// List all monitors
let monitors: Vec<Monitor> = Monitor::all()?;

// Check if primary
let is_primary: bool = monitor.is_primary();

// Get dimensions
let w: u32 = monitor.width();
let h: u32 = monitor.height();

// Capture the full monitor as an RGBA image
let image: image::RgbaImage = monitor.capture_image()?;
```

The `Monitor::capture_image()` call is synchronous (blocking). Always call it inside `tokio::task::spawn_blocking`.

---

## APPENDIX B — TAURI V2 ASYNC PATTERN REFERENCE

The correct pattern for long-running background tasks in Tauri v2:

```rust
// ✓ CORRECT
#[tauri::command]
pub async fn start_something(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        loop {
            // Blocking work (I/O, system calls):
            let result = tokio::task::spawn_blocking(|| {
                do_blocking_thing()
            }).await;

            // Emit to frontend:
            let _ = app.emit("event-name", payload);

            // Sleep without blocking the executor:
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
    Ok(()) // Return immediately — the task runs in the background
}

// ✗ WRONG — creates a thread with no Tokio reactor
#[tauri::command]
pub async fn start_something(app: AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()...
        rt.block_on(async move { ... });   // WRONG: nested runtime
    });
    Ok(())
}
```

Key rules:
- Always use `tauri::async_runtime::spawn` (not `tokio::spawn` or `std::thread::spawn`)
- For blocking calls, always use `tokio::task::spawn_blocking`
- Clone `AppHandle` before moving into async block — it is cheap and safe
- Use `tokio::time::sleep` not `std::thread::sleep` inside async blocks
