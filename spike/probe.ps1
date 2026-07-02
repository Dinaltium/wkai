# Phase 0 — probe FFmpeg capabilities + hardware on this machine.
# Read-only. Prints what encoders / hwaccels / capture sources are available.

$ErrorActionPreference = "Continue"

function Section($t) { Write-Host "`n===== $t =====" -ForegroundColor Cyan }

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "ffmpeg not found on PATH. Install a WHIP-capable build first." -ForegroundColor Red
  exit 1
}

Section "FFmpeg version"
ffmpeg -hide_banner -version | Select-Object -First 1

Section "WHIP muxer present? (needed for streaming egress)"
$whip = (ffmpeg -hide_banner -muxers 2>&1 | Select-String -SimpleMatch "whip")
if ($whip) { Write-Host "YES: $whip" -ForegroundColor Green }
else { Write-Host "NO — this ffmpeg cannot do -f whip. Get FFmpeg 7.1+ full build." -ForegroundColor Red }

Section "Hardware-accelerated H.264/HEVC encoders available"
ffmpeg -hide_banner -encoders 2>&1 |
  Select-String -Pattern "nvenc|qsv|amf|libx264|libx265" |
  ForEach-Object { $_.Line.Trim() }

Section "Hwaccels"
ffmpeg -hide_banner -hwaccels 2>&1 | Select-Object -Skip 1

Section "DDA (Desktop Duplication) capture filter present?"
$dda = (ffmpeg -hide_banner -filters 2>&1 | Select-String -SimpleMatch "ddagrab")
if ($dda) { Write-Host "YES: $($dda.Line.Trim())" -ForegroundColor Green }
else { Write-Host "NO ddagrab — GPU-capture-via-ffmpeg baseline unavailable; Rust WGC/DXGI path still applies." -ForegroundColor Yellow }

Section "GDI capture (gdigrab) — CPU baseline"
$gdi = (ffmpeg -hide_banner -devices 2>&1 | Select-String -SimpleMatch "gdigrab")
if ($gdi) { Write-Host "YES: $($gdi.Line.Trim())" -ForegroundColor Green } else { Write-Host "NO gdigrab" -ForegroundColor Red }

Section "Audio capture devices (DirectShow) — for WASAPI-equivalent test"
ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 |
  Select-String -Pattern "DirectShow audio|Alternative name" | ForEach-Object { $_.Line.Trim() }

Write-Host "`nDone. Note which encoders exist (nvenc=NVIDIA, qsv=Intel, amf=AMD) in RESULTS.md." -ForegroundColor Cyan
