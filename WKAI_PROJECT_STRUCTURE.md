# WKAI — Complete Project Structure
> All three repos. Every file. Every dependency. Every design decision explained.

---

## Repository Overview

```
wkai/             Instructor desktop app    Tauri (Rust) + React + TypeScript
wkai-backend/     Backend server            Node.js + WebSocket + PostgreSQL + Redis
wkai-student/     Student web app           React + TypeScript + Vite
```

---

## AI Stack (Groq — replaces OpenAI entirely)

| Task                  | Model                                  | Speed          |
|-----------------------|----------------------------------------|----------------|
| Screen frame analysis | meta-llama/llama-4-scout-17b-16e-instruct | ~300 tok/s  |
| Error diagnosis       | llama3-70b-8192                        | ~300 tok/s     |
| Audio transcription   | whisper-large-v3                       | ~180× realtime |

**Why Groq over OpenAI / HuggingFace:**
- Groq is OpenAI-API-compatible → minimal migration, same SDK shape
- 300+ tokens/sec makes real-time workshop guide generation practical
- Whisper-large-v3 on Groq transcribes a 30s audio chunk in under 1 second
- HuggingFace Transformers pipeline requires local GPU — impractical for server use
- Free tier at console.groq.com is generous enough for workshop volumes

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         wkai-backend (Node.js)                       │
│                                                                      │
│   Express REST API                WebSocket Server                   │
│   ├── POST /api/sessions          ws://host/ws?session=CODE          │
│   ├── GET  /api/sessions/:code       ├── instructor client (1)       │
│   ├── PATCH /api/sessions/:id/end    └── student clients (n)         │
│   ├── GET  /api/sessions/:id/guide                                   │
│   ├── POST /api/ai/transcribe     AI Pipeline (Groq)                 │
│   ├── POST /api/ai/diagnose       ├── pipeline.js  → Llama-4 Scout  │
│   ├── POST /api/files/upload      ├── whisper.js   → Whisper-v3     │
│   └── POST /api/run               └── errorDiagnosis.js → Llama3-70b│
│                                                                      │
│   PostgreSQL                      Redis                              │
│   ├── sessions                    ├── session:{id}  (room state)    │
│   ├── guide_blocks                ├── students:{id} (online count)  │
│   ├── comprehension_questions     └── TTL: 24 hours                 │
│   ├── shared_files                                                   │
│   └── error_resolutions                                              │
└──────────────────────────────────────────────────────────────────────┘
        ▲  HTTP + WS                          ▲  HTTP + WS
        │                                     │
┌───────┴──────────────┐           ┌──────────┴────────────┐
│  wkai (Instructor)   │           │  wkai-student         │
│  Tauri Desktop App   │           │  React SPA (Browser)  │
│                      │           │                       │
│  Rust (src-tauri/)   │           │  JoinPage             │
│  ├── screen capture  │           │  └── 6-box code input │
│  │   screenshots     │           │                       │
│  ├── audio capture   │           │  RoomPage             │
│  │   cpal (mic)      │           │  ├── GuideFeed        │
│  ├── file watcher    │           │  ├── ComprehensionModal│
│  │   notify crate    │           │  ├── FilesPanel       │
│  └── system tray     │           │  ├── CodeEditor       │
│      Tauri tray API  │           │  └── ErrorHelper      │
│                      │           │                       │
│  React (src/)        │           │  Hooks                │
│  ├── SetupPage       │           │  └── useRoomSocket    │
│  ├── SessionPage     │           │      (WS auto-reconnect)
│  │   ├── GuidePanel  │           │                       │
│  │   ├── FileShare   │           │  Store (Zustand)      │
│  │   ├── RoomInfo    │           │  session, guide,      │
│  │   └── Capture     │           │  files, errors        │
│  └── SettingsPage    │           └───────────────────────┘
└──────────────────────┘
```

---

## Data Flow — Screen Frame to Student Guide

```
[Instructor screen]
       │ Rust screenshots crate captures PNG every 10s
       │ base64-encode in Rust thread
       │ emit "screen-frame" Tauri event
       ↓
