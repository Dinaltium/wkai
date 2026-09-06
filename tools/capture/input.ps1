# Drives the real mouse and keyboard from a JSON action list, so a recording
# shows human-looking movement rather than teleporting clicks.
#
#   node/pwsh: .input.ps1 -ActionsPath shot.json
#
# Actions:
#   {"type":"move","x":512,"y":892,"ms":900}
#   {"type":"click"}            {"type":"doubleclick"}
#   {"type":"scroll","clicks":-3,"ms":600}
#   {"type":"text","value":"ABC123","cps":14}
#   {"type":"key","value":"{ENTER}"}
#   {"type":"wait","ms":800}
param([Parameter(Mandatory = $true)][string]$ActionsPath)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Inp {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int data, IntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004, WHEEL = 0x0800;
}
"@

function Get-Pos {
  $p = New-Object Inp+POINT
  [void][Inp]::GetCursorPos([ref]$p)
  return $p
}

# easeInOutCubic — slow at both ends, quick through the middle. This is what
# makes the pointer read as a hand rather than a linear tween.
function Ease([double]$t) {
  if ($t -lt 0.5) { return 4 * $t * $t * $t }
  return 1 - [Math]::Pow(-2 * $t + 2, 3) / 2
}

function Move-Smooth([int]$tx, [int]$ty, [int]$ms) {
  $from = Get-Pos
  $steps = [Math]::Max(2, [int]($ms / 12))
  for ($i = 1; $i -le $steps; $i++) {
    $e = Ease($i / [double]$steps)
    $x = [int]($from.X + ($tx - $from.X) * $e)
    $y = [int]($from.Y + ($ty - $from.Y) * $e)
    [void][Inp]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 12
  }
  [void][Inp]::SetCursorPos($tx, $ty)
}

function Invoke-Click {
  # A short press reads better on camera than an instantaneous down+up.
  [Inp]::mouse_event([Inp]::LEFTDOWN, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 90
  [Inp]::mouse_event([Inp]::LEFTUP, 0, 0, 0, [IntPtr]::Zero)
}

function Invoke-Scroll([int]$clicks, [int]$ms) {
  # One wheel notch at a time with a pause, so the page glides instead of jumping.
  $n = [Math]::Abs($clicks)
  $dir = if ($clicks -lt 0) { -120 } else { 120 }
  $gap = if ($n -gt 0) { [Math]::Max(20, [int]($ms / $n)) } else { 0 }
  for ($i = 0; $i -lt $n; $i++) {
    [Inp]::mouse_event([Inp]::WHEEL, 0, 0, $dir, [IntPtr]::Zero)
    Start-Sleep -Milliseconds $gap
  }
}

function Send-Text([string]$value, [int]$cps) {
  $delay = [int](1000 / [Math]::Max(1, $cps))
  foreach ($ch in $value.ToCharArray()) {
    # SendKeys treats these as syntax; escape them.
    $s = $ch.ToString()
    if ('+^%~(){}[]'.Contains($s)) { $s = "{$s}" }
    [System.Windows.Forms.SendKeys]::SendWait($s)
    # Vary the gap slightly; perfectly even keystrokes look synthetic.
    Start-Sleep -Milliseconds ($delay + (Get-Random -Minimum -25 -Maximum 45))
  }
}

$actions = Get-Content $ActionsPath -Raw | ConvertFrom-Json
foreach ($a in $actions) {
  switch ($a.type) {
    "move"        { Move-Smooth $a.x $a.y $(if ($a.ms) { $a.ms } else { 800 }) }
    "click"       { Invoke-Click }
    "doubleclick" { Invoke-Click; Start-Sleep -Milliseconds 90; Invoke-Click }
    "scroll"      { Invoke-Scroll $a.clicks $(if ($a.ms) { $a.ms } else { 600 }) }
    "text"        { Send-Text $a.value $(if ($a.cps) { $a.cps } else { 14 }) }
    "key"         { [System.Windows.Forms.SendKeys]::SendWait($a.value) }
    "wait"        { Start-Sleep -Milliseconds $a.ms }
    default       { "unknown action: $($a.type)" }
  }
}
"done"
