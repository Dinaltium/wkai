# Phase 0 — benchmark capture+encode combinations on this machine.
# Captures the primary display for -Seconds and encodes each way, reporting
# wall time, output size, and ffmpeg's own reported avg fps/speed.
#
# This measures the FFmpeg-direct baseline (both capture + encode in ffmpeg).
# The real app will instead have Rust capture and pipe frames to ffmpeg for
# encode only — but this baseline tells us the encoder cost + whether GPU capture
# (ddagrab) is even viable on this hardware, which is what Phase 0 needs.

param(
  [int]$Seconds = 15,
  [int]$Fps = 30,
  [string]$Bitrate = "6M"
)

$ErrorActionPreference = "Continue"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Host "ffmpeg not on PATH" -ForegroundColor Red; exit 1 }

function Run-Case {
  param([string]$Name, [string[]]$FfArgs, [string]$OutFile)
  Write-Host "`n----- $Name -----" -ForegroundColor Cyan
  if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  # Capture stderr (ffmpeg stats) to a temp log; show the summary lines.
  $log = "$OutFile.log"
  & ffmpeg -hide_banner -y @FfArgs $OutFile 2> $log
  $sw.Stop()
  $ok = (Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 0)
  $sizeMB = if ($ok) { "{0:N1}" -f ((Get-Item $OutFile).Length / 1MB) } else { "FAIL" }
  $speed = (Select-String -Path $log -Pattern "speed=\s*[\d.]+x" | Select-Object -Last 1)
  Write-Host ("  wall={0:N1}s  out={1}MB  {2}" -f $sw.Elapsed.TotalSeconds, $sizeMB, ($speed.Matches.Value)) -ForegroundColor $(if ($ok) { "Green" } else { "Red" })
  if (-not $ok) { Write-Host "  (see $log — this combo may be unsupported on this GPU/driver)" -ForegroundColor Yellow }
}

# --- CPU baseline: GDI capture + libx264 -------------------------------------
Run-Case "CPU: gdigrab + libx264 (veryfast)" @(
  "-f","gdigrab","-framerate","$Fps","-i","desktop","-t","$Seconds",
  "-c:v","libx264","-preset","veryfast","-b:v","$Bitrate","-pix_fmt","yuv420p"
) "out_cpu_x264.mp4"

# --- GPU encode, CPU capture: GDI capture + NVENC ----------------------------
Run-Case "MIX: gdigrab + h264_nvenc" @(
  "-f","gdigrab","-framerate","$Fps","-i","desktop","-t","$Seconds",
  "-c:v","h264_nvenc","-preset","p4","-b:v","$Bitrate","-pix_fmt","yuv420p"
) "out_mix_nvenc.mp4"

# --- GPU capture + GPU encode: DDA + NVENC (fully on-GPU) ---------------------
# ddagrab outputs D3D11 frames; keep them on-GPU into nvenc.
Run-Case "GPU: ddagrab + h264_nvenc (on-GPU)" @(
  "-init_hw_device","d3d11va","-filter_complex","ddagrab=framerate=$Fps,hwmap=derive_device=cuda,format=cuda","-t","$Seconds",
  "-c:v","h264_nvenc","-preset","p4","-b:v","$Bitrate"
) "out_gpu_dda_nvenc.mp4"

# Fallback GPU-capture variant if the cuda hwmap above isn't supported:
Run-Case "GPU(alt): ddagrab -> download -> nvenc" @(
  "-filter_complex","ddagrab=framerate=$Fps,hwdownload,format=bgra,format=nv12","-t","$Seconds",
  "-c:v","h264_nvenc","-preset","p4","-b:v","$Bitrate"
) "out_gpu_dda_nvenc_dl.mp4"

Write-Host "`nCompare wall-time + watch Task Manager (CPU% and GPU Video Encode%) during each run." -ForegroundColor Cyan
Write-Host "Record the numbers in RESULTS.md. Intel users: swap h264_nvenc->h264_qsv; AMD: h264_amf." -ForegroundColor Cyan
