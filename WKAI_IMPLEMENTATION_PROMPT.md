# WKAI — Complete Feature Implementation Prompt
## For: Cursor / Claude Code / Gemini CLI / Any Agentic AI Coding Assistant

---

## MANDATORY RULES FOR THE AI AGENT

Before writing a single line of code, read and internalize these rules:

1. **Read every referenced file before editing it.** Never assume content.
2. **Commit after every discrete feature** with a message in the format `feat(scope): description`.
3. **Maintain strict TypeScript** — no `any` types unless the library forces it. Add `// eslint-disable` with justification if needed.
4. **Keep Node.js backend as ESM** — `import`/`export` only, never `require`.
5. **LangGraph nodes are pure async functions** — they take state, return a partial state update, never mutate.
6. **Never break existing functionality.** Add, do not replace, unless a file is explicitly listed under "REPLACE ENTIRELY".
7. **Test each feature in isolation** using the checklist provided at the end of each section before moving on.
8. **No emojis anywhere** in UI text, labels, buttons, placeholders, or error messages.
9. **Groq model names are locked** — do not change them:
   - Vision: `meta-llama/llama-4-scout-17b-16e-instruct`
   - Text: `llama3-70b-8192`
   - Whisper: `whisper-large-v3`
10. **After each commit**, run `npx tsc --noEmit` in both `wkai/` and `wkai-student/` to verify zero type errors.

---

## PROJECT CONTEXT

Three repositories in `~/Projects/wkai/`:

```
wkai/              Instructor desktop app   Tauri v2 + Rust + React + TypeScript
wkai-backend/      Backend server           Node.js ESM + Express + WebSocket + PostgreSQL + Redis
wkai-student/      Student web app          React + TypeScript + Vite
```

The full architecture, all existing code, and all file paths are documented in `WKAI_PROJECT_STRUCTURE.md` and `WKAI_Qwen35_Prompt.md` at the repo root. Read those before starting.

---

## FEATURE LIST (implement in this exact order)

```
F1  — Network / WiFi support
F2  — Screen capture bug fix + frame compression
F3  — Live share toggle (pause/resume streaming to students)
F4  — Debug log panel in instructor app sidebar
F5  — Students join with name; instructor sees toast + student list panel
F6  — Instructor leave triggers student disconnect modal
F7  — Live screen preview in student app (low-res frame stream)
F8  — Student-to-instructor messaging with AI fallback agent
F9  — Mic test + AI connection test in instructor settings
F10 — Token usage optimizations across all LangGraph pipelines
F11 — UI polish pass (no emojis, consistent spacing, professional tone)
```

---

---

# F1 — NETWORK / WIFI SUPPORT

**Goal:** The backend runs on the instructor's machine. The instructor app and any student browser on the same LAN must be able to connect using the instructor's local IP address rather than `localhost`.

---

## F1.1 — Backend: bind to all interfaces

**File:** `wkai-backend/src/index.js`

Replace:
```js
server.listen(PORT, () => {
```
With:
```js
server.listen(PORT, '0.0.0.0', () => {
  const networkIp = getLocalIp();
  console.log(`[WKAI] Server running on http://localhost:${PORT}`);
  if (networkIp) {
    console.log(`[WKAI] LAN access:  http://${networkIp}:${PORT}`);
    console.log(`[WKAI] Student URL: http://${networkIp}:3000`);
  }
  console.log(`[WKAI] WebSocket:   ws://localhost:${PORT}/ws`);
});
```

Add this helper function **before** the `main()` call:
```js
import os from 'os';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}
```

---

## F1.2 — Backend: add /api/network-info endpoint

**File:** `wkai-backend/src/app.js`

Add after the health check route:
```js
import os from 'os';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

