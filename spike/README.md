# Phase 0 Spike — Native Capture + Encode + WHIP (Windows)

Goal: before writing the real Rust/FFmpeg pipeline, prove on your actual hardware:

1. **Which hardware encoders exist** (NVENC / QSV / AMF) → `probe.ps1`
2. **CPU vs GPU capture+encode cost** (GDI+x264 vs DDA+NVENC) → `bench.ps1`
3. **FFmpeg WHIP push works into LiveKit** end-to-end → `whip-smoketest.ps1`

Record findings in `RESULTS.md`. These answers decide the default "Performance mode" combos and confirm the `-f whip` egress path before any app code is written.

## Prerequisites

- **FFmpeg** with `--enable-libx264` and a WHIP muxer (`ffmpeg -muxers | findstr whip`). WHIP landed in FFmpeg 7.1+. If your build lacks it, grab a recent full build (gyan.dev / BtbN) — the app will bundle a trimmed build later, but the spike just needs any WHIP-capable ffmpeg on PATH.
- A **LiveKit** instance for the WHIP test (LiveKit Cloud free tier, or `livekit-server --dev` locally) + a room + an ingress/WHIP token. Skip `whip-smoketest.ps1` if not ready yet; `probe.ps1` and `bench.ps1` need nothing external.
- Run from PowerShell in this folder. Nothing here modifies the repo or system config.

## Run order

```powershell
./probe.ps1                          # what encoders/devices exist
./bench.ps1                          # CPU vs GPU capture+encode, writes out_*.mp4 + timings
./whip-smoketest.ps1 -WhipUrl "<livekit-whip-url>" -Token "<token>"
```

Then fill in `RESULTS.md` and report back — that picks the defaults and confirms Phase 1 can start.
