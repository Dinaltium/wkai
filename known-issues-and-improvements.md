# WKAI — Remaining Work & Design Notes

Outstanding items only. Resolved audit findings are collapsed into the **Completed** ledger at the bottom (see git history for detail). Planning/reference doc — implementation happens per-request.

Related: [native-capture-obs-level-plan.md](native-capture-obs-level-plan.md) — deep dive on the capture/record/stream rebuild (Path A vs Path B).

---

## 1. Recording / Streaming Pipeline Rebuild (Instructor App) — ARCHITECTURE LOCKED, PHASE 0 IN PROGRESS

Hybrid architecture finalized (2026-07-03) in [native-capture-obs-level-plan.md](native-capture-obs-level-plan.md): Rust native capture (WGC/DXGI GPU or GDI CPU, selectable) → raw frames piped to a bundled FFmpeg that `split`s into independent record (mp4/mkv) + stream (`-f whip`) chains → **LiveKit** SFU fans out per room to N students (mesh killed). GPU/CPU selectable at capture and encode. Phase 0 spike kit runnable at [spike/](spike/) (probe encoders, benchmark CPU vs GPU, WHIP smoke-test) — awaiting local run results to lock defaults and start Phase 1. The current browser path (below) is what gets replaced/deleted.

- **Capture is screenshot-polling** — `xcap` polls the screen (GDI-class BitBlt) in [windows/capture.rs](wkai/src-tauri/src/native_capture/windows/capture.rs:1). Replace with frame-driven GPU capture: WGC/DXGI (Win), ScreenCaptureKit (Mac), PipeWire (Linux) — or ffmpeg capture inputs.
- **Frames are JPEG, not video** — each frame independently JPEG-encoded ([frame_pipeline.rs](wkai/src-tauri/src/native_capture/frame_pipeline.rs:1)), no inter-frame compression, high CPU/bandwidth, no tunable bitrate. Replace with H.264 hardware encode (native API or ffmpeg).
- **Recording uses browser `MediaRecorder`** — `RecordingPanel.tsx` + `useNativeCapture.ts` via `canvas.captureStream()`, no explicit bitrate/quality control. Replace with native mux to disk (Rust `mp4` crate or ffmpeg with explicit `-b:v`/`-crf`).
- **Live delivery is browser WebRTC + P2P mesh** — [useWebRtcPublisher.ts](wkai/src/hooks/useWebRtcPublisher.ts:48) creates one `RTCPeerConnection` per student from the canvas stream (N× encode + N× upload in the instructor's browser). Only STUN configured, **no TURN** (fails behind symmetric NAT / strict firewalls). Replace with a single native encode pushed once to a central relay/SFU (WHIP) that fans out to students; add a TURN server. Students' receive-side code is unchanged.
- **Quality controls don't reach the real pipeline** — `SettingsPage.tsx` fps/JPEG presets only tune the preview poll rate, not WebRTC encode bitrate or recorded-file bitrate. Once on real H.264, wire the same UI to encoder flags (bitrate/CRF/resolution/fps) + a CRF "auto" mode.
- **Linux/macOS capture backends are stubs** — [linux/capture.rs](wkai/src-tauri/src/native_capture/linux/capture.rs:44) / [mac/capture.rs](wkai/src-tauri/src/native_capture/mac/capture.rs:44) return `"linux-stub"`/`"macos-stub"`; only Windows is real. Build after the Windows path is proven.

**Recommended path** (from the plan doc): Path B (ffmpeg sidecar + WHIP) + mesh→SFU. Decide A vs B after a short Windows spike measuring real CPU/latency. Windows-first phasing.

---

## 2. Backend Media Hosting — NOT STARTED

There is **no server-side media component**. Cloudinary is only for file-share uploads; live video is pure P2P mesh with the backend relaying signaling only. To make "streamed and viewed from a hosted location" true, add a WHIP-receiving relay/SFU as new backend infrastructure (feeds the existing signaling relay / student receive path). Pairs with Section 1's live-delivery replacement.

---

## 3. Horizontal-Scale Session State (Redis room state) — NOT DONE (needs infra decision)

In-memory `rooms = new Map()` in `ws/server.js` can't be shared across instances, so the backend can't run more than one instance behind a load balancer (an instructor and their students could land on different processes). Live WebSocket handles can't be serialised to Redis, so this isn't a simple move — it needs sticky sessions **plus** a Redis pub/sub fan-out redesign, and a real infra decision.

Mitigation already shipped (single-instance): durable roster/session data in Redis + client auto-reconnect, so students survive a restart. That covers the current deployment; the pub/sub redesign is only needed for true multi-instance scale.

---

## 4. Test Coverage — STARTED (security/reliability core covered)

Added and **passing (17 tests, run via `npm test`)**: `sessionAccess.test.js` (token issue/verify/expiry/tamper/role-gate/`requireSessionToken` middleware/`extractToken`), `sessionQueue.test.js` (per-session concurrency cap, session isolation, queue-full rejection), `rateLimit.test.js` (under/over limit, per-key, window reset, headers). These modules use only Node builtins so they run with no `npm install`.

Still uncovered: route-level + WS-handshake integration tests (need pg/redis/express mocking or a test harness), and frontend hook/component tests. CI still doesn't run tests on PR — wiring `npm test` into a CI job is a quick follow-up.

---

## 5. Remaining Doc Drift — MOSTLY DONE

- (DONE) Colab-assist feature + `ColabAgent`/`UrlAccessAgent` + `colabAssistAgent`/`messageAgent` graphs now in `wkai-backend/README.md` architecture tree + `/api/ai/colab-assist` and file routes in the API table.
- (DONE) WebRTC signaling WS types + the new token-auth requirement now documented in `wkai-backend/README.md`.
- (DONE) `.env.example` created + gitignore exception.
- Still open: no DB schema/migration `.sql` files — only `migrate.js`; schema reproducibility unverified. Changelog's "Live default tab" line stale vs code's "guide" default (left as history).

---

## 6. Uncommitted Work-In-Progress

Nothing committed yet this cycle. Working tree holds: the pre-existing native-capture/WebRTC hotfix WIP (from before this cycle) **plus** all the security/AI/reliability + token-auth changes made this cycle. Commit in coherent chunks; the token-auth change spans backend + `wkai` (incl. Rust) + `wkai-student` and must ship together.

**Build/verify before trusting**: `tsc` (both frontends) and `cargo check` (`wkai/src-tauri`) could not be run in-session (no `node_modules`/build deps) — TS + Rust changes are review-only. Backend passes `node --check`.

**Deploy prerequisites** for the token-auth change: breaking protocol change — deploy backend + both apps together (old tokenless clients are rejected); set `STUDENT_JOIN_TOKEN_SECRET` in prod (backend now refuses to boot without it).

---

## 7. New Features — DESIGNED, NOT BUILT

### 7.1 AI quiz anti-cheat (fullscreen lock) — MECHANISM BUILT
Reusable mechanism shipped: `wkai-student/src/hooks/useProctoring.ts` (fullscreen enforce + `fullscreenchange`/`visibilitychange`/blur violation detection, armed-after-entry, single-fire lock) and `components/quiz/ProctoredQuiz.tsx` (start gate → fullscreen quiz body → hard lock screen on violation, `onLocked` callback). Honest limits baked into the copy: catches alt-tab / minimise / fullscreen-exit; **cannot** block a second device or OS screenshots (no browser API — real capture-block needs the native companion app 7.3's `WDA_EXCLUDEFROMCAPTURE`).
Still to build: the actual graded **"AI Test"** feature that consumes this shell — question-bank generation (reuse QuizAgent), a test route/page, scoring, backend persistence, and posting violation timestamps to the instructor. The anti-cheat plumbing is ready to wrap that UI. (Not runtime-tested — no frontend build env in-session.)

### 7.2 AI helps with system / other-app problems (read, never execute)
Don't build an execution path. Student explicitly screen-shares via `getDisplayMedia` (Meet-style, consented, **cross-browser** — captures any window regardless of which browser rendered it) → frame to backend → the vision model already in the stack (`meta-llama/llama-4-scout-17b-16e-instruct`) → diagnosis + suggested commands as text (same shape as today's `ErrorHelper`). No execution anywhere. The user's "Agent Defender" (tool-call interception: strip → flag injection → review) is the right pattern to gate any *future* execution capability, but isn't load-bearing while nothing executes.

Live DOM read/write into a Colab/Jupyter/Kaggle cell (auto-inject a fix) is the only part needing a **browser extension** (content script) — cross-browser DOM access is impossible from a plain web app. Chrome/Edge/Brave/Opera share ~one Manifest V3 build (watch Brave Shields); Firefox needs its own. An extension can't see a different browser's tabs (OS-process boundary) — for read-only visual assist, prefer `getDisplayMedia` (above), which already spans browsers. Recommended extension scope: read-only (read cell/output → suggest → student pastes), not autonomous injection.

### 7.3 Student companion app (FINALIZED decision, not built)
Hybrid model: `wkai-student` web app stays mandatory + zero-install for join/watch/guides/quizzes. A native Tauri **"AI Assist" companion** is optional, installed on-demand only when a student's need escalates past browser capability (cross-browser visual context, screenshot-blocked quizzes). Reuses the instructor's native window-enumeration/capture code (`native_capture/`, capture-only — not the record/broadcast half).

Seamless install/handoff (no re-entry of room code / re-login):
1. Custom URI protocol (`wkai-assist://join?token=...`) registered by the companion at install (Zoom/Slack-style deep-link handoff).
2. Backend issues a **signed launch token** (sessionId + studentId + short TTL) embedded in the deep link — reuses the token infra already built for auth (build once).
3. Web app "Get AI Assist" → backend issues token → tries the protocol URI → if installed, companion verifies token + joins instantly; if not, timeout-fallback → small installer download → retry the same token.
4. Keep the shared native code factored so the companion doesn't bundle instructor-only logic.

---

## Completed (2026-07-02) — for reference; detail in git history

Security (token auth, full-stack): signed instructor + student tokens; WS requires `?token=`, derives role/sessionId/studentId/name from it (closed instructor-role hijack, student impersonation, WS password bypass); server-assigned studentId; timing-safe token compare; fail-fast on unset prod secret; rate limiting on join/create; instructor-only guards on `end`/`memory`, any-token on `guide`; removed dead unsalted-SHA-256 password code.

AI pipeline: per-session concurrency queue (`ai/sessionQueue.js`) around Groq calls to stop the thundering herd; `callWithRetry` broadened to 5xx/network/timeout; comprehension-coach logs instead of silent null; student-error always gets a graceful fallback reply; real metric-based agent `healthCheck` (no more hardcoded stub).

Reliability: Postgres pool 10→20 + 20s connect timeout + idle-error handler; Redis reconnect-with-backoff + `students_active` set TTL; student WS auto-reconnect (survives backend restart).

Docs: created `wkai-backend/.env.example` + gitignore exception.

**2026-07-03** — Recording/streaming: hybrid architecture finalized (LiveKit SFU + Rust-capture→FFmpeg-encode/WHIP), Phase 0 spike kit in `spike/`. Tests: 17 passing unit tests (auth/queue/rate-limit) + `npm test` script. Docs: backend README updated (Colab feature, WebRTC WS types, token auth). Anti-cheat: `useProctoring` hook + `ProctoredQuiz` shell. `PRODUCT.md` written (impeccable init).
