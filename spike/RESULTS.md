# Phase 0 Spike — Results (fill in on Windows)

Machine: <CPU / GPU / RAM / Windows version>
FFmpeg: <version>  ·  WHIP muxer present: <yes/no>

## 1. Encoders available (probe.ps1)
- [ ] NVENC (NVIDIA): <yes/no>
- [ ] QSV (Intel): <yes/no>
- [ ] AMF (AMD): <yes/no>
- [ ] ddagrab (GPU capture via ffmpeg): <yes/no>

## 2. Capture+encode benchmark (bench.ps1)  — 15s @ 30fps, 6M

| Combo | Wall time | Output MB | CPU % (Task Mgr) | GPU Video Encode % | Worked? |
|---|---|---|---|---|---|
| CPU: gdigrab + libx264 |  |  |  | n/a |  |
| MIX: gdigrab + nvenc |  |  |  |  |  |
| GPU: ddagrab + nvenc (on-GPU) |  |  |  |  |  |
| GPU(alt): ddagrab download + nvenc |  |  |  |  |  |

Notes / errors:

## 3. WHIP → LiveKit (whip-smoketest.ps1)
- [ ] Video arrived in the LiveKit room: <yes/no>
- Latency felt: <rough seconds>
- Issues:

## Decisions this unblocks
- Default "Quality" mode combo: <e.g. GPU capture + NVENC>
- Default "Compatibility" mode combo: <e.g. GDI capture + libx264>
- Proceed to Phase 1 (native record) ? <yes/no>
- LiveKit deploy shape chosen: <Cloud / self-host>
