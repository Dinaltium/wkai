# Phase 0 — confirm FFmpeg can WHIP-push a live stream into LiveKit end-to-end.
# This is the egress path the real app will use (stream chain). If this works,
# the "instructor encodes once -> WHIP -> SFU -> students" model is validated.
#
# Setup: create a LiveKit room + a WHIP/ingress token. LiveKit Cloud gives you a
# WHIP URL; self-host: run `livekit-server --dev` and use the WHIP ingress.
# Pass the full WHIP endpoint URL (and bearer token if your endpoint needs it).

param(
  [Parameter(Mandatory = $true)][string]$WhipUrl,
  [string]$Token,
  [int]$Seconds = 30,
  [int]$Fps = 30,
  [string]$Bitrate = "3M"
)

$ErrorActionPreference = "Continue"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Host "ffmpeg not on PATH" -ForegroundColor Red; exit 1 }

$whipHas = (ffmpeg -hide_banner -muxers 2>&1 | Select-String -SimpleMatch "whip")
if (-not $whipHas) { Write-Host "This ffmpeg has no WHIP muxer. Get FFmpeg 7.1+ full build." -ForegroundColor Red; exit 1 }

Write-Host "Pushing $Seconds s of desktop capture to LiveKit via WHIP..." -ForegroundColor Cyan
Write-Host "Open the LiveKit room in a browser to confirm the video arrives." -ForegroundColor Cyan

# H.264 + Opus is the browser-friendly combo for WebRTC receive.
# Short keyframe interval (-g) so a joining student gets a picture fast.
$args = @(
  "-hide_banner",
  "-f","gdigrab","-framerate","$Fps","-i","desktop",
  "-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000",  # silent audio track; swap for -f dshow mic later
  "-t","$Seconds",
  "-c:v","libx264","-preset","veryfast","-tune","zerolatency","-b:v","$Bitrate","-g",("{0}" -f ($Fps*2)),"-pix_fmt","yuv420p",
  "-c:a","libopus","-b:a","64k"
)
if ($Token) { $args += @("-headers","Authorization: Bearer $Token`r`n") }
$args += @("-f","whip",$WhipUrl)

& ffmpeg @args
if ($LASTEXITCODE -eq 0) { Write-Host "`nWHIP push completed. Confirm you saw video in the LiveKit room." -ForegroundColor Green }
else { Write-Host "`nWHIP push failed (exit $LASTEXITCODE). Check URL/token/room and ffmpeg WHIP support." -ForegroundColor Red }