[React useTauriEvents.ts]
       │ receive event
       │ POST frame to backend via WebSocket message type "screen-frame"
       ↓
[wkai-backend ws/server.js → handleScreenFrame()]
       │ call processScreenFrame(sessionId, frameB64)
       ↓
[src/ai/pipeline.js — Groq Llama-4 Scout Vision]
       │ system prompt + image_url content block
       │ optional: last Whisper transcript from Redis
       │ returns JSON: { guideBlocks[], comprehensionQuestion }
       ↓
[ws/server.js]
       │ INSERT guide_blocks → PostgreSQL
       │ broadcast { type: "guide-block", payload } → all students in room
       ↓
[wkai-student useRoomSocket.ts → dispatch()]
       │ addGuideBlock(payload) → Zustand store
       ↓
[GuideFeed.tsx]
       └── renders new card with slide-up animation
```

---

## WebSocket Message Reference

| Message Type            | Direction              | Payload                                    |
|-------------------------|------------------------|--------------------------------------------|
| screen-frame            | instructor → server    | { frameB64, timestamp }                    |
| guide-block             | server → students      | GuideBlock object                          |
| comprehension-question  | server → students      | ComprehensionQuestion object               |
| comprehension-answer    | student → server       | { questionId, answerIndex }                |
| comprehension-result    | server → student       | { questionId, correct, explanation }       |
| file-shared             | server → students      | { id, name, url, sizeBytes, sharedAt }     |
| student-error           | student → server       | { sessionId, studentId, errorMessage }     |
| error-resolved          | server → student       | ErrorResolution object                     |
| student-joined          | server → room          | { count }                                  |
| student-left            | server → room          | { count }                                  |
| session-ended           | server → room          | { message }                                |
| session-state           | server → new client    | { session, guideBlocks[], sharedFiles[] }  |
| error                   | server → client        | { message }                                |

---

## ══════════════════════════════════════════════════════
## REPO 1: wkai/ — Instructor Desktop App
## ══════════════════════════════════════════════════════

```
wkai/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── index.html
│
├── src-tauri/                          ← Rust backend (compiled into the binary)
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                     ← binary entry point
│       ├── lib.rs                      ← Tauri setup, tray, command registration
│       ├── capture.rs                  ← screen capture state machine
│       ├── audio.rs                    ← cpal mic recorder, WAV encoder, chunker
│       ├── session.rs                  ← session state management
│       ├── ai.rs                       ← placeholder: future Rust-side AI calls
│       ├── file_watcher.rs             ← placeholder: high-level watch logic
│       └── commands/
│           ├── mod.rs                  ← re-exports session, capture, files
│           ├── session.rs              ← create_session, end_session, get_status
│           ├── capture.rs              ← start_capture, stop_capture (runs loop)
│           └── files.rs                ← watch_folder, share_file, list_watched_files
│
└── src/                                ← React + TypeScript frontend
    ├── main.tsx                        ← ReactDOM.createRoot
    ├── router.tsx                      ← createBrowserRouter: / → setup, /session, /settings
    ├── index.css                       ← Tailwind directives + WKAI design tokens
    │
    ├── types/
    │   └── index.ts                    ← Session, GuideBlock, SharedFile, CaptureState,
    │                                      WsEvent, AppSettings, ComprehensionQuestion
    │
    ├── store/
    │   └── index.ts                    ← Zustand store: session, capture, guide,
    │                                      sharedFiles, studentCount, settings
    │
    ├── lib/
    │   └── tauri.ts                    ← typed invoke() wrappers for all Rust commands:
    │                                      createSession, startCapture, watchFolder,
    │                                      shareFile, listWatchedFiles, stopCapture, endSession
    │
    ├── hooks/
    │   ├── useTauriEvents.ts           ← listen() for screen-frame, audio-chunk, file-changed
    │   │                                  audio-chunk → POST /api/ai/transcribe (Groq Whisper)
    │   └── useWebSocket.ts             ← WS client with auto-reconnect, dispatches to store
    │
    ├── pages/
    │   ├── SetupPage.tsx               ← instructor name, workshop title, folder picker
    │   │                                  → calls createSession + startCapture + watchFolder
    │   ├── SessionPage.tsx             ← 2-column live dashboard (sidebar + guide feed)
    │   └── SettingsPage.tsx            ← GROQ_API_KEY, backend URL, frames/min, audio toggle
    │
    └── components/
        ├── shared/
        │   └── AppShell.tsx            ← sidebar nav (icons), top status bar (room code,
        │                                  capture dot, student count), <Outlet/>
        └── instructor/
            ├── RoomInfo.tsx            ← room code display with copy-to-clipboard
            ├── CaptureStatus.tsx       ← live/idle dot, AI processing indicator, frame count
            ├── GuidePanel.tsx          ← scrolling feed of guide blocks (instructor preview)
            ├── FileSharePanel.tsx      ← folder browser tabs: Files | Shared
            │                              hover → Share button → shareFile() Rust command
            └── EndSessionButton.tsx    ← double-tap confirm → stopCapture + endSession + navigate
