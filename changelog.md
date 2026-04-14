# WKAI Changelog

This changelog consolidates the major implementation work completed across `wkai`, `wkai-student`, and `wkai-backend`.

## 2026-04 - Platform Stabilization + Live Stack

### Core stability and diagnostics
- Hardened instructor capture pipeline in Tauri/Rust.
- Added extensive backend and frontend debug logging for HTTP + WS flows.
- Fixed multiple reconnection/race issues in instructor and student WebSocket hooks.
- Improved join/session lifecycle state handling to prevent stale-session kickouts.

### Live streaming evolution
- Implemented WebRTC signaling contract and relay:
  - `webrtc-offer`
  - `webrtc-answer`
  - `webrtc-ice-candidate`
  - `webrtc-session-reset`
- Added instructor WebRTC publisher with per-student peer management.
- Added student WebRTC receiver and live `<video>` playback.
- Added student background live behavior toggle for tab-hidden handling.
- Removed screenshot-based student preview path; student live display now uses WebRTC-only flow.

### Recording + session controls
- Added instructor recording panel with start/stop/download flow.
- Hardened recording stop cleanup and force-stop on end session.

### Student UX and learning flow
- Set student default tab to `Live` on join/bootstrap.
- Added AI live transcript explanation display in student live view.
- Added transcript-driven comprehension generation cadence on backend.
- Merged student `Editor` + `Errors` into unified `AI Helper` workspace.

### AI reliability and behavior changes
- Added clearer AI diagnosis availability messaging (including usage-limit and API-unavailable states).
- Removed speculative heuristic fallback fixes for diagnosis when AI is unavailable.
- Preserved AI screenshot ingest path for backend analysis cadence while decoupling student live rendering.

## 2026-04 - Centralized AI Agent Platform

Introduced centralized AI agent architecture in backend under:

`wkai-backend/src/ai/Agents`

### Added agents
- `ScreenAgent`
- `VoiceAgent`
- `QuizAgent`
- `DebugAgent`
- `IntentAgent`
- `MessageAgent`

### Added platform components
- `BaseAgent` conventions:
  - `name`
  - `version`
  - `invoke`
  - `healthCheck`
- Agent registry + exports:
  - `AgentRegistry.js`
  - `index.js`
- Agent orchestration module:
  - `AgentOrchestrator.js` (`Voice -> Screen -> Quiz` workflow)

### Feature flags
Per-agent env flags added for safe rollout:
- `AI_AGENT_SCREEN_AGENT_ENABLED`
- `AI_AGENT_VOICE_AGENT_ENABLED`
- `AI_AGENT_QUIZ_AGENT_ENABLED`
- `AI_AGENT_DEBUG_AGENT_ENABLED`
- `AI_AGENT_INTENT_AGENT_ENABLED`
- `AI_AGENT_MESSAGE_AGENT_ENABLED`

### Agent metrics and observability
Tracked per-agent:
- call count
- latency (last/avg/total)
- error count and error rate
- token cost (when usage metadata is available)
- last invoke/error metadata and tags

New endpoint:
- `GET /api/ai/agents` -> agent health + metrics snapshot

### Contract tests
Added backend contract tests for agent lifecycle and registry:
- `wkai-backend/tests/agents.contract.test.js`
- Script: `npm run test:agents`

## Validation snapshots run during implementation
- `npx tsc --noEmit` (instructor/student apps)
- `cargo check` (Tauri Rust layer)
- `npm run build` (instructor/student)
- `node --check` on modified backend modules
- `npm run test:agents` for agent contracts

