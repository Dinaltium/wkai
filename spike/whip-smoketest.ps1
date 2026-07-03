# Phase 0 - confirm FFmpeg can WHIP-push a live stream into LiveKit end-to-end.
# This is the egress path the real app uses (stream chain). Pure ASCII.
#
# Credentials: put your LiveKit values in spike/livekit.local.ps1 (gitignored):
#     $LK_URL    = "wss://<your-project>.livekit.cloud"
#     $LK_KEY    = "<API key>"
#     $LK_SECRET = "<API secret>"
# Then just run:  ./whip-smoketest.ps1
#
# Or pass them explicitly. The WHIP endpoint is derived from LK_URL
# (wss://host -> https://host/whip); override with -WhipUrl if your project shows
# a different WHIP/ingress URL in the LiveKit dashboard.

param(
  [string]$LiveKitUrl,
  [string]$ApiKey,
  [string]$ApiSecret,
  [string]$WhipUrl,
  [string]$StreamKey,
  [string]$Room = "wkai-test",
  [string]$Identity = "instructor",
  [int]$Seconds = 30,
  [int]$Fps = 30,
  [string]$Bitrate = "3M"
)

$ErrorActionPreference = "Continue"

# Load local creds file if present and params not supplied.
$localFile = Join-Path $PSScriptRoot "livekit.local.ps1"
if (Test-Path $localFile) { . $localFile }
if (-not $LiveKitUrl -and $LK_URL)    { $LiveKitUrl = $LK_URL }
if (-not $ApiKey      -and $LK_KEY)    { $ApiKey    = $LK_KEY }
if (-not $ApiSecret   -and $LK_SECRET) { $ApiSecret = $LK_SECRET }

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Host "ffmpeg not on PATH" -ForegroundColor Red; exit 1 }
if (-not (Get-Command node -ErrorAction SilentlyContinue))   { Write-Host "node not on PATH (needed to mint token)" -ForegroundColor Red; exit 1 }
if (-not $ApiKey -or -not $ApiSecret) { Write-Host "Missing LiveKit key/secret. Set them in livekit.local.ps1 or pass -ApiKey/-ApiSecret." -ForegroundColor Red; exit 1 }
if (-not $LiveKitUrl -and -not $WhipUrl) { Write-Host "Provide -LiveKitUrl (wss://...) or -WhipUrl." -ForegroundColor Red; exit 1 }

$whipHas = (ffmpeg -hide_banner -muxers 2>&1 | Select-String -SimpleMatch "whip")
if (-not $whipHas) { Write-Host "This ffmpeg has no WHIP muxer. Get FFmpeg 7.1+ full build." -ForegroundColor Red; exit 1 }

# Derive WHIP URL from the LiveKit wss URL if not given explicitly.
if (-not $WhipUrl) {
  $WhipUrl = ($LiveKitUrl -replace '^wss://','https://' -replace '^ws://','http://').TrimEnd('/') + "/whip"
}

# Auth: a LiveKit WHIP ingress puts the stream key in the URL PATH (/w/<key>),
# not a bearer header. If no stream key, fall back to minting a room-join token
# and sending it as the bearer (for direct-WHIP setups).
$useAuthHeader = $true
$token = $null
if ($StreamKey) {
  $WhipUrl = "$($WhipUrl.TrimEnd('/'))/$StreamKey"
  $useAuthHeader = $false
  Write-Host "Using ingress stream key in URL path." -ForegroundColor Cyan
} else {
  $token = (& node (Join-Path $PSScriptRoot "mint-livekit-token.mjs") --key $ApiKey --secret $ApiSecret --room $Room --identity $Identity --ttl 7200).Trim()
  if (-not $token) { Write-Host "Token minting failed." -ForegroundColor Red; exit 1 }
}

Write-Host "WHIP URL:  $WhipUrl" -ForegroundColor Cyan
Write-Host "Room:      $Room   Identity: $Identity" -ForegroundColor Cyan
Write-Host "Pushing $Seconds s of desktop capture to LiveKit. Open the room in a browser to confirm video." -ForegroundColor Cyan

# H.264 + Opus is the browser-friendly WebRTC-receive combo. Short keyframe
# interval so a joining student gets a picture fast.
$gop = $Fps * 2
$ffArgs = @(
  "-hide_banner",
  "-f","gdigrab","-framerate","$Fps","-i","desktop",
  "-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000",
  "-t","$Seconds",
  "-c:v","libx264","-preset","veryfast","-tune","zerolatency","-b:v","$Bitrate","-g","$gop","-pix_fmt","yuv420p",
  "-c:a","libopus","-b:a","64k"
)
if ($useAuthHeader) {
  # Pass the RAW token - ffmpeg's whip muxer prepends "Bearer " itself.
  $ffArgs += @("-authorization","$token")
}
# Big UDP buffer so a large first keyframe (full desktop I-frame) doesn't overflow
# the WHIP muxer's tiny default (4096B) and error with EAGAIN (-11).
$ffArgs += @("-ts_buffer_size","8388608","-f","whip",$WhipUrl)

& ffmpeg @ffArgs
if ($LASTEXITCODE -eq 0) { Write-Host "`nWHIP push completed. Confirm you saw video in the LiveKit room." -ForegroundColor Green }
else {
  Write-Host "`nWHIP push failed (exit $LASTEXITCODE)." -ForegroundColor Red
  Write-Host "If -11 / 'UDP send blocked': raise -ts_buffer_size further (already 8MB here) or lower -Bitrate." -ForegroundColor Yellow
  Write-Host "If 401 persists: run  ffmpeg -hide_banner -h muxer=whip  to confirm the auth option name on this build" -ForegroundColor Yellow
  Write-Host "(it should be 'authorization' taking the raw token; some builds use 'bearer_token' or want the token in the URL as ?access_token=)." -ForegroundColor Yellow
  Write-Host "If 404: verify the WHIP URL in the LiveKit dashboard and pass -WhipUrl." -ForegroundColor Yellow
}
