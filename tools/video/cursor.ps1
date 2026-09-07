# Drives the real OS cursor along eased paths, so a screen recording gets the
# smooth pointer motion of a produced demo without faking the pointer in post.
# A human moves a mouse in a jittery arc and arrives too fast to read; this
# moves on a cubic ease-in-out at ~120Hz, which the 60fps capture samples
# cleanly.
#
# Actions arrive as JSON in PAGE coordinates (0,0 = top-left of the web page).
# The page origin on screen is passed in, so the script never has to know how
# the window is decorated.
#
#   powershell -File cursor.ps1 -ActionsPath take.json -OriginX 158 -OriginY 72

param(
  [Parameter(Mandatory = $true)][string]$ActionsPath,
  [int]$OriginX = 158,
  [int]$OriginY = 72
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Cur {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004, WHEEL = 0x0800;
}
'@

function Sleep-Precise([double]$ms) {
  if ($ms -le 0) { return }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  # Sleep most of it, spin the tail: Thread.Sleep alone quantises to ~15ms,
  # which shows up as visible stepping in the recorded motion.
  $coarse = [int]([Math]::Floor($ms)) - 2
  if ($coarse -gt 0) { [System.Threading.Thread]::Sleep($coarse) }
  while ($sw.Elapsed.TotalMilliseconds -lt $ms) { [System.Threading.Thread]::SpinWait(200) }
}

function Ease([double]$t) {
  # Cubic ease-in-out: slow depart, quick middle, soft arrival.
  if ($t -lt 0.5) { return 4 * $t * $t * $t }
  $f = (2 * $t) - 2
  return 0.5 * $f * $f * $f + 1
}

function Move-Cursor([int]$toX, [int]$toY, [double]$durationMs) {
  $from = New-Object Cur+POINT
  [void][Cur]::GetCursorPos([ref]$from)
  $steps = [Math]::Max(2, [int]($durationMs / 8))
  for ($i = 1; $i -le $steps; $i++) {
    $p = Ease($i / [double]$steps)
    $x = [int]([Math]::Round($from.X + ($toX - $from.X) * $p))
    $y = [int]([Math]::Round($from.Y + ($toY - $from.Y) * $p))
    [void][Cur]::SetCursorPos($x, $y)
    Sleep-Precise ($durationMs / $steps)
  }
}

function Click-Mouse() {
  [Cur]::mouse_event([Cur]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Sleep-Precise 45
  [Cur]::mouse_event([Cur]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}

function Scroll-Wheel([int]$notches, [double]$durationMs) {
  # One wheel notch at a time with easing between, rather than a single jump:
  # a big delta reads as a teleport on video.
  $steps = [Math]::Abs($notches)
  if ($steps -eq 0) { return }
  $dir = if ($notches -gt 0) { 120 } else { -120 }
  for ($i = 0; $i -lt $steps; $i++) {
    [Cur]::mouse_event([Cur]::WHEEL, 0, 0, $dir, [UIntPtr]::Zero)
    Sleep-Precise ($durationMs / $steps)
  }
}

$actions = Get-Content -Raw -Path $ActionsPath | ConvertFrom-Json

foreach ($a in $actions) {
  switch ($a.type) {
    "move" { Move-Cursor ($OriginX + $a.x) ($OriginY + $a.y) $(if ($a.ms) { $a.ms } else { 700 }) }
    "click" { Click-Mouse }
    "clickAt" {
      Move-Cursor ($OriginX + $a.x) ($OriginY + $a.y) $(if ($a.ms) { $a.ms } else { 700 })
      Sleep-Precise 180
      Click-Mouse
    }
    "wait" { Sleep-Precise $a.ms }
    "scroll" { Scroll-Wheel $a.notches $(if ($a.ms) { $a.ms } else { 600 }) }
    "type" {
      $cps = if ($a.cps) { $a.cps } else { 13 }
      foreach ($ch in $a.text.ToCharArray()) {
        # SendKeys treats these as syntax; braces make them literal.
        $out = if ('{}()+^%~[]'.Contains($ch)) { '{' + $ch + '}' } else { [string]$ch }
        [System.Windows.Forms.SendKeys]::SendWait($out)
        Sleep-Precise (1000 / $cps)
      }
    }
    "key" { [System.Windows.Forms.SendKeys]::SendWait($a.key); Sleep-Precise 120 }
  }
}
Write-Output "take complete"