app.get('/api/network-info', (_req, res) => {
  const ip = getLocalIp();
  res.json({
    localIp: ip,
    port: process.env.PORT ?? 4000,
    studentUrl: ip ? `http://${ip}:3000` : null,
    backendUrl: ip ? `http://${ip}:${process.env.PORT ?? 4000}` : null,
  });
});
```

---

## F1.3 — Backend: update CORS to allow LAN origins

**File:** `wkai-backend/src/app.js`

Replace:
```js
app.use(cors({ origin: '*' }));
```
With:
```js
app.use(cors({
  origin: (origin, callback) => {
    // Allow: no origin (curl/Postman), localhost, and any private LAN IP
    if (!origin) return callback(null, true);
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const isLan = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(origin);
    if (isLocalhost || isLan) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
```

---

## F1.4 — Instructor app: auto-fetch and display LAN IP

**File:** `wkai/src/pages/SettingsPage.tsx`

Add a "Network" section between "Backend" and "AI" sections:

```tsx
import { useEffect, useState } from "react";
import { Network } from "lucide-react";

// Inside SettingsPage component, add state:
const [networkInfo, setNetworkInfo] = useState<{
  localIp: string | null;
  studentUrl: string | null;
} | null>(null);

// Add useEffect to fetch network info:
useEffect(() => {
  fetch(`${settings.backendUrl}/api/network-info`)
    .then((r) => r.json())
    .then(setNetworkInfo)
    .catch(() => setNetworkInfo(null));
}, [settings.backendUrl]);
```

Add this section in JSX between the Backend and AI sections:
```tsx
{/* Network Info */}
{networkInfo?.localIp && (
  <section className="card space-y-3 p-4">
    <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
      Network
    </h2>
    <div className="rounded-lg bg-wkai-bg border border-wkai-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-wkai-text-dim">Instructor IP</span>
        <span className="font-mono text-xs text-indigo-400">{networkInfo.localIp}</span>
      </div>
      {networkInfo.studentUrl && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-wkai-text-dim">Student URL</span>
          <span className="font-mono text-xs text-emerald-400">{networkInfo.studentUrl}</span>
        </div>
      )}
    </div>
    <p className="text-xs text-wkai-text-dim">
      Share the Student URL with participants. All devices must be on the same network.
    </p>
  </section>
)}
```

---

## F1.5 — Student app: configurable backend URL

**File:** `wkai-student/src/lib/api.ts`

Change the axios baseURL to read from `sessionStorage` first (so students can override), then env var, then localhost:
```ts
function getBackendUrl(): string {
  return (
    sessionStorage.getItem('wkai_backend_url') ??
    import.meta.env.VITE_BACKEND_URL ??
    'http://localhost:4000'
  );
}

const api = axios.create({ baseURL: getBackendUrl() });
```

**File:** `wkai-student/src/hooks/useRoomSocket.ts`

Change:
```ts
const BACKEND_WS = import.meta.env.VITE_BACKEND_WS ?? "ws://localhost:4000";
```
To:
```ts
function getWsUrl(): string {
  const stored = sessionStorage.getItem('wkai_backend_url');
  if (stored) return stored.replace(/^http/, 'ws');
  return import.meta.env.VITE_BACKEND_WS ?? 'ws://localhost:4000';
}
const BACKEND_WS = getWsUrl();
```

**File:** `wkai-student/src/pages/JoinPage.tsx`

Add a collapsible "Advanced" section below the 6-char input, before the error message:
```tsx
const [showAdvanced, setShowAdvanced] = useState(false);
const [backendUrl, setBackendUrl] = useState(
  sessionStorage.getItem('wkai_backend_url') ?? ''
);

function saveBackendUrl() {
  if (backendUrl.trim()) {
    sessionStorage.setItem('wkai_backend_url', backendUrl.trim());
  } else {
    sessionStorage.removeItem('wkai_backend_url');
  }
}
```

```tsx
{/* Advanced toggle */}
<button
  className="mt-4 text-xs text-wkai-text-dim hover:text-wkai-text transition-colors"
  onClick={() => setShowAdvanced(v => !v)}
>
  {showAdvanced ? 'Hide' : 'Advanced settings'}
</button>

{showAdvanced && (
  <div className="mt-3 w-full max-w-xs space-y-2">
    <p className="text-xs text-wkai-text-dim text-center">
      Enter the instructor's backend URL if not on localhost
    </p>
    <input
      className="input text-xs font-mono"
      placeholder="http://192.168.1.x:4000"
      value={backendUrl}
      onChange={(e) => setBackendUrl(e.target.value)}
      onBlur={saveBackendUrl}
    />
  </div>
)}
```

**File:** `wkai-student/vite.config.ts`

Update the proxy to also handle the case where `VITE_BACKEND_URL` is set:
```ts
const backendUrl = process.env.VITE_BACKEND_URL ?? 'http://localhost:4000';
server: {
  port: 3000,
  proxy: {
    '/api': backendUrl,
    '/ws': { target: backendUrl.replace('http', 'ws'), ws: true },
  },
},
```

**Commit:** `feat(network): WiFi/LAN support — bind to 0.0.0.0, network info API, configurable backend URL`

---

### F1 Test Checklist
- [ ] Start backend; terminal shows LAN IP and student URL
- [ ] `/api/network-info` returns `localIp`, `port`, `studentUrl`
- [ ] Student app: entering `http://192.168.x.x:4000` in Advanced saves to sessionStorage
- [ ] Student on a different device (same WiFi) can join a session

---

---

# F2 — SCREEN CAPTURE BUG FIX AND FRAME COMPRESSION

**Goal:** Fix the screen capture not working. The primary issues are: (a) base64 PNG frames can exceed Tauri's IPC message size limit; (b) the `screenshots` crate may need explicit screen selection; (c) the frame is not compressed before sending.

---

## F2.1 — Rust: fix capture, add resize + JPEG compression

**File:** `wkai/src-tauri/src/commands/capture.rs`

Replace the entire file with:

```rust
use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, ImageEncoder};
use image::codecs::jpeg::JpegEncoder;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static CAPTURING: AtomicBool = AtomicBool::new(false);

/// Maximum dimension for the frame sent to the AI pipeline.
/// Groq vision model works well at 1024px width; larger wastes tokens.
const MAX_FRAME_WIDTH: u32 = 1024;
/// JPEG quality for the AI frame (lower = smaller payload, still enough detail)
const AI_FRAME_QUALITY: u8 = 75;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureConfig {
    pub frames_per_minute: u32,
    pub capture_audio: bool,
    pub session_id: String,
    /// If true, captured frames are broadcast to students via WebSocket
    pub stream_to_students: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScreenFramePayload {
    pub session_id: String,
    /// Base64-encoded JPEG (downscaled for AI pipeline)
    pub frame_b64: String,
    pub timestamp: String,
    pub width: u32,
    pub height: u32,
    pub stream_to_students: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureError {
    pub message: String,
    pub timestamp: String,
}

#[tauri::command]
pub async fn start_capture(app: AppHandle, config: CaptureConfig) -> Result<(), String> {
    if CAPTURING.swap(true, Ordering::SeqCst) {
        return Err("Capture already running".to_string());
    }

    log::info!(
        "[Capture] Starting for session={} fps_per_min={} stream={}",
        config.session_id, config.frames_per_minute, config.stream_to_students
    );

    let session_id = config.session_id.clone();
    let interval_secs = (60u64 / config.frames_per_minute.max(1) as u64).max(5);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime");

        rt.block_on(async move {
            // Emit a "capture started" event so the UI knows the loop is live
            let _ = app.emit("capture-status", serde_json::json!({ "running": true }));

            let mut frame_count: u64 = 0;

            loop {
                if !CAPTURING.load(Ordering::SeqCst) {
                    break;
                }

                match capture_frame_jpeg() {
                    Ok((frame_b64, w, h)) => {
                        frame_count += 1;
                        log::debug!("[Capture] Frame #{} captured ({}x{} → base64 len={})",
                            frame_count, w, h, frame_b64.len());

                        let _ = app.emit("screen-frame", ScreenFramePayload {
                            session_id: session_id.clone(),
                            frame_b64,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            width: w,
                            height: h,
                            stream_to_students: config.stream_to_students,
                        });
                    }
                    Err(e) => {
                        log::error!("[Capture] Frame capture failed: {}", e);
                        let _ = app.emit("capture-error", CaptureError {
                            message: e.clone(),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        });
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;
            }

            let _ = app.emit("capture-status", serde_json::json!({ "running": false }));
            log::info!("[Capture] Loop exited for session={}", session_id);
        });
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_capture(app: AppHandle) -> Result<(), String> {
    CAPTURING.store(false, Ordering::SeqCst);
    let _ = app.emit("capture-status", serde_json::json!({ "running": false }));
    log::info!("[Capture] Stop requested");
    Ok(())
}

#[tauri::command]
pub async fn capture_test_frame() -> Result<String, String> {
    let (frame_b64, w, h) = capture_frame_jpeg()?;
    log::info!("[Capture] Test frame captured: {}x{} base64_len={}", w, h, frame_b64.len());
    Ok(frame_b64)
}

/// Captures the primary screen, resizes to MAX_FRAME_WIDTH, encodes as JPEG.
/// Returns (base64_jpeg, width_after_resize, height_after_resize).
fn capture_frame_jpeg() -> Result<(String, u32, u32), String> {
    // Get all screens; pick the primary (largest)
    let screens = Screen::all().map_err(|e| format!("Screen::all() failed: {e}"))?;
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    // Pick the screen with the largest area (usually the primary)
    let screen = screens
        .into_iter()
        .max_by_key(|s| {
            let info = s.display_info;
            info.width * info.height
        })
        .ok_or("Could not select a screen")?;

    let raw_image = screen
        .capture()
        .map_err(|e| format!("Screen::capture() failed: {e}"))?;

    // Convert screenshot to DynamicImage for resizing
    let img = DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(raw_image.width(), raw_image.height(), raw_image.into_raw())
            .ok_or("Failed to create RgbaImage from raw bytes")?,
    );

    // Downscale if wider than MAX_FRAME_WIDTH (preserve aspect ratio)
    let (orig_w, orig_h) = (img.width(), img.height());
    let img = if orig_w > MAX_FRAME_WIDTH {
        let scale = MAX_FRAME_WIDTH as f32 / orig_w as f32;
        let new_h = (orig_h as f32 * scale) as u32;
        img.resize(MAX_FRAME_WIDTH, new_h, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let (w, h) = (img.width(), img.height());

    // Encode as JPEG
    let rgb = img.to_rgb8();
    let mut jpeg_bytes: Vec<u8> = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, AI_FRAME_QUALITY);
    encoder
        .encode(&rgb, w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    let b64 = general_purpose::STANDARD.encode(&jpeg_bytes);
    Ok((b64, w, h))
}
```

---

## F2.2 — Rust: update Cargo.toml dependencies

**File:** `wkai/src-tauri/Cargo.toml`

Ensure the `image` dependency has JPEG support enabled:
```toml
image = { version = "0.25", features = ["jpeg", "png", "rgba"] }
```

Also register the new command in `lib.rs` — add `commands::capture::capture_test_frame` to `tauri::generate_handler![]`.

---

## F2.3 — Rust: update `lib.rs` command registration

**File:** `wkai/src-tauri/src/lib.rs`

In `tauri::generate_handler![]`, add `commands::capture::capture_test_frame` and update `commands::capture::stop_capture` (which now takes `AppHandle`):

```rust
.invoke_handler(tauri::generate_handler![
    commands::session::create_session,
    commands::session::end_session,
    commands::session::get_session_status,
    commands::capture::start_capture,
    commands::capture::stop_capture,
    commands::capture::capture_test_frame,   // NEW
    commands::files::watch_folder,
    commands::files::share_file,
    commands::files::list_watched_files,
])
```

---

## F2.4 — Frontend: update `tauri.ts` typed wrappers

**File:** `wkai/src/lib/tauri.ts`

Add:
```ts
export async function captureTestFrame(): Promise<string> {
  return invoke<string>("capture_test_frame");
}
```

Update `stopCapture` signature (now returns void, takes no args from JS side — Tauri passes AppHandle automatically):
```ts
export async function stopCapture(): Promise<void> {
  return invoke("stop_capture");
}
```

---

## F2.5 — Frontend: update Tauri event types

**File:** `wkai/src/hooks/useTauriEvents.ts`

Add a listener for `capture-status` and `capture-error`:
```ts
const unlistenStatus = listen<{ running: boolean }>('capture-status', (event) => {
  setCapture({ isCapturing: event.payload.running });
  addDebugLog(event.payload.running ? 'Screen capture started' : 'Screen capture stopped');
});

const unlistenError = listen<{ message: string; timestamp: string }>('capture-error', (event) => {
  addDebugLog(`[ERROR] Capture: ${event.payload.message}`, 'error');
});
```

Note: `addDebugLog` is defined in F4. For now, add a placeholder:
```ts
// Temporary until F4 debug panel is implemented
function addDebugLog(msg: string, level?: string) {
  console.log(`[WKAI Debug] [${level ?? 'info'}] ${msg}`);
}
```

Also update the `screen-frame` listener to use the new payload shape:
```ts
const unlistenFrame = listen<{
  session_id: string;
  frame_b64: string;
  timestamp: string;
  width: number;
  height: number;
  stream_to_students: boolean;
}>('screen-frame', (event) => {
  setCapture((prev) => ({
    lastFrameAt: event.payload.timestamp,
    aiProcessing: true,
    framesSent: (prev.framesSent ?? 0) + 1,
  }));
  setTimeout(() => setCapture({ aiProcessing: false }), 3000);

  // Forward to WS server — backend decides whether to broadcast to students
  window.dispatchEvent(new CustomEvent('wkai:screen-frame', { detail: event.payload }));
});
```

**File:** `wkai/src/hooks/useWebSocket.ts`

Add a handler for the `wkai:screen-frame` event in the `useEffect`:
```ts
const handleScreenFrame = (e: Event) => {
  const payload = (e as CustomEvent).detail;
  send('screen-frame', {
    frameB64: payload.frame_b64,
    timestamp: payload.timestamp,
    streamToStudents: payload.stream_to_students,
  });
};
window.addEventListener('wkai:screen-frame', handleScreenFrame);
// Add to cleanup: window.removeEventListener('wkai:screen-frame', handleScreenFrame);
```

---

## F2.6 — Backend: forward frame preview to students conditionally

**File:** `wkai-backend/src/ws/server.js`

In `handleScreenFrame`, add after the guide block broadcast loop:
```js
// If instructor chose to stream screen to students, send a low-res preview
if (payload.streamToStudents && payload.frameB64) {
  broadcastToStudents(sessionId, {
    type: 'screen-preview',
    payload: {
      frameB64: payload.frameB64,
      timestamp: new Date().toISOString(),
    },
  });
}
```

**Commit:** `fix(capture): resize+JPEG compression, capture-status events, conditional student stream`

---

### F2 Test Checklist
- [ ] `cargo build` in `wkai/src-tauri/` completes without errors
- [ ] `npm run tauri:dev` opens the window; clicking Start Session does not crash
- [ ] Terminal shows `[Capture] Frame #1 captured ...` within 10s
- [ ] No IPC size errors in the Tauri WebView console
- [ ] `captureTestFrame()` can be called from browser console and returns a non-empty string

---

---

# F3 — LIVE SHARE TOGGLE

**Goal:** The instructor can pause/resume broadcasting frames to students without stopping the capture loop.

---

## F3.1 — Store: add `streamingToStudents` flag

**File:** `wkai/src/store/index.ts`

In `AppStore` interface, add:
```ts
streamingToStudents: boolean;
setStreamingToStudents: (v: boolean) => void;
```

In the `create` call, add:
```ts
streamingToStudents: true,
setStreamingToStudents: (streamingToStudents) => set({ streamingToStudents }),
```

---

## F3.2 — New component: ShareToggle

**File:** `wkai/src/components/instructor/ShareToggle.tsx` (NEW)

```tsx
import { Eye, EyeOff } from "lucide-react";
import { useAppStore } from "../../store";
import { clsx } from "clsx";

export function ShareToggle() {
  const { streamingToStudents, setStreamingToStudents } = useAppStore();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        Screen Sharing
      </p>
      <button
        onClick={() => setStreamingToStudents(!streamingToStudents)}
        className={clsx(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
          streamingToStudents
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
            : "border-wkai-border bg-wkai-bg text-wkai-text-dim hover:border-wkai-text-dim"
        )}
      >
        {streamingToStudents ? <Eye size={13} /> : <EyeOff size={13} />}
        {streamingToStudents ? "Sharing screen" : "Screen hidden from students"}
      </button>
      <p className="text-xs text-wkai-text-dim">
        {streamingToStudents
          ? "Students see a live preview of your screen."
          : "Students only receive guide blocks, not your screen."}
      </p>
    </div>
  );
}
```

---

## F3.3 — Session page: integrate toggle

**File:** `wkai/src/pages/SessionPage.tsx`

Import and add `ShareToggle` inside the left column, between `CaptureStatus` and the file panel:
```tsx
import { ShareToggle } from "../components/instructor/ShareToggle";

// In JSX, between CaptureStatus and FileSharePanel:
<div className="border-b border-wkai-border p-4">
  <ShareToggle />
</div>
```

---

## F3.4 — Propagate toggle to capture events

**File:** `wkai/src/hooks/useWebSocket.ts`

When forwarding the `screen-frame` event, read the store's `streamingToStudents`:
```ts
const handleScreenFrame = (e: Event) => {
  const payload = (e as CustomEvent).detail;
  const { streamingToStudents } = useAppStore.getState();
  send('screen-frame', {
    frameB64: payload.frame_b64,
    timestamp: payload.timestamp,
    streamToStudents: streamingToStudents,
  });
};
```

**Commit:** `feat(capture): live share toggle — instructor can pause student screen preview`

---

---

# F4 — DEBUG LOG PANEL

**Goal:** A collapsible sidebar panel in the instructor app showing connection status, AI status, recording status, and a scrollable log of the last 50 events. This is for development and workshop testing.

---

## F4.1 — Store: add debug log state

**File:** `wkai/src/store/index.ts`

Add to `AppStore` interface:
```ts
debugLogs: DebugLogEntry[];
addDebugLog: (message: string, level?: DebugLogLevel) => void;
clearDebugLogs: () => void;
debugPanelOpen: boolean;
setDebugPanelOpen: (v: boolean) => void;
```

Add types before the interface (or in `types/index.ts`):
```ts
export type DebugLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: DebugLogLevel;
}
```

In the `create` call:
```ts
debugLogs: [],
addDebugLog: (message, level = 'info') =>
  set((s) => ({
    debugLogs: [
      ...s.debugLogs.slice(-49), // keep last 50
      {
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toLocaleTimeString(),
        message,
        level,
      },
    ],
  })),
clearDebugLogs: () => set({ debugLogs: [] }),
debugPanelOpen: false,
setDebugPanelOpen: (debugPanelOpen) => set({ debugPanelOpen }),
```

---

## F4.2 — New component: DebugPanel

**File:** `wkai/src/components/instructor/DebugPanel.tsx` (NEW)

```tsx
import { useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import { X, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import type { DebugLogLevel } from "../../types";

const LEVEL_STYLE: Record<DebugLogLevel, string> = {
  info:    "text-wkai-text-dim",
  warn:    "text-amber-400",
  error:   "text-red-400",
  success: "text-emerald-400",
};

const LEVEL_PREFIX: Record<DebugLogLevel, string> = {
  info:    "INFO",
  warn:    "WARN",
  error:   "ERR ",
  success: "OK  ",
};

export function DebugPanel() {
  const {
    debugLogs, clearDebugLogs, setDebugPanelOpen,
    capture, session, streamingToStudents, studentCount,
  } = useAppStore();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debugLogs]);

  return (
    <div className="flex h-full flex-col border-l border-wkai-border bg-wkai-bg w-72 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-wkai-border px-3 py-2">
        <span className="text-xs font-medium text-wkai-text">Debug Console</span>
        <div className="flex items-center gap-1">
          <button
            onClick={clearDebugLogs}
            className="text-wkai-text-dim hover:text-wkai-text transition-colors p-1"
            title="Clear logs"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => setDebugPanelOpen(false)}
            className="text-wkai-text-dim hover:text-wkai-text transition-colors p-1"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Status indicators */}
      <div className="border-b border-wkai-border px-3 py-2 space-y-1">
        <StatusRow label="WebSocket" value={session ? "Connected" : "Disconnected"} active={!!session} />
        <StatusRow label="Screen capture" value={capture.isCapturing ? "Active" : "Stopped"} active={capture.isCapturing} />
        <StatusRow label="AI processing" value={capture.aiProcessing ? "Running" : "Idle"} active={capture.aiProcessing} />
        <StatusRow label="Stream to students" value={streamingToStudents ? "On" : "Off"} active={streamingToStudents} />
        <StatusRow label="Students online" value={String(studentCount)} active={studentCount > 0} />
        <StatusRow label="Frames sent" value={String(capture.framesSent ?? 0)} active={true} />
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto px-2 py-2 font-mono text-xs space-y-0.5">
        {debugLogs.length === 0 ? (
          <p className="text-wkai-text-dim text-center py-4">No log entries yet</p>
        ) : (
          debugLogs.map((log) => (
            <div key={log.id} className={clsx("flex gap-2 leading-5", LEVEL_STYLE[log.level])}>
              <span className="shrink-0 text-wkai-text-dim/50">{log.timestamp}</span>
              <span className="shrink-0">{LEVEL_PREFIX[log.level]}</span>
              <span className="break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function StatusRow({
  label, value, active,
}: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-wkai-text-dim">{label}</span>
      <span className={clsx("flex items-center gap-1.5", active ? "text-emerald-400" : "text-wkai-text-dim")}>
        <span className={clsx("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-400" : "bg-gray-600")} />
        {value}
      </span>
    </div>
  );
}
```

---

## F4.3 — AppShell: add debug panel toggle button and render panel

**File:** `wkai/src/components/shared/AppShell.tsx`

Add the debug toggle button to the sidebar:
```tsx
import { Bug } from "lucide-react";
import { DebugPanel } from "../instructor/DebugPanel";

// In sidebar, after the flex-1 spacer:
<button
  title="Debug Console"
  onClick={() => useAppStore.getState().setDebugPanelOpen(
    !useAppStore.getState().debugPanelOpen
  )}
  className={clsx(
    "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
    useAppStore().debugPanelOpen
      ? "bg-amber-500/20 text-amber-400"
      : "text-wkai-text-dim hover:bg-wkai-border hover:text-wkai-text"
  )}
>
  <Bug size={18} />
</button>
```

In the main layout div, add the debug panel as a sibling to the flex-1 column:
```tsx
<div className="flex h-full w-full bg-wkai-bg text-wkai-text">
  {/* Sidebar */}
  <aside ...>...</aside>

  {/* Main content */}
  <div className="flex flex-1 flex-col overflow-hidden">
    ...
    <main ...><Outlet /></main>
  </div>

  {/* Debug panel — conditionally rendered */}
  {debugPanelOpen && <DebugPanel />}
</div>
```

---

## F4.4 — Wire addDebugLog into all existing hooks

**File:** `wkai/src/hooks/useTauriEvents.ts`

Replace the placeholder `addDebugLog` with the real store action:
```ts
const { setCapture, settings, addDebugLog } = useAppStore();
```

Use it throughout:
```ts
// In screen-frame listener:
addDebugLog(`Frame captured ${event.payload.width}x${event.payload.height}`);

// In audio-chunk listener:
addDebugLog(`Audio chunk received, transcribing...`);
// After transcription:
addDebugLog(`Transcript: "${transcript.slice(0, 60)}..."`, 'success');

// In capture-error listener:
addDebugLog(`Capture error: ${event.payload.message}`, 'error');

// In capture-status listener:
addDebugLog(event.payload.running ? 'Screen capture started' : 'Screen capture stopped',
  event.payload.running ? 'success' : 'warn');
```

**File:** `wkai/src/hooks/useWebSocket.ts`

Import and use `addDebugLog`:
```ts
const { addDebugLog, ... } = useAppStore();

// In ws.onopen:
addDebugLog('WebSocket connected to backend', 'success');

// In ws.onclose:
addDebugLog('WebSocket disconnected, retrying in 3s', 'warn');

// In ws.onmessage for each message type:
addDebugLog(`WS received: ${msg.type}`);

// For guide-block specifically:
addDebugLog(`New guide block: [${(msg.payload as any).type}] ${(msg.payload as any).title ?? ''}`, 'success');
```

**Commit:** `feat(debug): collapsible debug console panel with real-time logs and status indicators`

---

---

# F5 — STUDENT NAME + STUDENT LIST PANEL

**Goal:** Students enter their name on the join page. Instructor sees a toast when each student joins and a persistent list panel showing all connected students.

---

## F5.1 — Student app: add name input to JoinPage

**File:** `wkai-student/src/pages/JoinPage.tsx`

Add a name field above the code input boxes:
```tsx
const [studentName, setStudentName] = useState(
  sessionStorage.getItem('wkai_student_name') ?? ''
);
```

In JSX, before the 6-char code input:
```tsx
<div className="w-full max-w-xs mb-6">
  <input
    className="input text-center"
    placeholder="Your name"
    value={studentName}
    onChange={(e) => setStudentName(e.target.value)}
    maxLength={40}
  />
</div>
```

Before navigating, save the name:
```tsx
async function handleJoin() {
  if (!isComplete) return;
  if (!studentName.trim()) {
    setError("Please enter your name before joining.");
    return;
  }
  sessionStorage.setItem('wkai_student_name', studentName.trim());
  // ... rest of existing join logic
}
```

---

## F5.2 — Student app: pass name in WebSocket URL

**File:** `wkai-student/src/hooks/useRoomSocket.ts`

Update the WS URL to include the student's name:
```ts
const studentName = encodeURIComponent(
  sessionStorage.getItem('wkai_student_name') ?? 'Student'
);
const url = `${BACKEND_WS}/ws?session=${roomCode}&role=student&studentId=${studentId}&studentName=${studentName}`;
```

---

## F5.3 — Backend: extract and store student name

**File:** `wkai-backend/src/ws/server.js`

In the connection handler, extract `studentName`:
```js
const studentName = typeof qs.studentName === 'string' && qs.studentName.length > 0
  ? decodeURIComponent(qs.studentName).slice(0, 40)
  : `Student`;
```

Attach to the WebSocket object:
```js
ws.studentName = studentName;
```

Update the `student-joined` broadcast to include the name:
```js
if (role === 'student' && previousSocket !== ws) {
  const count = await incrementStudentCount(sessionId, studentId);
  broadcast(sessionId, {
    type: 'student-joined',
    payload: { count, studentId, studentName },
  }, ws);
  // Also update the in-memory student list in Redis
  await addStudentToList(sessionId, { studentId, studentName });
}
```

Update `student-left` similarly:
```js
if (role === 'student') {
  const count = await decrementStudentCount(sessionId, studentId);
  broadcast(sessionId, {
    type: 'student-left',
    payload: { count, studentId, studentName: ws.studentName ?? 'Student' },
  });
  await removeStudentFromList(sessionId, studentId);
}
```

**File:** `wkai-backend/src/db/redis.js`

Add student list helpers:
```js
export async function addStudentToList(sessionId, { studentId, studentName }) {
  const key = `student_list:${sessionId}`;
  const existing = JSON.parse(await redis.get(key) ?? '[]');
  const updated = [...existing.filter(s => s.studentId !== studentId),
                   { studentId, studentName, joinedAt: new Date().toISOString() }];
  await redis.setEx(key, 86_400, JSON.stringify(updated));
}

export async function removeStudentFromList(sessionId, studentId) {
  const key = `student_list:${sessionId}`;
  const existing = JSON.parse(await redis.get(key) ?? '[]');
  await redis.setEx(key, 86_400, JSON.stringify(existing.filter(s => s.studentId !== studentId)));
}

export async function getStudentList(sessionId) {
  const raw = await redis.get(`student_list:${sessionId}`);
  return raw ? JSON.parse(raw) : [];
}
```

Import `addStudentToList`, `removeStudentFromList`, `getStudentList` in `ws/server.js`.

When a new student connects, send them the current student list in session-state:
```js
// In the initial session-state send:
const studentList = await getStudentList(sessionId);
if (state) ws.send(JSON.stringify({
  type: 'session-state',
  payload: { ...state, studentList },
}));
```

---

## F5.4 — Instructor store: student list state

**File:** `wkai/src/store/index.ts`

Add to `AppStore`:
```ts
students: StudentInfo[];
setStudents: (s: StudentInfo[]) => void;
addStudent: (s: StudentInfo) => void;
removeStudent: (studentId: string) => void;
```

Add type (in `types/index.ts`):
```ts
export interface StudentInfo {
  studentId: string;
  studentName: string;
  joinedAt: string;
}
```

In the `create` call:
```ts
students: [],
setStudents: (students) => set({ students }),
addStudent: (s) => set((state) => ({
  students: [...state.students.filter(x => x.studentId !== s.studentId), s],
})),
removeStudent: (studentId) => set((state) => ({
  students: state.students.filter(s => s.studentId !== studentId),
})),
```

---

## F5.5 — Instructor WebSocket: handle student joined/left with name

**File:** `wkai/src/hooks/useWebSocket.ts`

Update the `student-joined` and `student-left` handlers:
```ts
case 'student-joined': {
  const p = msg.payload as { count: number; studentId: string; studentName: string };
  setStudentCount(p.count);
  addStudent({ studentId: p.studentId, studentName: p.studentName, joinedAt: new Date().toISOString() });
  addDebugLog(`Student joined: ${p.studentName}`, 'success');
  // Emit toast event
  window.dispatchEvent(new CustomEvent('wkai:student-joined', { detail: p }));
  break;
}
case 'student-left': {
  const p = msg.payload as { count: number; studentId: string; studentName: string };
  setStudentCount(p.count);
  removeStudent(p.studentId);
  addDebugLog(`Student left: ${p.studentName}`, 'warn');
  break;
}
```

---

## F5.6 — New component: StudentJoinToast

**File:** `wkai/src/components/instructor/StudentJoinToast.tsx` (NEW)

```tsx
import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";

interface ToastItem {
  id: string;
  studentName: string;
}

export function StudentJoinToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { studentName } = (e as CustomEvent).detail;
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, studentName }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    window.addEventListener('wkai:student-joined', handler);
    return () => window.removeEventListener('wkai:student-joined', handler);
  }, []);

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-wkai-surface px-4 py-3 shadow-xl animate-slide-up"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15">
            <UserCheck size={14} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-wkai-text">{t.studentName}</p>
            <p className="text-xs text-wkai-text-dim">joined the session</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## F5.7 — New component: StudentPanel

**File:** `wkai/src/components/instructor/StudentPanel.tsx` (NEW)

```tsx
import { useAppStore } from "../../store";
import { Users } from "lucide-react";

export function StudentPanel() {
  const { students, studentCount } = useAppStore();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
          Students
        </p>
        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400">
          {studentCount}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-wkai-text-dim">
            <Users size={18} />
            <p className="text-xs">No students yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {students.map((s) => (
              <div
                key={s.studentId}
                className="flex items-center gap-2 rounded-lg px-2 py-2"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-medium text-indigo-400">
                  {s.studentName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs text-wkai-text">{s.studentName}</p>
                  <p className="text-xs text-wkai-text-dim">
                    {new Date(s.joinedAt).toLocaleTimeString([], {
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## F5.8 — SessionPage: integrate student panel and toast

**File:** `wkai/src/pages/SessionPage.tsx`

Add the student panel as a third tab in the left column, and include the toast component:
```tsx
import { StudentPanel } from "../components/instructor/StudentPanel";
import { StudentJoinToast } from "../components/instructor/StudentJoinToast";
import { useState } from "react";

// State for left column tab
const [leftTab, setLeftTab] = useState<'files' | 'students'>('files');

// Replace FileSharePanel section with a tabbed panel:
<div className="flex border-b border-wkai-border">
  {(['files', 'students'] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setLeftTab(tab)}
      className={clsx(
        "flex-1 py-2 text-xs font-medium capitalize transition-colors",
        leftTab === tab
          ? "border-b-2 border-indigo-400 text-indigo-400"
          : "text-wkai-text-dim hover:text-wkai-text"
      )}
    >
      {tab === 'students' ? `Students (${studentCount})` : 'Files'}
    </button>
  ))}
</div>
<div className="flex-1 overflow-hidden">
  {leftTab === 'files' && <FileSharePanel sessionId={session.id} send={send} />}
  {leftTab === 'students' && <StudentPanel />}
</div>

// At the bottom of return, before closing div:
<StudentJoinToast />
```

**Commit:** `feat(students): name on join, student list panel, join toast notification`

---

---

# F6 — INSTRUCTOR LEAVE TRIGGERS STUDENT DISCONNECT MODAL

**Goal:** When the instructor ends a session or closes the app, students on the RoomPage see a modal (not just a banner) indicating the session has ended.

---

## F6.1 — New component: SessionEndedModal (replace banner behaviour)

**File:** `wkai-student/src/components/shared/SessionEndedModal.tsx` (NEW)

```tsx
import { useNavigate } from "react-router-dom";
import { LogOut, BookOpen } from "lucide-react";
import { useStore } from "../../store";

export function SessionEndedModal() {
  const navigate = useNavigate();
  const { guideBlocks } = useStore();

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-wkai-border bg-wkai-surface shadow-2xl space-y-6 p-6 animate-slide-up">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <BookOpen size={22} className="text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-wkai-text">Session Ended</h2>
          <p className="text-sm text-wkai-text-dim">
            The instructor has ended this session. Your guide has been saved below.
          </p>
        </div>

        <div className="rounded-lg bg-wkai-bg border border-wkai-border p-3 text-center">
          <p className="text-xs text-wkai-text-dim">
            {guideBlocks.length} guide block{guideBlocks.length !== 1 ? "s" : ""} recorded
          </p>
        </div>

        <div className="flex gap-3">
          <button
            className="btn-ghost flex-1 justify-center border border-wkai-border"
            onClick={() => {
              // Dismiss modal but stay on page to view guide
              useStore.getState().setSessionEnded(true);
              // The modal is shown when sessionEnded && !modalDismissed
              // We need a local state for this — see F6.2
            }}
          >
            View Guide
          </button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => navigate("/")}
          >
            <LogOut size={14} />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## F6.2 — RoomPage: show modal on session end

**File:** `wkai-student/src/pages/RoomPage.tsx`

Add local state:
```tsx
const [endedModalDismissed, setEndedModalDismissed] = useState(false);
```

In JSX, add before the closing div:
```tsx
{sessionEnded && !endedModalDismissed && (
  <SessionEndedModal onDismiss={() => setEndedModalDismissed(true)} />
)}
```

Update `SessionEndedModal` to accept `onDismiss` prop and call it in "View Guide":
```tsx
interface Props { onDismiss: () => void; }
export function SessionEndedModal({ onDismiss }: Props) {
  // Replace the dismiss button handler:
  onClick={onDismiss}
}
```

**Commit:** `feat(session): instructor leave triggers full-screen ended modal for students`

---

---

# F7 — LIVE SCREEN PREVIEW IN STUDENT APP

**Goal:** Students can see a real-time (low-res) preview of the instructor's screen in a new "Live" tab, updated every time a new frame arrives via WebSocket.

---

## F7.1 — Student types: add screen-preview WS event

**File:** `wkai-student/src/types/index.ts`

Add to `WsEventType`:
```ts
| "screen-preview"
```

---

## F7.2 — Student store: screen preview state

**File:** `wkai-student/src/store/index.ts`

Add to `StudentStore`:
```ts
screenPreview: string | null;  // base64 JPEG
screenPreviewTs: string | null;
setScreenPreview: (b64: string, ts: string) => void;
```

In create:
```ts
screenPreview: null,
screenPreviewTs: null,
setScreenPreview: (screenPreview, screenPreviewTs) => set({ screenPreview, screenPreviewTs }),
```

---

## F7.3 — Student socket: dispatch screen preview

**File:** `wkai-student/src/hooks/useRoomSocket.ts`

In `dispatch()`:
```ts
case 'screen-preview': {
  const p = msg.payload as { frameB64: string; timestamp: string };
  useStore.getState().setScreenPreview(p.frameB64, p.timestamp);
  break;
}
```

---

## F7.4 — New component: ScreenPreview

**File:** `wkai-student/src/components/guide/ScreenPreview.tsx` (NEW)

```tsx
import { useStore } from "../../store";
import { Monitor } from "lucide-react";

export function ScreenPreview() {
  const { screenPreview, screenPreviewTs, session } = useStore();

  if (!screenPreview) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-wkai-text-dim">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
          <Monitor size={28} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-wkai-text">No screen preview</p>
          <p className="text-xs">
            {session?.status === 'ended'
              ? 'The session has ended.'
              : 'The instructor has not enabled screen sharing.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
          <p className="text-xs font-medium text-wkai-text">Live Screen</p>
        </div>
        {screenPreviewTs && (
          <p className="text-xs text-wkai-text-dim">
            {new Date(screenPreviewTs).toLocaleTimeString()}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto flex items-start justify-center p-3">
        <img
          src={`data:image/jpeg;base64,${screenPreview}`}
          alt="Instructor screen"
          className="rounded-lg border border-wkai-border max-w-full h-auto shadow-lg"
        />
      </div>
    </div>
  );
}
```

---

## F7.5 — Student TabBar: add Live tab

**File:** `wkai-student/src/types/index.ts`

Add `"live"` to `RoomTab`:
```ts
export type RoomTab = "guide" | "files" | "editor" | "error" | "live";
```

**File:** `wkai-student/src/components/shared/TabBar.tsx`

Add to `TABS` array:
```ts
import { Monitor } from "lucide-react";
{ id: "live",   label: "Live",    icon: <Monitor size={14} /> },
```

**File:** `wkai-student/src/pages/RoomPage.tsx`

Add to the tab panel:
```tsx
import { ScreenPreview } from "../components/guide/ScreenPreview";
// In JSX:
{activeTab === "live" && <ScreenPreview />}
```

**Commit:** `feat(preview): live screen preview tab in student app`

---

---

# F8 — STUDENT-TO-INSTRUCTOR MESSAGING WITH AI FALLBACK

**Goal:** Students can send text messages to the instructor. The instructor sees them in a dedicated panel. If the instructor does not reply within 45 seconds, a LangGraph agent automatically sends a helpful response.

---

## F8.1 — New WS message types

**File:** `wkai-student/src/types/index.ts`

Add to `WsEventType`:
```ts
| "student-message"
| "instructor-reply"
| "ai-reply"
```

**File:** `wkai/src/types/index.ts`

Add to `WsEventType`:
```ts
| "student-message"
| "instructor-reply"
| "ai-reply"
```

---

## F8.2 — Backend: new LangGraph message agent

**File:** `wkai-backend/src/ai/graphs/messageAgent.js` (NEW)

```js
import { StateGraph, END, START } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { textLLM } from "../groqClient.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getSessionMemory } from "../memory.js";

const MessageAgentState = Annotation.Root({
  sessionId:    Annotation({ reducer: (_, v) => v }),
  studentName:  Annotation({ reducer: (_, v) => v }),
  message:      Annotation({ reducer: (_, v) => v }),
  sessionContext: Annotation({ reducer: (_, v) => v, default: () => "" }),
  response:     Annotation({ reducer: (_, v) => v, default: () => null }),
});

const messagePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are WKAI, an AI teaching assistant embedded in a live coding workshop.
A student has asked a question that the instructor has not yet answered.
Your job is to answer clearly, briefly, and helpfully based on the current workshop context.

Current workshop session context (what has been taught so far):
{session_context}

Rules:
- Be concise. Maximum 3 sentences.
- Never say you are an AI unless directly asked.
- If the question is unrelated to the session, gently redirect.
- Do not hallucinate — if you do not know, say so and suggest asking the instructor.`,
  ],
  ["human", "Student {student_name} asks: {message}"],
]);

async function loadContextNode(state) {
  const memory = getSessionMemory(state.sessionId);
  const sessionContext = await memory.getContextString();
  return { sessionContext };
}

async function generateResponseNode(state) {
  try {
    const chain = messagePrompt.pipe(textLLM);
    const res = await chain.invoke({
      session_context: state.sessionContext || "No prior context — session just started.",
      student_name:    state.studentName,
      message:         state.message,
    });
    return { response: res.content?.trim() ?? null };
  } catch (err) {
    console.error("[MessageAgent] Error:", err.message);
    return { response: "I was unable to process your question. Please ask the instructor directly." };
  }
}

const workflow = new StateGraph(MessageAgentState)
  .addNode("load_context",       loadContextNode)
  .addNode("generate_response",  generateResponseNode)
  .addEdge(START,             "load_context")
  .addEdge("load_context",    "generate_response")
  .addEdge("generate_response", END);

export const messageAgentGraph = workflow.compile();

/**
 * Generate an AI response to a student question.
 * Called after a timeout if the instructor hasn't replied.
 *
 * @param {string} sessionId
 * @param {string} studentName
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function generateMessageResponse(sessionId, studentName, message) {
  const result = await messageAgentGraph.invoke({ sessionId, studentName, message });
  return result.response ?? "I was unable to process your question right now.";
}
```

---

## F8.3 — Backend: handle student-message and instructor-reply WS events

**File:** `wkai-backend/src/ws/server.js`

Add to the `switch` statement in `ws.on('message', ...)`:
```js
case 'student-message':
  await handleStudentMessage(ws, msg.payload);
  break;
case 'instructor-reply':
  if (ws.role !== 'instructor') break;
  handleInstructorReply(ws, msg.payload);
  break;
```

Add handler functions:

```js
// Pending student messages: Map<questionId, { timer, studentClientKey }>
const pendingStudentMessages = new Map();

async function handleStudentMessage(ws, payload) {
  const { sessionId, studentId, studentName } = ws;
  const { message, messageId } = payload;

  if (!message?.trim() || !messageId) return;

  // Broadcast message to instructor
  const instructorWs = rooms.get(sessionId)?.get('instructor');
  if (instructorWs?.readyState === 1 /* OPEN */) {
    instructorWs.send(JSON.stringify({
      type: 'student-message',
      payload: { messageId, studentId, studentName, message, timestamp: new Date().toISOString() },
    }));
  }

  // Start 45-second AI fallback timer
  const timer = setTimeout(async () => {
    if (!pendingStudentMessages.has(messageId)) return;
    pendingStudentMessages.delete(messageId);

    try {
      const { generateMessageResponse } = await import('../ai/graphs/messageAgent.js');
      const response = await generateMessageResponse(sessionId, studentName ?? 'Student', message);

      ws.send(JSON.stringify({
        type: 'ai-reply',
        payload: { messageId, response, timestamp: new Date().toISOString() },
      }));
    } catch (err) {
      console.error('[MessageAgent] Fallback failed:', err.message);
    }
  }, 45_000);

  pendingStudentMessages.set(messageId, { timer, studentClientKey: ws.clientKey });
}

function handleInstructorReply(ws, payload) {
  const { sessionId } = ws;
  const { messageId, reply, studentId } = payload;

  // Cancel the AI fallback timer
  const pending = pendingStudentMessages.get(messageId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingStudentMessages.delete(messageId);
  }

  // Send reply to the specific student
  const studentWs = rooms.get(sessionId)?.get(`student:${studentId}`);
  if (studentWs?.readyState === 1) {
    studentWs.send(JSON.stringify({
      type: 'instructor-reply',
      payload: { messageId, reply, timestamp: new Date().toISOString() },
    }));
  }
}
```

---

## F8.4 — Student app: messaging UI

**File:** `wkai-student/src/types/index.ts`

Add:
```ts
export interface ChatMessage {
  id: string;
  role: 'student' | 'instructor' | 'ai';
  text: string;
  timestamp: string;
  pending?: boolean;
}
```

**File:** `wkai-student/src/store/index.ts`

Add to `StudentStore`:
```ts
chatMessages: ChatMessage[];
addChatMessage: (m: ChatMessage) => void;
updateChatMessage: (id: string, update: Partial<ChatMessage>) => void;
```

In create:
```ts
chatMessages: [],
addChatMessage: (m) => set((s) => ({ chatMessages: [...s.chatMessages, m] })),
updateChatMessage: (id, update) => set((s) => ({
  chatMessages: s.chatMessages.map(m => m.id === id ? { ...m, ...update } : m),
})),
```

**File:** `wkai-student/src/hooks/useRoomSocket.ts`

Handle new message types in `dispatch`:
```ts
case 'instructor-reply':
case 'ai-reply': {
  const p = msg.payload as { messageId: string; reply?: string; response?: string; timestamp: string };
  const text = p.reply ?? p.response ?? '';
  useStore.getState().updateChatMessage(p.messageId, { pending: false });
  useStore.getState().addChatMessage({
    id: `${p.messageId}-reply`,
    role: msg.type === 'ai-reply' ? 'ai' : 'instructor',
    text,
    timestamp: p.timestamp,
  });
  break;
}
```

**New file:** `wkai-student/src/components/messages/MessagePanel.tsx` (NEW)

```tsx
import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store";
import { Send, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import type { ChatMessage } from "../../types";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function MessagePanel({ send }: Props) {
  const { chatMessages, addChatMessage, studentId, session } = useStore();
  const studentName = sessionStorage.getItem('wkai_student_name') ?? 'Student';
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  function handleSend() {
    if (!text.trim()) return;
    const messageId = `${studentId}_${Date.now()}`;

    const msg: ChatMessage = {
      id: messageId,
      role: 'student',
      text: text.trim(),
      timestamp: new Date().toISOString(),
      pending: true,
    };
    addChatMessage(msg);
    send('student-message', {
      messageId,
      message: text.trim(),
      sessionId: session?.id,
    });
    setText('');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim">
          Ask a Question
        </p>
        <p className="text-xs text-wkai-text-dim mt-0.5">
          Your question will be seen by the instructor. If they are busy, the AI will respond within 45 seconds.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chatMessages.length === 0 ? (
          <p className="text-center text-xs text-wkai-text-dim py-8">
            No messages yet. Ask a question.
          </p>
        ) : (
          chatMessages.map((m) => <MessageBubble key={m.id} msg={m} studentName={studentName} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-wkai-border p-3 flex gap-2">
        <textarea
          className="input resize-none text-sm flex-1 h-20"
          placeholder="Type your question..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="btn-primary self-end"
          onClick={handleSend}
          disabled={!text.trim()}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, studentName }: { msg: ChatMessage; studentName: string }) {
  const isStudent = msg.role === 'student';
  const isAi = msg.role === 'ai';

  return (
    <div className={clsx("flex flex-col", isStudent ? "items-end" : "items-start")}>
      <p className="text-xs text-wkai-text-dim mb-1 px-1">
        {isStudent ? studentName : isAi ? "AI Assistant" : "Instructor"}
      </p>
      <div className={clsx(
        "max-w-xs rounded-xl px-4 py-2.5 text-sm",
        isStudent
          ? "bg-indigo-500 text-white rounded-br-sm"
          : isAi
          ? "border border-amber-500/30 bg-amber-500/5 text-wkai-text rounded-bl-sm"
          : "border border-wkai-border bg-wkai-surface text-wkai-text rounded-bl-sm"
      )}>
        {msg.pending ? (
          <span className="flex items-center gap-2 text-xs opacity-70">
            <Loader2 size={12} className="animate-spin" />
            Sending...
          </span>
        ) : msg.text}
      </div>
    </div>
  );
}
```

---

## F8.5 — Student app: add Messages tab

**File:** `wkai-student/src/types/index.ts`

Add `"messages"` to `RoomTab`.

**File:** `wkai-student/src/components/shared/TabBar.tsx`

Add `{ id: "messages", label: "Q&A", icon: <MessageSquare size={14} /> }` (import `MessageSquare` from lucide-react).

**File:** `wkai-student/src/pages/RoomPage.tsx`

```tsx
import { MessagePanel } from "../components/messages/MessagePanel";
// In JSX:
{activeTab === "messages" && <MessagePanel send={send} />}
```

---

## F8.6 — Instructor app: message inbox

**File:** `wkai/src/store/index.ts`

Add:
```ts
inboxMessages: InstructorMessage[];
addInboxMessage: (m: InstructorMessage) => void;
```

```ts
export interface InstructorMessage {
  messageId: string;
  studentId: string;
  studentName: string;
  message: string;
  timestamp: string;
  replied: boolean;
}
```

**File:** `wkai/src/hooks/useWebSocket.ts`

Handle `student-message`:
```ts
case 'student-message': {
  const p = msg.payload as InstructorMessage;
  addInboxMessage(p);
  addDebugLog(`Message from ${p.studentName}: ${p.message.slice(0, 60)}`, 'info');
  window.dispatchEvent(new CustomEvent('wkai:student-message', { detail: p }));
  break;
}
```

**New file:** `wkai/src/components/instructor/InboxPanel.tsx` (NEW — similar structure to StudentPanel but for messages; instructor can type a reply and click Send, which sends `instructor-reply` via WS)

Add this panel as a tab in `SessionPage.tsx` alongside Files and Students.

**Commit:** `feat(messaging): student Q&A panel with 45s AI fallback via LangGraph messageAgent`

---

---

# F9 — MIC TEST AND AI CONNECTION TEST

**Goal:** In the instructor Settings page, add: (1) a microphone level meter to verify the mic is working, (2) an AI test that sends a synthetic frame + test phrase and displays the response in the debug panel.

---

## F9.1 — Mic test component

**File:** `wkai/src/components/instructor/MicTest.tsx` (NEW)

```tsx
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

export function MicTest() {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function startTest() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      setTesting(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, (avg / 128) * 100));
        animRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch {
      setLevel(0);
    }
  }

  function stopTest() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setTesting(false);
    setLevel(0);
  }

  useEffect(() => () => stopTest(), []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-wkai-text">Microphone Test</span>
        <button
          className={testing ? "btn-ghost border border-wkai-border text-xs" : "btn-primary text-xs py-1.5"}
          onClick={testing ? stopTest : startTest}
        >
          {testing ? <><MicOff size={12} /> Stop</> : <><Mic size={12} /> Test Mic</>}
        </button>
      </div>

      {testing && (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-wkai-border overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all duration-75"
              style={{ width: `${level}%` }}
            />
          </div>
          <p className="text-xs text-wkai-text-dim">
            {level > 10 ? "Microphone is working." : "No audio detected. Speak or check your mic settings."}
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## F9.2 — AI connection test

**File:** `wkai/src/components/instructor/AITest.tsx` (NEW)

```tsx
import { useState } from "react";
import { Zap, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useAppStore } from "../../store";
import { captureTestFrame } from "../../lib/tauri";

export function AITest() {
  const { settings, addDebugLog } = useAppStore();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [message, setMessage] = useState('');

  async function runTest() {
    setTesting(true);
    setResult(null);
    setMessage('');
    addDebugLog('AI test started...', 'info');

    try {
      // Step 1: capture a test frame
      addDebugLog('Capturing test frame from screen...', 'info');
      const frameB64 = await captureTestFrame();
      addDebugLog(`Test frame captured (base64 length: ${frameB64.length})`, 'success');

      // Step 2: send a POST to the transcribe endpoint with a synthetic message
      addDebugLog('Sending test to AI pipeline...', 'info');
      const res = await fetch(`${settings.backendUrl}/api/ai/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorMessage: 'TEST_PROBE: Hello, this is an AI connectivity test. Please confirm you are operational.',
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      addDebugLog(`AI responded: ${data.diagnosis?.slice(0, 80) ?? 'no diagnosis'}`, 'success');
      setResult('success');
      setMessage('AI pipeline is operational and responding.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addDebugLog(`AI test failed: ${msg}`, 'error');
      setResult('error');
      setMessage(`Test failed: ${msg}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-wkai-text">AI Connection Test</span>
        <button
          className="btn-primary text-xs py-1.5"
          onClick={runTest}
          disabled={testing}
        >
          {testing
            ? <><Loader2 size={12} className="animate-spin" /> Testing...</>
            : <><Zap size={12} /> Test AI</>
          }
        </button>
      </div>

      {result && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
          result === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
            : 'border-red-500/30 bg-red-500/5 text-red-300'
        }`}>
          {result === 'success'
            ? <CheckCircle size={13} className="shrink-0 mt-0.5" />
            : <XCircle size={13} className="shrink-0 mt-0.5" />
          }
          {message}
        </div>
      )}

      <p className="text-xs text-wkai-text-dim">
        Captures a test frame and calls the AI pipeline. Check the debug console for details.
      </p>
    </div>
  );
}
```

---

## F9.3 — Integrate into SettingsPage

**File:** `wkai/src/pages/SettingsPage.tsx`

Add an "Audio & AI Test" section at the bottom, above the Save button:
```tsx
import { MicTest } from "../components/instructor/MicTest";
import { AITest } from "../components/instructor/AITest";

{/* Audio & AI Testing */}
<section className="card space-y-5 p-4">
  <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
    Testing
  </h2>
  <MicTest />
  <div className="border-t border-wkai-border pt-4">
    <AITest />
  </div>
</section>
```

**Commit:** `feat(settings): microphone level test and AI connectivity test`

---

---

# F10 — TOKEN USAGE OPTIMIZATIONS

**Goal:** Reduce token consumption without degrading output quality. Primary wins: shorter system prompts, smaller session context window, reducing `maxTokens` where appropriate.

---

## F10.1 — Screen pipeline: tighter system prompt

**File:** `wkai-backend/src/ai/prompts.js`

Replace the `screenAnalysisPrompt` system message with a tighter version:
```js
// BEFORE (verbose): ~180 tokens
// AFTER (tight):    ~90 tokens

`You are WKAI, a silent workshop AI. Analyze the instructor's screen.

Session taught so far: {session_context}

Rules:
- isInstructional: false for idle/browser/desktop screens
- Only emit NEW content not already in session context
- 1–3 guide blocks max, beginner-friendly
- Extract EXACT code — never paraphrase
- comprehensionQuestion only after a major concept completes
- Never hallucinate content

{format_instructions}`
```

---

## F10.2 — Screen pipeline: limit session context to 4 messages

**File:** `wkai-backend/src/ai/memory.js`

In `getContextString`, change `slice(-8)` to `slice(-4)`:
```js
.slice(-4) // last 4 messages — enough context, fewer tokens
```

---

## F10.3 — Groq client: reduce max tokens

**File:** `wkai-backend/src/ai/groqClient.js`

Update `maxTokens` values:
```js
// Vision model — guide blocks are rarely long
export const visionLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "meta-llama/llama-4-scout-17b-16e-instruct",
  temperature: 0.2,
  maxTokens:   1024,  // was 1500
});

// Text model — diagnoses and answers are short
export const textLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "llama3-70b-8192",
  temperature: 0.1,
  maxTokens:   600,   // was 800
});

// Creative LLM — question refinement only
export const creativeLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "llama3-70b-8192",
  temperature: 0.6,
  maxTokens:   300,   // was 400
});
```

---

## F10.4 — Intent agent: increase heuristic threshold

**File:** `wkai-backend/src/ai/graphs/intentAgent.js`

Change confidence threshold from `0.6` to `0.7` to avoid unnecessary LLM calls:
```js
if (state.confidence < 0.7) return "done";
```

**Commit:** `perf(ai): reduce token usage — tighter prompts, 4-message context, lower maxTokens`

---

---

# F11 — UI POLISH PASS

**Goal:** Remove all emojis from UI text, ensure consistent professional appearance, fix spacing inconsistencies.

---

## F11.1 — Remove emojis from student app

Search all files under `wkai-student/src/` for emoji characters. Files known to contain emojis:

**`wkai-student/src/components/error/ErrorHelper.tsx`**
- Change `"WKAI Debug"` console log references (internal, fine)
- Remove any emoji from placeholder text in the textarea:
  - Remove the `Example:\nModuleNotFoundError...` placeholder lines that contain no emojis (already clean)
- Check `ResolutionCard`: `"If the fix doesn't work, ask your instructor for help."` — clean

**`wkai-student/src/components/guide/GuideFeed.tsx`**
- EmptyState: remove any emoji characters from text

**`wkai-student/src/components/files/FilesPanel.tsx`**
- All text is clean — verify no emoji in download button label

**`wkai-backend/src/routes/runner.js`**
- Change: `"⏱ Execution timed out..."` → `"Execution timed out after ${timeoutMs / 1000}s"`
- Change: `"(no output)"` — clean

Run this grep in the terminal to find all emoji in src files:
```bash
grep -rn --include="*.tsx" --include="*.ts" --include="*.js" \
  '[^\x00-\x7F]' wkai-student/src wkai/src wkai-backend/src \
  | grep -v "node_modules" | grep -v ".d.ts"
```

Fix every match that is a UI-facing string.

---

## F11.2 — Consistent error message tone

All error messages and empty states must use declarative, professional language:

Replace | With
--- | ---
"Paste your terminal error" | "Paste terminal output here"
"AI will diagnose and fix it." | "The AI will analyse the error and suggest a fix."
"No files yet" | "No files have been shared"
"Listening for content..." | "Waiting for session content"

---

## F11.3 — Button labels without gerunds where possible

Replace | With
--- | ---
"Diagnosing..." | "Analysing..."
"Sharing..." | "Uploading..."
"Ending..." | "Closing session..."

---

## F11.4 — Session ended banner (already has a modal from F6) — remove the old banner component

**File:** `wkai-student/src/pages/RoomPage.tsx`

Remove `import { SessionEndedBanner }` and its usage. The modal from F6 handles this.

**Commit:** `style(ui): remove emojis, professional tone, consistent labels`

---

---

## FINAL INTEGRATION CHECKLIST

Run these checks in order after all features are implemented:

### Type Safety
```bash
cd wkai && npx tsc --noEmit
cd wkai-student && npx tsc --noEmit
```
Both must exit with 0 errors.

### Rust Build
```bash
cd wkai/src-tauri && cargo check
cargo build --release 2>&1 | tail -20
```
Must compile without errors.

### Backend Health
```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/network-info
```

### WebSocket
```bash
# Install wscat: npm i -g wscat
wscat -c "ws://localhost:4000/ws?session=TEST&role=student&studentId=test1&studentName=Tester"
# Should receive: {"type":"error","payload":{"message":"Room not found or ended"}}
# (Correct — room TEST doesn't exist)
```

### End-to-End Test Scenario
1. Start backend + student app
2. Open instructor app, enter name "Test Instructor", title "Test Workshop", click Start Session
3. Note the 6-char room code
4. On a second device (or second browser tab on the same machine), navigate to `http://<LAN-IP>:3000`
5. Enter name "Test Student", enter room code, click Join
6. Verify: student list panel in instructor app shows "Test Student"
7. Verify: "Test Student joined the session" toast appears in instructor app
8. Click "Test AI" in Settings — verify success in debug console
9. Test mic in Settings — verify level meter moves when speaking
10. Student sends a message in Q&A tab — verify it appears in instructor inbox
11. Wait 45 seconds without instructor reply — verify AI responds in student Q&A
12. Toggle screen sharing off in instructor app — verify student Live tab shows "not enabled"
13. Toggle screen sharing on — verify student Live tab shows the frame
14. Click "End Session" (double-tap) — verify student sees the session-ended modal
15. Student clicks "View Guide" — verify guide blocks are still visible

### LAN Test
1. Get the LAN IP from Settings → Network section
2. Have a second device on the same WiFi connect to `http://<IP>:3000`
3. Complete steps 4–14 above from the second device

---

## COMMIT SEQUENCE SUMMARY

After all features pass their individual test checklists, verify this commit history exists:

```
feat(network): WiFi/LAN support — bind to 0.0.0.0, network info API, configurable backend URL
fix(capture): resize+JPEG compression, capture-status events, conditional student stream
feat(capture): live share toggle — instructor can pause student screen preview
feat(debug): collapsible debug console panel with real-time logs and status indicators
feat(students): name on join, student list panel, join toast notification
feat(session): instructor leave triggers full-screen ended modal for students
feat(preview): live screen preview tab in student app
feat(messaging): student Q&A panel with 45s AI fallback via LangGraph messageAgent
feat(settings): microphone level test and AI connectivity test
perf(ai): reduce token usage — tighter prompts, 4-message context, lower maxTokens
style(ui): remove emojis, professional tone, consistent labels
```

Each commit must be atomic — one feature per commit, tests passing before committing.

---

## NOTES ON RUST CRATE VERSIONS

If `cargo build` fails due to crate incompatibilities, use these pinned versions in `Cargo.toml`:

```toml
image = { version = "0.25.1", features = ["jpeg", "png"] }
base64 = "0.22.1"
screenshots = "0.8.10"
cpal = "0.15.3"
notify = "6.1.1"
reqwest = { version = "0.12", features = ["json", "multipart"] }
tokio = { version = "1.0", features = ["full"] }
chrono = { version = "0.4", features = ["serde"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
uuid = { version = "1.0", features = ["v4"] }
anyhow = "1.0"
log = "0.4"
env_logger = "0.11"
flume = "0.11"
```

If the `JpegEncoder` API has changed in your version of the `image` crate, use the alternate API:
```rust
// Alternate JPEG encode if JpegEncoder::new_with_quality is not available:
use image::ImageFormat;
let mut cursor = std::io::Cursor::new(Vec::new());
DynamicImage::ImageRgb8(rgb).write_to(&mut cursor, ImageFormat::Jpeg)
    .map_err(|e| format!("JPEG write failed: {e}"))?;
let jpeg_bytes = cursor.into_inner();
```

---

## GROQ RATE LIMIT HANDLING

Add exponential backoff to all LangGraph nodes that call Groq. In `wkai-backend/src/ai/groqClient.js`, add a wrapper:

```js
export async function callWithRetry(fn, maxRetries = 3) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes('rate limit');
      if (!isRateLimit || i === maxRetries - 1) throw err;
      console.warn(`[Groq] Rate limit hit, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
```

Use this wrapper in each LangGraph node that makes a Groq API call:
```js
const response = await callWithRetry(() => chain.invoke({ ... }));
```
