# WKAI Changelog

Consolidated release notes for implementation and platform work across `wkai`, `wkai-student`, `wkai-backend`, CI, and deployment.

## 2026-04 - Release Pipeline + Deployment Reliability

### CI/CD and versioning
- Fixed auto-bump/tag flow so it no longer stalls on existing tags (for example when version files lag behind remote tags).
- Updated bump workflow to continue incrementing until a unique `v*` tag is found.
- Restored combined release workflow view with matrix builds in the same run (`windows`, `ubuntu`, `macos`).
- Documented and verified safe branch sync flow (`pull --rebase`) to avoid push rejection when auto-release commits land first.

### Build platform fixes
- Resolved macOS CI build failure from unused `xcap` crate compile break (`E0282`) by removing stale dependency.
- Revalidated Tauri Rust build after lockfile update.
- Noted that macOS compile success and Gatekeeper trust are separate concerns (signing/notarization still required for frictionless external installs).

## 2026-04 - App Connectivity and Update Experience

### Hidden backend environment switching (desktop app)
- Removed instructor-visible backend URL editing from settings.
- Enforced internal backend routing:
  - dev mode (`tauri:dev`) -> local backend
  - packaged/release app -> Render backend
- Added optional env override support for controlled internal changes.

### In-app updater
- Added Tauri updater plugin integration (Rust + frontend).
- Implemented custom update UX with:
  - `Update now`
  - `Later`
- Added per-version dismiss behavior so `Later` does not repeatedly prompt for the same version.
- Added updater ACL capability permissions to resolve command-authorization errors.
- Finalized check cadence and silence policy:
  - check at app open
  - check every 1 hour while running
  - no update/check failure remains silent
  - only install failures surface actionable retry UI

## 2026-04 - Live Learning Stack and Product Enhancements

### Instructor app (`wkai`)
- Improved capture reliability/compression and capture-status behavior.
- Added live share toggle, debug panel, student panel, join toasts, and inbox panel.
- Added microphone test and AI connectivity diagnostics in settings.
- Hardened recording stop and end-session cleanup.

### Student app (`wkai-student`)
- Added student name join flow and persistence.
- Added session-ended modal and stronger room lifecycle handling.
- Added `Live` tab and Q&A tab enhancements.
- Set `Live` as default tab on join.

### Backend (`wkai-backend`)
- Enhanced WebSocket session state with student names and list state.
- Added student message routing and instructor reply flow.
- Added AI fallback timer for unanswered student questions.
- Added Redis student-list helpers.
- Added AI retry and token-efficiency improvements.

## 2026-04 - Phase 1 WebRTC

- Added shared signaling contract:
  - `webrtc-offer`
  - `webrtc-answer`
  - `webrtc-ice-candidate`
  - `webrtc-session-reset`
- Added backend signaling relay with targeted student routing.
- Added instructor WebRTC publisher with per-student peer lifecycle management.
- Added student WebRTC receiver and live video rendering path.
- Preserved screenshot ingest pipeline for AI analysis cadence where required.

## 2026-04 - Centralized AI Agent Platform

- Introduced modular agent architecture under `wkai-backend/src/ai/Agents`.
- Added `ScreenAgent`, `VoiceAgent`, `QuizAgent`, `DebugAgent`, `IntentAgent`, and `MessageAgent`.
- Added shared base conventions, registry, orchestration, and metrics.
- Added `GET /api/ai/agents` health/metrics endpoint.
- Added agent contract tests (`npm run test:agents`).

## Validation Snapshots Run During Implementation

- `npx tsc --noEmit` (`wkai`, `wkai-student`)
- `npm run build` (`wkai`, `wkai-student`)
- `cargo check` (`wkai/src-tauri`)
- `node --check` (modified backend modules)
- `npm run test:agents` (backend agent contracts)