```

### Key Dependencies (wkai/package.json)

| Package                  | Purpose                                      |
|--------------------------|----------------------------------------------|
| @tauri-apps/api ^2.0     | invoke(), listen(), emit() — JS↔Rust bridge  |
| @tauri-apps/plugin-fs    | File system access from JS                   |
| @tauri-apps/plugin-shell | Open external URLs                           |
| react ^18 + react-dom    | UI framework                                 |
| react-router-dom ^6      | Client-side routing                          |
| zustand ^5               | Global state store                           |
| socket.io-client ^4      | (backup WS client — primary is native WS)    |
| lucide-react             | Icons                                        |
| tailwindcss ^3           | Utility CSS                                  |
| @tauri-apps/cli ^2       | tauri dev / tauri build CLI                  |
| vite ^5 + @vitejs/plugin-react | Build tooling                         |

### Key Dependencies (Cargo.toml)

| Crate             | Purpose                                        |
|-------------------|------------------------------------------------|
| tauri ^2          | Desktop app framework (Rust + WebView)         |
| tauri-plugin-fs   | File system Tauri plugin                       |
| tauri-plugin-shell| Shell access plugin                            |
| screenshots ^0.8  | Cross-platform screen capture                  |
| cpal ^0.15        | Cross-platform audio input (microphone)        |
| notify ^6         | File system watcher (for share folder)         |
| reqwest ^0.12     | HTTP client → Groq API calls from Rust         |
| base64 ^0.22      | Encode screenshot PNG as base64                |
| serde + serde_json| JSON serialization for Tauri commands          |
| tokio ^1          | Async runtime for background capture loops     |
| uuid ^1           | Generate session IDs and room codes            |
| chrono ^0.4       | Timestamps                                     |
| anyhow + thiserror| Error handling                                 |
| flume ^0.11       | Multi-producer channel for capture threads     |

---

## ══════════════════════════════════════════════════════
## REPO 2: wkai-backend/ — Node.js Backend Server
## ══════════════════════════════════════════════════════

```
wkai-backend/
├── .env.example                        ← all env vars documented (GROQ_API_KEY, DB, Redis, Cloudinary)
├── package.json
├── docker-compose.yml                  ← postgres:16-alpine + redis:7-alpine
├── README.md
│
└── src/
    ├── index.js                        ← startup: connectDb → connectRedis → http.createServer
    │                                      → initWebSocketServer → listen(:4000)
    ├── app.js                          ← Express: helmet, cors, morgan, JSON (20mb limit)
    │                                      routes: /api/sessions, /api/ai, /api/files, /api/run
    │
    ├── db/
    │   ├── client.js                   ← pg.Pool (max 10 conn), query() helper with timing logs
    │   ├── redis.js                    ← Redis client, helpers: setSessionData, getSessionData,
    │   │                                  incrementStudentCount, decrementStudentCount
    │   └── migrate.js                  ← run once: creates 5 tables (sessions, guide_blocks,
    │                                      comprehension_questions, shared_files, error_resolutions)
    │
    ├── ai/
    │   ├── groqClient.js               ← shared Groq SDK instance + MODELS constants:
    │   │                                  vision: llama-4-scout-17b, text: llama3-70b,
    │   │                                  whisper: whisper-large-v3
    │   ├── pipeline.js                 ← processScreenFrame(sessionId, frameB64, transcript)
    │   │                                  → Groq vision → JSON guide blocks + comprehension Q
    │   ├── errorDiagnosis.js           ← diagnoseError(errorMessage)
    │   │                                  → Groq llama3-70b → diagnosis + fix command
    │   └── whisper.js                  ← transcribeAudio(audioB64, mimeType)
    │                                      → write temp WAV → Groq whisper-large-v3 → text
    │
    ├── ws/
    │   └── server.js                   ← WebSocketServer on /ws?session=CODE&role=instructor|student
    │                                      rooms: Map<sessionId, Set<WebSocket>>
    │                                      handlers: screen-frame, file-shared, student-error,
    │                                               comprehension-answer
    │                                      helpers: broadcast(), broadcastToStudents(), getRoomSize()
    │
    ├── routes/
    │   ├── sessions.js                 ← POST /api/sessions           create session + Redis cache
    │   │                                  GET  /api/sessions/:roomCode  join validation + full state
    │   │                                  PATCH /api/sessions/:id/end  end + Redis cleanup + WS notify
    │   │                                  GET  /api/sessions/:id/guide fetch all guide blocks
    │   ├── ai.js                       ← POST /api/ai/transcribe      Groq Whisper
    │   │                                  POST /api/ai/diagnose        Groq Llama3-70b
    │   ├── files.js                    ← POST /api/files/upload        multer → Cloudinary (25GB free)
    │   └── runner.js                   ← POST /api/run                 sandboxed code execution
    │                                      supports: python3, node, npx ts-node, bash
    │                                      timeout: 10s, output cap: 8KB
    │
    └── middleware/
        └── errorHandler.js             ← Zod errors → 400, Postgres unique violation → 409,
                                           generic → 500 (message shown in dev only)
