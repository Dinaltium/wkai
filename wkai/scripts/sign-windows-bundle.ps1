$ErrorActionPreference = "Stop"

$bundleDir = Join-Path $PSScriptRoot "..\src-tauri\target\release\bundle"
$bundleDir = [System.IO.Path]::GetFullPath($bundleDir)

$certFile = $env:WKAI_SIGN_CERT_FILE
$certPassword = $env:WKAI_SIGN_CERT_PASSWORD
$timestampUrl = $env:WKAI_SIGN_TIMESTAMP_URL

if ([string]::IsNullOrWhiteSpace($timestampUrl)) {
  $timestampUrl = "http://timestamp.digicert.com"
}

if ([string]::IsNullOrWhiteSpace($certFile) -or [string]::IsNullOrWhiteSpace($certPassword)) {
  Write-Error "Set WKAI_SIGN_CERT_FILE and WKAI_SIGN_CERT_PASSWORD environment variables before signing."
}

if (-not (Test-Path $certFile)) {
  Write-Error "Certificate file not found: $certFile"
}

$signToolCmd = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
if ($null -eq $signToolCmd) {
  Write-Error "signtool.exe was not found in PATH. Install Windows SDK or add signtool to PATH."
}

$signTool = $signToolCmd.Source

if (-not (Test-Path $bundleDir)) {
  Write-Error "Bundle directory not found: $bundleDir. Build first using 'npm run tauri:build'."
}

$filesToSign = Get-ChildItem -Path $bundleDir -Recurse -File |
  Where-Object { $_.Extension -in @(".exe", ".msi") } |
  Sort-Object FullName

if ($filesToSign.Count -eq 0) {
  Write-Error "No .exe or .msi files found in $bundleDir"
}

Write-Host "Signing $($filesToSign.Count) Windows artifact(s)..."
Write-Host "Timestamp URL: $timestampUrl"

foreach ($file in $filesToSign) {
  Write-Host ""
  Write-Host "Signing: $($file.FullName)"
  & $signTool sign /fd SHA256 /f $certFile /p $certPassword /tr $timestampUrl /td SHA256 /v $file.FullName
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Signing failed for: $($file.FullName)"
  }

  & $signTool verify /pa /v $file.FullName
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Signature verification failed for: $($file.FullName)"
  }
}

Write-Host ""
Write-Host "All Windows artifacts have been signed and verified."
