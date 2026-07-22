# Phase 0 - confirm FFmpeg can push into LiveKit via an RTMP ingress.
# RTMP is TCP, no ICE - it sidesteps ffmpeg's WHIP-muxer TCP-candidate limitation.
# LiveKit transcodes the RTMP feed to WebRTC for students (adds ~1-2s + is
# billable, but is rock-solid). Pure ASCII.
#
# First create an RTMP ingress:   node create-ingress.mjs --type rtmp
# Then run this with the URL + stream key it prints.

param(
  [Parameter(Mandatory = $true)][string]$Url,        # rtmp(s)://... base from the ingress
  [Parameter(Mandatory = $true)][string]$StreamKey,  # ingress stream key
  [int]$Seconds = 30,
  [int]$Fps = 30,
  [string]$Bitrate = "3M"
)

$ErrorActionPreference = "Continue"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Host "ffmpeg not on PATH" -ForegroundColor Red; exit 1 }

# LiveKit RTMP publish target = <url>/<streamKey>.
$target = "$($Url.TrimEnd('/'))/$StreamKey"
Write-Host "RTMP target: $target" -ForegroundColor Cyan
Write-Host "Pushing $Seconds s of desktop capture. Open the wkai-test room in LiveKit to confirm video." -ForegroundColor Cyan

$gop = $Fps * 2
# H.264 + AAC in FLV is the standard RTMP combo.
$ffArgs = @(
  "-hide_banner",
  "-f","gdigrab","-framerate","$Fps","-i","desktop",
  "-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=44100",
  "-t","$Seconds",
  "-c:v","libx264","-preset","veryfast","-tune","zerolatency","-b:v","$Bitrate","-g","$gop","-pix_fmt","yuv420p",
  "-c:a","aac","-b:a","128k","-ar","44100",
  "-f","flv",$target
)

& ffmpeg @ffArgs
if ($LASTEXITCODE -eq 0) { Write-Host "`nRTMP push completed. Confirm you saw video in the LiveKit room." -ForegroundColor Green }
else { Write-Host "`nRTMP push failed (exit $LASTEXITCODE). Check the URL/stream key and that the ingress is RTMP." -ForegroundColor Red }