```

### Database Schema

```sql
sessions (
  id UUID PK, room_code CHAR(6) UNIQUE, instructor_name TEXT,
  workshop_title TEXT, status TEXT, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ
)

guide_blocks (
  id UUID PK, session_id UUID FK, type TEXT, title TEXT, content TEXT,
  code TEXT, language TEXT, locked BOOLEAN, created_at TIMESTAMPTZ
)

comprehension_questions (
  id UUID PK, session_id UUID FK, guide_block_id UUID FK,
  question TEXT, options JSONB, correct_index INT, explanation TEXT
)

shared_files (
  id UUID PK, session_id UUID FK, name TEXT, url TEXT,
  size_bytes BIGINT, shared_at TIMESTAMPTZ
)

error_resolutions (
  id UUID PK, session_id UUID FK, student_id TEXT,
  error_message TEXT, diagnosis TEXT, fix_command TEXT,
  resolved BOOLEAN, created_at TIMESTAMPTZ
)
```

### Key Dependencies (package.json)

| Package        | Purpose                                               |
|----------------|-------------------------------------------------------|
| groq-sdk ^0.8  | Groq API: vision, text generation, Whisper audio      |
| express ^4.21  | REST API framework                                    |
| ws ^8.18       | WebSocket server                                      |
| pg ^8.13       | PostgreSQL client (node-postgres)                     |
| redis ^4.7     | Redis client                                          |
| cloudinary      | Cloudinary file uploads (free tier)         |
| zod ^3.23      | Request body validation                               |
| multer         | Multipart file upload handling                        |
| dotenv         | Environment variable loading                          |
| helmet         | HTTP security headers                                 |
| cors           | Cross-origin request handling                         |
| morgan         | HTTP request logging                                  |
| uuid ^10       | UUID generation                                       |

### Environment Variables (.env)

| Variable                      | Required | Description                              |
|-------------------------------|----------|------------------------------------------|
| PORT                          | No       | Server port (default: 4000)              |
| NODE_ENV                      | No       | development / production                 |
| DATABASE_URL                  | Yes      | PostgreSQL connection string             |
| REDIS_URL                     | Yes      | Redis connection string                  |
| GROQ_API_KEY                  | Yes      | From console.groq.com — free, no card    |
| CLOUDINARY_CLOUD_NAME         | Yes      | From cloudinary.com dashboard            |
| CLOUDINARY_API_KEY            | Yes      | From cloudinary.com dashboard            |
| CLOUDINARY_API_SECRET         | Yes      | From cloudinary.com dashboard            |
| JWT_SECRET                    | No       | Any long random string                   |

---

## ══════════════════════════════════════════════════════
## REPO 3: wkai-student/ — Student Web App
## ══════════════════════════════════════════════════════

```
wkai-student/
├── package.json
├── vite.config.ts                      ← port 3000, proxy /api and /ws → localhost:4000
├── tsconfig.json
├── tailwind.config.js                  ← WKAI tokens + slide-up / fade-in animations
├── postcss.config.js
├── index.html
│
└── src/
    ├── main.tsx                        ← ReactDOM.createRoot
    ├── router.tsx                      ← / → JoinPage, /room/:code → RoomPage
    ├── index.css                       ← Tailwind + shared design tokens
    │
    ├── types/
    │   └── index.ts                    ← Session, GuideBlock (BlockType), ComprehensionQuestion,
    │                                      ComprehensionResult, SharedFile, ErrorResolution,
    │                                      WsMessage, WsEventType, RoomTab
    │
    ├── store/
    │   └── index.ts                    ← Zustand store:
    │                                      ├── studentId (stable per browser session)
    │                                      ├── session / sessionEnded
    │                                      ├── connected / studentCount
    │                                      ├── guideBlocks / addGuideBlock / setGuideBlocks
    │                                      ├── pendingQuestion / answeredQuestions
    │                                      ├── sharedFiles / newFileCount (badge)
    │                                      ├── resolution / errorDiagnosing
    │                                      └── activeTab / setActiveTab
    │
    ├── lib/
    │   └── api.ts                      ← joinRoom(code) → GET /api/sessions/:code
    │                                      diagnoseError(msg) → POST /api/ai/diagnose (fallback)
    │
    ├── hooks/
    │   └── useRoomSocket.ts            ← WebSocket client for student
    │                                      URL: /ws?session=CODE&role=student&studentId=ID
    │                                      auto-reconnect every 3s (unless sessionEnded)
    │                                      dispatches all WS event types → Zustand store
    │                                      exposes send() for outbound messages
    │
    └── pages/
    │   ├── JoinPage.tsx                ← 6 individual character inputs (animated)
    │   │                                  paste support, auto-focus, auto-advance
    │   │                                  → joinRoom() validation → navigate /room/:code
    │   ├── RoomPage.tsx                ← mounts RoomHeader + TabBar + active panel
    │   │                                  + ComprehensionModal overlay
    │   │                                  redirects to / on hard refresh (no session in store)
    │   └── NotFound.tsx                ← 404
    │
    └── components/
        ├── shared/
        │   ├── RoomHeader.tsx          ← session title, instructor name, room code,
        │   │                              connected dot (green pulse / grey), student count
        │   ├── TabBar.tsx              ← 4 tabs: Guide | Files (badge) | Editor | Errors
        │   ├── SessionEndedBanner.tsx  ← amber bar: "Session ended" + Leave button
        │   └── CodeEditor.tsx          ← Monaco editor (same engine as VS Code)
        │                                  language picker: Python, JS, TS, Bash, SQL
        │                                  Run button → POST /api/run → output pane
        │                                  Reset button → restore starter code
        │
        ├── guide/
        │   └── GuideFeed.tsx           ← scrolling card feed, auto-scrolls to latest
        │                                  card types: step (indigo), tip (yellow),
        │                                  code (emerald), explanation (sky)
        │                                  CodeBlock sub-component: copy-to-clipboard
        │                                  EmptyState: pulsing "Listening for content…"
        │
        ├── comprehension/
        │   └── ComprehensionModal.tsx  ← full-screen backdrop overlay (blocks the UI)
        │                                  ABCD option buttons with correct/wrong styling
        │                                  shows explanation after submit
        │                                  wrong answer → "Try Again" (stays locked)
        │                                  correct answer → "Unlocking next content…" → dismiss
        │
        ├── files/
        │   └── FilesPanel.tsx          ← list of instructor-shared files
        │                                  icons by extension: code / image / text / generic
        │                                  hover → Download button (direct link)
        │                                  EmptyState when no files shared yet
        │
        └── error/
            └── ErrorHelper.tsx         ← textarea for pasting terminal errors
                                           send → WS student-error message
                                           15s fallback → REST /api/ai/diagnose
                                           ResolutionCard: diagnosis, fix command (copy),
                                           multi-step fix list, success bar, "Try another"
