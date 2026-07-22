You are working on the WKAI instructor desktop application.

Current stack:

* Tauri v2
* Rust backend/native layer
* React + TypeScript frontend
* Vite
* Zustand
* WebRTC
* WebSocket backend

IMPORTANT:
DO NOT break the existing stable application.

This migration must happen:

* incrementally
* safely
* in isolation
* with full rollback capability

====================================================
FIRST TASK — SAFE GIT WORKFLOW
==============================

Before touching ANY code:

1. Verify git working tree status
2. Commit or stash pending changes if necessary
3. Create a NEW branch:

feature/native-crossplatform-capture

4. Switch to the branch
5. Print current branch name
6. Confirm no existing files are modified unexpectedly

====================================================
CURRENT PROBLEM
===============

Current implementation relies on:

* navigator.mediaDevices.getDisplayMedia()
* browser/WebView2 capture APIs

This causes:

* browser permission popup
* Chromium floating “Stop sharing” overlay
* non-native UX
* browser-controlled capture flow

We want to completely replace browser-based screen capture with native OS-level capture.

====================================================
GOAL
====

Implement:
OBS-style native integrated screen capture

Requirements:

* NO browser popup
* NO floating overlay
* NO external recorder application
* fully integrated capture flow inside WKAI
* native Rust-based screen capture pipelines
* platform-specific backends

====================================================
IMPORTANT RULES
===============

DO NOT:

* remove old capture system
* replace stable production flows
* modify current session architecture aggressively
* break current workshop functionality
* delete existing hooks/components

ALL work must remain:

* modular
* reversible
* isolated
* testable

The existing app must continue functioning even if the experimental native capture fails.

====================================================
REPOSITORY-SPECIFIC IMPLEMENTATION PLAN
=======================================

CURRENT STRUCTURE ANALYSIS:

Frontend:
src/

* components/
* hooks/
* pages/
* lib/
* store/
* router.tsx

Rust:
src-tauri/src/

* ai.rs
* audio.rs
* file_watcher.rs
* session.rs
* commands/

This is already well-structured.

We will EXTEND this architecture instead of replacing it.

====================================================
NEW DIRECTORY STRUCTURE
=======================

Create the following:

src/
├── components/
│   ├── nativeCapture/
│   │   ├── CapturePreview.tsx
│   │   ├── DeviceSelector.tsx
│   │   ├── CaptureControls.tsx
│   │   ├── CaptureMetrics.tsx
│   │   ├── NativeCaptureDebug.tsx
│   │   └── PlatformBadge.tsx
│
├── hooks/
│   ├── useNativeCapture.ts
│   ├── useCaptureMetrics.ts
│   └── useCaptureDevices.ts
│
├── pages/
│   ├── NativeCaptureTest.tsx
│
├── types/
│   ├── nativeCapture.ts

====================================================

Create new Rust architecture:

src-tauri/src/
├── native_capture/
│   ├── mod.rs
│   ├── manager.rs
│   ├── traits.rs
│   ├── types.rs
│   ├── events.rs
│   ├── frame_pipeline.rs
│   ├── encoder.rs
│   ├── preview.rs
│   │
│   ├── windows/
│   │   ├── mod.rs
│   │   ├── windowsRCD.rs
│   │   ├── windows_devices.rs
│   │   ├── windows_pipeline.rs
│   │   └── windows_permissions.rs
│   │
│   ├── ubuntu/
│   │   ├── mod.rs
│   │   ├── ubuntuRCD.rs
│   │   ├── ubuntu_devices.rs
│   │   ├── ubuntu_pipeline.rs
│   │   └── ubuntu_permissions.rs
│   │
│   ├── mac/
│   │   ├── mod.rs
│   │   ├── macRCD.rs
│   │   ├── mac_devices.rs
│   │   ├── mac_pipeline.rs
│   │   └── mac_permissions.rs
│
├── commands/
│   ├── native_capture.rs

====================================================
PLATFORM IMPLEMENTATION REQUIREMENTS
====================================

