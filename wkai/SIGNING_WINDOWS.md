# Windows Code Signing (WKAI)

To remove the `Unknown publisher` warning, sign the Windows build artifacts (`.exe` / `.msi`) with a valid code-signing certificate.

## 1) Prerequisites

- A trusted code-signing certificate (`.pfx`) from a public CA
- `signtool.exe` available in `PATH` (installed with Windows SDK)

## 2) Configure environment variables (PowerShell)

```powershell
$env:WKAI_SIGN_CERT_FILE = "C:\path\to\your-certificate.pfx"
$env:WKAI_SIGN_CERT_PASSWORD = "your-pfx-password"
$env:WKAI_SIGN_TIMESTAMP_URL = "http://timestamp.digicert.com"
```

`WKAI_SIGN_TIMESTAMP_URL` is optional; it defaults to `http://timestamp.digicert.com`.

## 3) Build and sign

```powershell
npm run tauri:build:signed
```

This command:
- Builds the Tauri app bundle
- Signs all generated `.exe` and `.msi` files inside `src-tauri/target/release/bundle`
- Verifies each signature

## Notes

- SmartScreen reputation may still take time to build for a new certificate/publisher.
- EV certificates typically gain SmartScreen trust faster than standard OV certificates.
