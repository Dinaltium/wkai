# WKAI Backend

Node.js + WebSocket + PostgreSQL + Redis + **LangChain + LangGraph + Groq + Cloudinary**

---

## Project Location

```
WSL2 (Kali):   ~/Projects/wkai/wkai-backend/
Windows:       \\wsl.localhost\kali-linux\home\rafan\Projects\wkai\wkai-backend\
```

---

## AI Architecture

All AI is powered by **Groq** (fast inference) orchestrated by **LangChain** (prompt
management, output parsing, memory) and **LangGraph** (multi-step agent workflows).

```
src/ai/
├── groqClient.js          LangChain ChatGroq instances + raw Groq SDK for Whisper
├── memory.js              Redis-backed LangChain chat history per session
├── prompts.js             ChatPromptTemplates + Zod-based StructuredOutputParsers
├── pipeline.js            Thin shim → graphs/screenPipeline.js
├── errorDiagnosis.js      Thin shim → graphs/errorAgent.js
├── whisper.js             Groq Whisper-large-v3 audio transcription
└── graphs/
    ├── screenPipeline.js  LangGraph: screen analysis workflow (5 nodes)
    ├── errorAgent.js      LangGraph: error diagnosis agent (retry loop)
    └── intentAgent.js     LangGraph: file share intent detection
```

### LangGraph: Screen Analysis Pipeline

```
START
  │
  ▼
[load_context]          Load last 8 messages from Redis session memory
  │
  ├── no frame → END
  │
  ▼
[vision_analysis]       Groq Llama-4 Scout Vision
  │                     screenAnalysisPrompt + frameB64 + transcript
  ▼
[parse_output]          StructuredOutputParser (Zod schema)
  │                     Self-healing: OutputFixingParser on parse failure
  │
  ├── idle screen → END
  │
  ▼
[refine_question]       Groq Llama3-70b
  │                     Improves comprehension question quality
  ▼
[persist_context]       Append session summary to Redis memory
  │
  └── END
```

### LangGraph: Error Diagnosis Agent

```
START
  │
  ▼
[classify]   Heuristic: missing_dependency | syntax_error | runtime_error | ...
  ▼
[diagnose]   Groq Llama3-70b + errorDiagnosisPrompt
  ▼
[parse]      StructuredOutputParser → retry up to 2× on failure
  │
  ├── resolved → END
  ├── retry   → [diagnose]    (loops back with incremented retryCount)
  └── failed  → [fallback] → END
```

### LangGraph: Intent Detection Agent

```
START
  │
  ▼
[heuristic]        Keyword check — avoids LLM call for clearly non-share transcripts
  │
  ├── no keywords → END
  │
  ▼
[classify_intent]  Groq Llama3-70b: hasShareIntent + confidence + fileHint
  │
  ├── confidence < 0.6 → END
  │
  ▼
[match_file]       Match fileHint to watched folder files
  │                Fallback: most recent file if confidence > 0.8
  └── END
```

### Session Memory (LangChain + Redis)

Each session has a `RedisSessionMemory` instance (extends `BaseListChatMessageHistory`).

- Stores up to 20 messages (rolling window)
- 24-hour TTL — matches session lifetime
- Screen analysis injects session context into every vision prompt
- Cleared automatically when session ends

---

## File Storage — Cloudinary

Instructor file sharing uses **Cloudinary** (free tier — 25 GB storage, 25 GB bandwidth/month).

Files are uploaded to: `wkai/{sessionId}/{timestamp}_{filename}`
Students receive a direct HTTPS download URL via WebSocket broadcast.

No credit card required — sign up at cloudinary.com.

---

## Quick Start (WSL2 Kali terminal)

```bash
# 1. Start Postgres + Redis
cd ~/Projects/wkai/wkai-backend
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in:
#   GROQ_API_KEY          → console.groq.com
#   CLOUDINARY_CLOUD_NAME → cloudinary.com dashboard
#   CLOUDINARY_API_KEY    → cloudinary.com dashboard
#   CLOUDINARY_API_SECRET → cloudinary.com dashboard
#   DATABASE_URL          → already set for local Docker
#   REDIS_URL             → already set for local Docker

# 4. Create database tables (first time only)
npm run db:migrate

# 5. Start the server
npm run dev
# → http://localhost:4000
# → ws://localhost:4000/ws
```

---

## Environment Variables

| Variable | Required | Where to get it |
|---|---|---|
| PORT | No | Default: 4000 |
| DATABASE_URL | Yes | Pre-filled for local Docker |
| REDIS_URL | Yes | Pre-filled for local Docker |
| GROQ_API_KEY | Yes | console.groq.com (free) |
| CLOUDINARY_CLOUD_NAME | Yes | cloudinary.com → Dashboard |
| CLOUDINARY_API_KEY | Yes | cloudinary.com → Dashboard |
| CLOUDINARY_API_SECRET | Yes | cloudinary.com → Dashboard |
| JWT_SECRET | No | Any long random string |

---

## API Routes

| Method | Path | Description |
|---|---|---|
| POST | /api/sessions | Create session + Redis cache |
| GET | /api/sessions/:roomCode | Join validation + full initial state |
| PATCH | /api/sessions/:id/end | End session + cleanup memory + WS notify |
| GET | /api/sessions/:id/guide | Fetch all guide blocks |
| GET | /api/sessions/:id/memory | Debug: inspect LangChain session memory |
| POST | /api/ai/transcribe | Groq Whisper audio → text |
| POST | /api/ai/diagnose | LangGraph error agent |
| POST | /api/ai/intent | LangGraph intent detection |
| POST | /api/files/upload | Upload to Cloudinary |
| POST | /api/run | Sandboxed code execution (python3/node/bash) |

---

## WebSocket — ws://localhost:4000/ws

Connect with: `?session=ROOMCODE&role=instructor|student&studentId=OPTIONAL`

| Message Type | Direction | Description |
|---|---|---|
| screen-frame | instructor → server | Base64 PNG → LangGraph vision pipeline |
| audio-transcript | instructor → server | Whisper text → Redis + intent agent |
| guide-block | server → students | AI-generated guide card |
| comprehension-question | server → students | Comprehension gate question |
| comprehension-answer | student → server | Student's answer index |
| comprehension-result | server → student | Correct/wrong + explanation |
| file-shared | server → students | Cloudinary URL broadcast |
| student-error | student → server | Error text → LangGraph error agent |
| error-resolved | server → student | Diagnosis + fix command |
| student-joined | server → room | Updated student count |
| student-left | server → room | Updated student count |
| session-ended | server → room | Instructor ended session |
| session-state | server → new client | Full state on connect |
| share-intent-detected | server → instructor | LangGraph detected share intent |

---

## Groq Models

| Task | Model |
|---|---|
| Screen frame vision | meta-llama/llama-4-scout-17b-16e-instruct |
| Text / error diagnosis | llama3-70b-8192 |
| Audio transcription | whisper-large-v3 |