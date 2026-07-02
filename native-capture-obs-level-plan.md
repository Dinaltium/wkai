# WKAI — Native Recording & Streaming Architecture (Hybrid Rust + FFmpeg)

Status: DESIGN. Windows-first; macOS/Linux later. Goal: OBS/Zoom/Webex-class screen recording and streaming, **native OS capture only** — no browser `MediaRecorder`, no `canvas.captureStream`, no JPEG/screenshot pipeline. Real video codecs throughout. GPU **or** CPU selectable at both capture and encode. One instructor streams to its room's N students; many rooms run independently.

Supersedes the earlier Path-A-vs-Path-B framing: the decision is a **hybrid** — FFmpeg-centric ("B") for encode/mux/egress, with a native Rust capture layer ("A") in front for OBS-grade source control. FFmpeg is used but its role is cut down; the WebRTC publish stack is FFmpeg's WHIP muxer, not a hand-rolled `webrtc-rs` stack.

**Decisions locked (2026-07-03):** SFU = **LiveKit** (native WHIP ingest, rooms first-class). Frame handoff = **Rust captures → pipes raw frames to FFmpeg** (true hybrid, OBS-grade source control). FFmpeg = **bundled trimmed build** (guaranteed `-f whip`). Implementation = **starting Phase 0 spike** (Windows-first).

---

## 1. Pipeline Overview

```
INSTRUCTOR APP (Tauri)                                    BACKEND            STUDENTS
┌──────────────────────────────────────────────┐        ┌──────────┐       ┌──────────────┐
│ Rust Capture Layer ("A" — OBS-grade control)  │        │  SFU /   │       │ browser      │
│  • Windows.Graphics.Capture (GPU)  ─┐         │        │  WHIP    │       │ RTCPeer      │
│  • DXGI Desktop Duplication (GPU)   ├ select  │        │  ingest  │       │ (receive     │
│  • GDI / BitBlt (CPU fallback)      ┘         │        │  per     │       │  path reused)│
│  • Audio: WASAPI loopback + mic (mix)         │        │  room    │       │              │
│  • cursor, region, window-exclude             │        │          │       │              │
│            │ raw frames (NV12/BGRA)            │        │ fan-out  │       │              │
│            ▼   via pipe / shared mem           │        │ 1→N per  │       │              │
│ FFmpeg Encode+Output Layer ("B")              │        │ room,    │       │              │
│  • encode: GPU NVENC/QSV/AMF  ─┐              │        │ rooms    │       │              │
│  •         or CPU x264/x265    ┘ select       │        │ isolated │       │              │
│  • split → two independent chains:            │        │          │       │              │
│      ├─ FILE  (mp4/mkv)   [record settings]   │        │          │       │              │
│      └─ WHIP  push        [stream settings] ──┼──WHIP─▶│ ingest ──┼──WebRTC▶ subscribe   │
│ Rust supervises ffmpeg: spawn, feed, parse    │        └──────────┘       └──────────────┘
│ -progress, restart, expose Tauri cmds/events  │
└──────────────────────────────────────────────┘
```

