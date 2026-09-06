# Window helper: focus, position and measure a window by process id.
# Used to place the demo browser precisely before recording.
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [int]$X = -1, [int]$Y = -1, [int]$W = -1, [int]$H = -1,
  [switch]$Focus,
  [switch]$Maximize
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$h = (Get-Process -Id $ProcessId).MainWindowHandle
if ($h -eq 0) { "process $ProcessId has no main window"; exit 1 }

if ($W -gt 0 -and $H -gt 0) {
  [void][Win]::ShowWindow($h, 9)   # SW_RESTORE, in case it is minimised
  [void][Win]::MoveWindow($h, $X, $Y, $W, $H, $true)
  Start-Sleep -Milliseconds 400
}

if ($Maximize) {
  [void][Win]::ShowWindow($h, 3)   # SW_MAXIMIZE
  Start-Sleep -Milliseconds 400
}

if ($Focus) {
  # SW_SHOW, not SW_RESTORE: restoring un-maximises a maximised window, which
  # silently changes the framing of a take that was already set up.
  [void][Win]::ShowWindow($h, 5)
  [void][Win]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 400
}

$r = New-Object Win+RECT
[void][Win]::GetWindowRect($h, [ref]$r)
"window $ProcessId : X=$($r.Left) Y=$($r.Top) W=$($r.Right - $r.Left) H=$($r.Bottom - $r.Top)"
"foreground = $([Win]::GetForegroundWindow() -eq $h)"