```

### Key Dependencies (package.json)

| Package                  | Purpose                                              |
|--------------------------|------------------------------------------------------|
| react ^18 + react-dom    | UI framework                                         |
| react-router-dom ^6      | Client-side routing                                  |
| zustand ^5               | Global state store                                   |
| @monaco-editor/react ^4  | VS Code Monaco editor (code editor tab)              |
| xterm ^5 + xterm-addon-fit| Terminal emulator (installed, wired to /api/run)    |
| framer-motion ^11        | Animation library (available for transitions)        |
| lucide-react             | Icons                                                |
| axios ^1.7               | HTTP client for REST API calls                       |
| tailwindcss ^3           | Utility CSS                                          |
| vite ^5                  | Build tooling with /api proxy to backend             |

---

## Getting Started (Full Stack)

### Prerequisites
```
Node.js >= 20          (install in Kali WSL2)
Rust + cargo           (install in Kali WSL2)
Docker Desktop         (install on Windows, enable Kali WSL2 integration)
Groq API key           (free at console.groq.com)
```

### Paths
```
WSL2 root:    ~/Projects/wkai/
Windows root: \\wsl.localhost\kali-linux\home\rafan\Projects\wkai\
```

### Step 1 — Databases (Kali WSL2 terminal)
```bash
cd ~/Projects/wkai/wkai-backend
docker compose up -d           # starts Postgres + Redis
docker compose ps              # verify both show "running"
```

### Step 2 — Backend (Kali WSL2 terminal)
```bash
cd ~/Projects/wkai/wkai-backend
npm install
cp .env.example .env
# edit .env and fill in:
#   GROQ_API_KEY           → console.groq.com (free)
#   CLOUDINARY_CLOUD_NAME  → cloudinary.com dashboard
#   CLOUDINARY_API_KEY     → cloudinary.com dashboard
#   CLOUDINARY_API_SECRET  → cloudinary.com dashboard
npm run db:migrate             # creates all 5 tables (first time only)
npm run dev                    # → http://localhost:4000
```

### Step 3 — Student web app (Kali WSL2 terminal)
```bash
cd ~/Projects/wkai/wkai-student
npm install
npm run dev                    # → http://localhost:3000
```

### Step 4 — Instructor desktop app (Windows PowerShell)
```powershell
# Must run in Windows PowerShell — not WSL2 — Tauri builds a Windows .exe
cd \\wsl.localhost\kali-linux\home\rafan\Projects\wkai\wkai
npm install
npm run tauri:dev              # Rust compiles (~3-5 min first time), then window opens
```

### Step 5 — Start a workshop
1. Open the desktop app → fill in name + workshop title → click **Start Session**
2. App gives you a 6-character room code (e.g. `A3F9KX`) and moves to system tray
3. Students open `http://localhost:3000`, enter the code
4. Teach normally — WKAI watches, generates, distributes

---

## Deployment Notes

| Service         | Recommended target                  |
|-----------------|-------------------------------------|
| wkai-backend    | Railway / Render / EC2 (Docker)     |
| wkai-student    | Vercel / Cloudflare Pages           |
| PostgreSQL      | Railway Postgres / Supabase         |
| Redis           | Railway Redis / Upstash             |
| File storage    | Cloudinary (free — cloudinary.com)   |
| Instructor app  | Self-hosted (runs on instructor PC) |