Capture happens **once**; the `split` feeds two encoders so record and stream have fully independent settings without double-capturing. Instructor uploads **one** stream to the SFU regardless of student count (kills today's N× mesh cost).

---

## 2. Capture Layer (Rust — the "A" features)

Native, frame-driven, GPU-backed. No screenshots, no JPEG.

| Mode | API | When |
|---|---|---|
| GPU (default) | **Windows.Graphics.Capture (WGC)** | Modern; per-window or per-monitor, cursor toggle, **exclude-window** (hide the WKAI app itself), border control. OBS's primary Windows path. |
| GPU (alt) | **DXGI Desktop Duplication** | Full-monitor, lowest latency; fallback when WGC unavailable. |
| CPU | **GDI / BitBlt** (today's `xcap`-class) | Old GPUs, RDP/VM sessions, or user forces CPU to offload GPU. |

- **Capture mode is user-selectable** (requirement 6): GPU-WGC / GPU-DXGI / CPU-GDI. Rust probes support at startup and greys out unavailable modes.
- **Audio**: WASAPI loopback (system audio) + microphone, source selection + mixing, fed alongside video.
- **Output**: raw frames in `NV12` (native hw-encoder format) into a bounded ring buffer, handed to FFmpeg. Handoff options (Phase-gated):
  - v1: `stdin` pipe as `-f rawvideo` (simple, robust, small CPU copy cost).
  - v2: named pipe / shared memory; GPU path can share a D3D11 texture with FFmpeg's `d3d11va` hwcontext for near-zero-copy (advanced, later).

The existing `frame_pipeline.rs` JPEG→base64→IPC path is retained **only** as an optional low-fps preview thumbnail for the instructor's own UI — decoupled from record/stream. It never touches the recording or the live stream again.

---

## 3. Encode + Output Layer (FFmpeg — the "B")

One supervised FFmpeg child process. `split` the incoming raw feed into two encode chains so we encode twice at independent settings from a single capture:

```
ffmpeg -f rawvideo -pix_fmt nv12 -s WxH -r FPS -i pipe:0   (video from Rust)
       -f <audio> -i <wasapi>                              (audio from Rust)
       -filter_complex "[0:v]split=2[rec][str];[str]scale=..." \
       # RECORD chain
       -map "[rec]" -map 1:a -c:v <ENC_REC> <rate-ctrl-rec> -g <gop> -c:a aac -b:a 160k  out.mp4
       # STREAM chain
       -map "[str]" -map 1:a -c:v <ENC_STR> <rate-ctrl-str> -g <short-gop> -c:a opus     -f whip <SFU_URL>
```

- **Encoder selectable** (requirement 6): GPU `h264_nvenc`/`hevc_nvenc`, `h264_qsv`, `h264_amf`; or CPU `libx264`/`libx265`. Rust probes `ffmpeg -encoders` + hw availability and exposes the list.
- **WebRTC egress = FFmpeg's `-f whip` muxer** — no `webrtc-rs`, no browser RTCPeerConnection on the publish side. This is the "cut down" hybrid.
- Record and stream can start/stop **independently** (OBS/Zoom behaviour: record locally without streaming, or stream without recording).

---

## 4. Orchestration (Rust)

Rust owns FFmpeg's lifecycle and exposes control to the UI.

- **Tauri commands**: `list_capture_sources`, `list_encoders` (probe hw), `set_capture_config`, `start_recording`/`stop_recording`, `start_stream`/`stop_stream`, `set_record_config`, `set_stream_config`.
- **Supervision**: spawn FFmpeg, feed frames, parse the `-progress` pipe (fps, bitrate, dropped frames, speed) → emit metrics events to the UI; auto-restart on crash with backoff; clean SIGTERM shutdown flushing the mp4 moov atom.
- **Preview**: optional downscaled thumbnail tap for the instructor UI only.

---

## 5. Backend SFU — Multi-Room, Multi-Student (requirement 7)

Instructor WHIP-pushes **one** encoded stream per session to the SFU, keyed by `sessionId`/`roomCode`. The SFU fans that single ingest out to that room's subscribers only. Rooms are isolated: instructor A's room (20 students) and instructor B's room (N students) are independent ingest→fanout graphs. Instructor upload stays at 1 stream regardless of N.

SFU options (this is a decision point):

| Option | Shape | Pros | Cons |
|---|---|---|---|
| **LiveKit** | Separate service (self-host or cloud) | Rooms first-class, **native WHIP ingest**, simulcast/adaptive, scales, least code | Another service to run/deploy |
| **mediasoup** | Embed in existing Node backend | One service, full control, reuses current WS signaling | Most code; WHIP ingest needs a small adapter |
| **Cloudflare Realtime (Calls)** | Managed WHIP/SFU | No infra, scales, managed | External dependency + usage cost |

Student receive side: the existing browser `RTCPeerConnection` receive path (`useWebRtcReceiver.ts`) is largely reused — the change is subscribing to the SFU instead of answering the instructor's mesh offer. Adaptive/simulcast (auto stream quality per student, requirement-adjacent) comes for free with LiveKit / via layers with mediasoup.

---

## 6. Customization Surfaces (OBS/Zoom/Webex-like — requirements 1, 2, 3)

Three config groups, surfaced in the instructor Settings UI. Record and Stream are **independent** (different resolution/bitrate/codec allowed).

**Capture** (shared source): capture mode (GPU-WGC / GPU-DXGI / CPU-GDI), source (monitor / window / region), fps ceiling, cursor on/off, exclude-WKAI-window.

**Recording**: resolution, fps, codec (H.264 / HEVC), rate control (CBR bitrate **or** CRF quality slider), keyframe interval, container (mp4 / mkv), audio (system + mic, bitrate), encoder (GPU / CPU), output folder.

**Streaming**: resolution (independent downscale), fps, target bitrate, rate control, **short** keyframe interval (fast student join), encoder (GPU / CPU), optional simulcast layers for per-student adaptive quality.

"**Performance mode**" preset ties capture+encode GPU/CPU combos into one choice for non-expert users (e.g. *Quality* = GPU capture + GPU encode; *Compatibility* = CPU capture + CPU x264; *Balanced* = GPU capture + CPU encode).

---

## 7. Requirement → Design Map

| # | Requirement | How |
|---|---|---|
| 1 | Customizable recording | §6 Recording group — res/fps/codec/bitrate/CRF/container/audio/encoder/path |
| 2 | Customizable streaming (independent) | §6 Streaming group — separate res/bitrate/codec/keyframe; §3 `split` two chains |
| 3 | OBS/Zoom/Webex-like | §6 config surfaces + §4 independent record/stream start-stop + live metrics |
| 4 | Pure OS recording, no browser/SS | §2 native WGC/DXGI/GDI capture; browser MediaRecorder + canvas path deleted |
| 5 | Pure video, not JPEG/SS | §3 H.264/HEVC encode; JPEG path demoted to optional preview only |
| 6 | GPU or CPU selectable | §2 capture mode select + §3 encoder select + §6 Performance mode preset |
| 7 | Multi-room, 1→N per room, many rooms | §5 SFU per-room ingest→fanout, rooms isolated, 1 upload per instructor |
| 8 | Hybrid Rust + FFmpeg | §2 Rust capture (A) + §3 FFmpeg encode/mux/WHIP (B); no webrtc-rs |

---

## 8. Phased Plan (Windows-first)

- **Phase 0 — Spike**: probe available hw encoders; benchmark WGC+NVENC vs GDI+x264 (CPU%, latency, quality); confirm FFmpeg build has `-f whip`; pick the Rust→FFmpeg frame handoff (pipe vs shared mem). Lock the SFU choice here.
- **Phase 1a — Native record, FFmpeg-direct (Windows)**: DONE (scaffold, review-only). `src-tauri/src/recording/` (config + ffmpeg arg-builder + `start_recording`/`stop_recording`/`recording_status` commands) drives FFmpeg to capture (gdigrab/ddagrab) + encode (nvenc/x264, both spike-validated) + mux to mp4/mkv with graceful finalize. TS bridge in `wkai/src/lib/tauri.ts`. Needs local `cargo build` + wiring `RecordingPanel.tsx` to call these instead of browser `MediaRecorder`.
- **Phase 1b — Native record, Rust-capture pipe (Windows)**: replace the FFmpeg capture INPUT with raw frames piped from a Rust WGC/DXGI capture (OBS-grade source control), keeping the same encode/mux tail. **Delete** `MediaRecorder` from `RecordingPanel.tsx`/`useNativeCapture.ts`.
- **Phase 2 — Native stream (Windows)**: add the `split` stream chain → FFmpeg WHIP push → stand up the SFU → student subscribes. **Delete** `canvas.captureStream` + the `useWebRtcPublisher` mesh.
- **Phase 3 — Config + UX polish**: full OBS-like settings panels, live metrics (fps/bitrate/dropped), Performance-mode presets, adaptive/simulcast.
- **Phase 4 / 5 — macOS then Linux**: ScreenCaptureKit + VideoToolbox / PipeWire + VAAPI, same FFmpeg encode/WHIP tail. (Later, per your call.)

## 9. Code to Remove (once Phases 1–2 land)

- `useNativeCapture.ts`: canvas draw loop + `canvas.captureStream`.
- `RecordingPanel.tsx`: browser `MediaRecorder`.
- `useWebRtcPublisher.ts`: the per-student P2P mesh.
- `frame_pipeline.rs`: JPEG/base64/IPC path (keep only an optional downscaled preview tap).

## 10. Decisions — Resolved

1. **SFU**: ✅ **LiveKit** (native WHIP ingest, first-class rooms, simulcast/adaptive, scales).
2. **Frame handoff**: ✅ **Rust captures → pipes raw NV12 to FFmpeg.** FFmpeg-direct (`ddagrab`) kept only as a Phase-0 A/B baseline for benchmarking.
3. **FFmpeg**: ✅ **Bundle a trimmed build** with the app (guaranteed `-f whip`).
4. **Implementation**: ✅ **Starting Phase 0 spike.** See `spike/` deliverables.

Still to settle during Phase 0: LiveKit deploy shape (self-host vs LiveKit Cloud), default codec (H.264 vs HEVC — H.264 for browser-receive compatibility likely wins), and the exact Rust→FFmpeg IPC (stdin pipe first, shared-mem later).
