# Captures the primary display to a PNG so the agent can see what it is doing
# before it moves the real cursor. Optional -Scale shrinks the file for reading.
param(
  [string]$Path = "$env:TEMP\wkai-shot.png",
  [double]$Scale = 0.5
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$full = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($full)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$g.Dispose()

if ($Scale -ne 1) {
  $w = [int]($b.Width * $Scale)
  $h = [int]($b.Height * $Scale)
  $small = New-Object System.Drawing.Bitmap $w, $h
  $sg = [System.Drawing.Graphics]::FromImage($small)
  $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $sg.DrawImage($full, 0, 0, $w, $h)
  $sg.Dispose()
  $full.Dispose()
  $small.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $small.Dispose()
  "saved $Path  ($w x $h, scale $Scale of $($b.Width)x$($b.Height))"
} else {
  $full.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $full.Dispose()
  "saved $Path  ($($b.Width) x $($b.Height))"
}
