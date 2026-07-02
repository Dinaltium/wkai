# Phase 0 - benchmark capture+encode combinations on this machine.
# Captures the primary display for -Seconds and encodes each way, reporting
# wall time, output size, and ffmpeg's own reported avg speed.
# Pure ASCII on purpose.
#
# This measures the FFmpeg-direct baseline (capture + encode both in ffmpeg).
# The real app will have Rust capture and pipe frames to ffmpeg for encode only,
# but this baseline tells us encoder cost + whether GPU capture (ddagrab) works
# on this hardware, which is what Phase 0 needs.

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
  $log = "$OutFile.log"
  & ffmpeg -hide_banner -y @FfArgs $OutFile 2> $log
  $sw.Stop()
  $ok = (Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 0)
  if ($ok) { $sizeMB = "{0:N1}" -f ((Get-Item $OutFile).Length / 1MB) } else { $sizeMB = "FAIL" }
  $speedMatch = Select-String -Path $log -Pattern "speed=\s*[\d.]+x" | Select-Object -Last 1
  if ($speedMatch) { $speed = $speedMatch.Matches.Value } else { $speed = "" }
  $color = "Green"; if (-not $ok) { $color = "Red" }
  Write-Host ("  wall={0:N1}s  out={1}MB  {2}" -f $sw.Elapsed.TotalSeconds, $sizeMB, $speed) -ForegroundColor $color
  if (-not $ok) { Write-Host "  (see $log - this combo may be unsupported on this GPU/driver)" -ForegroundColor Yellow }
}

# CPU baseline: GDI capture + libx264
Run-Case "CPU: gdigrab + libx264 (veryfast)" @(
  "-f","gdigrab","-framerate","$Fps","-i","desktop","-t","$Seconds",
  "-c:v","libx264","-preset","veryfast","-b:v","$Bitrate","-pix_fmt","yuv420p"
) "out_cpu_x264.mp4"

# GPU encode, CPU capture: GDI capture + NVENC
Run-Case "MIX: gdigrab + h264_nvenc" @(
  "-f","gdigrab","-framerate","$Fps","-i","desktop","-t","$Seconds",
  "-c:v","h264_nvenc","-preset","p4","-b:v","$Bitrate","-pix_fmt","yuv420p"
) "out_mix_nvenc.mp4"

# GPU capture + GPU encode: DDA + NVENC (fully on-GPU)
Run-Case "GPU: ddagrab + h264_nvenc (on-GPU)" @(
  "-init_hw_device","d3d11va","-filter_complex","ddagrab=framerate=$Fps,hwmap=derive_device=cuda,format=cuda","-t","$Seconds",
  "-c:v","h264_nvenc","-preset","p4","-b:v","$Bitrate"
) "out_gpu_dda_nvenc.mp4"

# Fallback GPU-capture variant if the cuda hwmap above is unsupported:
Run-Case "GPU(alt): ddagrab -> download -> nvenc" @(
  "-filter_complex","ddagrab=framerate=$Fps,hwdownload,format=bgra,format=nv12","-t","$Seconds",
  "-c:v","h264_nvenc","-preset","p4","-b:v","$Bitrate"
) "out_gpu_dda_nvenc_dl.mp4"

Write-Host "`nCompare wall-time and watch Task Manager (CPU% and GPU Video Encode%) during each run." -ForegroundColor Cyan
Write-Host "Record numbers in RESULTS.md. Intel: swap h264_nvenc for h264_qsv; AMD: h264_amf." -ForegroundColor Cyan
