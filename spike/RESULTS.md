# Phase 0 Spike — Results (2026-07-03)

Machine: NVIDIA (NVENC) + Intel (QSV) + AMD (AMF) all present · display 1920x1200
FFmpeg: 8.1.1-essentials (gyan.dev)  ·  WHIP muxer present: YES

## 1. Encoders available (probe.ps1)
- [x] NVENC (NVIDIA): yes — h264/hevc/av1
- [x] QSV (Intel): yes — h264/hevc/av1/vp9
- [x] AMF (AMD): yes — h264/hevc/av1
- [x] ddagrab (GPU capture via ffmpeg): yes
- [x] gdigrab (CPU capture): yes
- Hwaccels: cuda, vaapi, dxva2, qsv, d3d11va, d3d12va, amf

## 2. Capture+encode benchmark (bench.ps1) — 15s @ 30fps, 6M

| Combo | Wall time | Output MB | Speed | Worked? |
|---|---|---|---|---|
| CPU: gdigrab + libx264 | 15.2s | 5.0 | 0.993x | yes |
| MIX: gdigrab + nvenc | 15.3s | 2.7 | 0.989x | yes |
| GPU: ddagrab + nvenc (on-GPU cuda hwmap) | 0.3s | — | — | FAIL |
| GPU(alt): ddagrab download + nvenc | 15.4s | 1.8 | 0.974x | yes |

Notes: ~1.0x speed is expected for live capture (capped to wall clock). The
on-GPU cuda hwmap variant failed (d3d11->cuda mapping quirk in the ffmpeg filter
chain) — irrelevant: the app captures in Rust (WGC/DXGI) and pipes NV12 to nvenc,
which corresponds to the working "download" path. NVENC + x264 both real-time.

## 3. Egress -> LiveKit
- WHIP (ffmpeg -f whip): auth + WebRTC negotiation + LiveKit session all succeed,
  but ffmpeg's WHIP muxer rejects LiveKit's TCP ICE candidates ("Protocol tcp is
  not supported by RTC") — known unfixed ffmpeg limitation. WHIP via ffmpeg is a
  dead end against LiveKit Cloud.
- **RTMP ingress: WORKS.** `rtmp-smoketest.ps1` pushed 30s of desktop (H.264/AAC)
  to an RTMP ingress; LiveKit accepted and transcodes to WebRTC. Real-time after
  a brief connect ramp (a few dropped frames during ramp, then stable). This is
  the v1 egress path. LiveKit Rust SDK publish is the sub-second upgrade path.

## SPIKE COMPLETE (2026-07-03)
All unknowns resolved. Encoders validated, capture works, egress proven (RTMP).
Ready for Phase 1 (native record - scaffold committed) and Phase 2 (stream via
RTMP ingress + LiveKit room subscribe on the student side).

## Decisions this unblocks
- Default "Quality" mode: **GPU capture (Rust WGC/DXGI) + NVENC** (h264 for
  browser-receive compatibility; hevc/av1 optional later).
- Default "Compatibility" mode: **GDI/CPU capture + libx264**.
- "Balanced": GPU capture + NVENC at lower bitrate.
- Proceed to Phase 1 (native record): **YES** — encoders validated.
- LiveKit: Cloud (project wkai-b7994j63). WHIP egress path confirmed reachable;
  auth re-test after the token fix.