========================
WINDOWS
=======

Preferred APIs:

* Windows Graphics Capture API
* DXGI Desktop Duplication

Preferred crates:

* windows
* windows-capture

Requirements:

* enumerate monitors
* enumerate windows
* GPU accelerated capture
* smooth preview rendering
* OBS-like integrated capture flow

====================================================

========================
UBUNTU / LINUX
==============

Support:

* X11
* Wayland

Preferred technologies:

* PipeWire
* x11rb
* gstreamer
* ashpd

IMPORTANT:
Wayland restrictions must be handled properly.

Architecture must support:

* native PipeWire capture
* portal fallback where necessary

Do NOT implement X11-only assumptions.

====================================================

========================
macOS
=====

Preferred APIs:

* ScreenCaptureKit
* AVFoundation

Requirements:

* monitor enumeration
* window enumeration
* proper permissions handling
* native preview rendering

====================================================
FRONTEND REQUIREMENTS
=====================

Create:
src/pages/NativeCaptureTest.tsx

Add route:

* /native-capture-test

This page must:

1. detect current OS backend
2. display available monitors/windows
3. show live preview
4. allow start/stop capture
5. display FPS
6. show dropped frames
7. display backend info
8. show debug logs
9. show active pipeline status

Design:

* modern dark UI
* OBS-inspired layout
* responsive
* developer-friendly debugging

====================================================
IPC REQUIREMENTS
================

Create new Tauri commands:

* list_capture_devices
* list_capture_windows
* start_native_capture
* stop_native_capture
* get_capture_status
* get_capture_metrics
* get_platform_backend

Use Tauri events for:

* frame updates
* capture status
* FPS metrics
* dropped frames
* permission failures
* device changes
* backend errors

====================================================
BACKEND ABSTRACTION REQUIREMENTS
================================

Create shared Rust trait:

CaptureBackend

Functions:

* initialize()
* list_monitors()
* list_windows()
* start_capture()
* stop_capture()
* cleanup()
* get_status()

Platform-specific modules must implement this trait.

====================================================
THREADING REQUIREMENTS
======================

Requirements:

* no UI thread blocking
* async-safe design
* threaded frame loops
* proper cleanup lifecycle
* panic-safe handling
* avoid deadlocks

Use:

* tokio
* channels/events
* Arc carefully
* Mutex only when necessary

====================================================
PERFORMANCE TARGETS
===================

Goals:

* stable 30 FPS minimum
* low CPU usage
* GPU acceleration where possible
* smooth preview rendering
* minimal memory overhead
* stable long workshop sessions

====================================================
DEBUGGING REQUIREMENTS
======================

Implement detailed logs for:

* backend initialization
* device enumeration
* frame timing
* dropped frames
* thread lifecycle
* permission failures
* cleanup lifecycle
* backend selection
* platform-specific issues

====================================================
IMPORTANT MIGRATION STRATEGY
============================

DO NOT replace existing hooks immediately.

Current files like:

* useWebRtcPublisher.ts
* RecordingPanel.tsx
* CaptureStatus.tsx

must remain untouched initially.

The new native system should run:

* independently
* experimentally
* side-by-side

Only after successful validation should migration adapters be introduced.

====================================================
FUTURE INTEGRATION GOAL
=======================

Eventually:
native capture pipeline
→ encoder
→ WebRTC publisher
→ existing student streaming system

But DO NOT implement full migration yet.

Current phase is:
safe native capture experimentation.

====================================================
FINAL DELIVERABLES
==================

At completion provide:

1. Full architecture summary
2. New file tree
3. Platform-specific implementation details
4. Linux Wayland/X11 limitations
5. macOS permissions notes
6. Windows GPU capture notes
7. Performance observations
8. Future migration strategy
9. Testing instructions for all platforms
10. Git diff summary
11. Rollback strategy if needed

IMPORTANT:
Prioritize:

* safety
* modularity
* maintainability
* future scalability

Do NOT perform dangerous full rewrites.
