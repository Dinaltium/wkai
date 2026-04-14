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
├── Agents/                Centralized AI agent layer
│   ├── BaseAgent.js       name/version/invoke/healthCheck contract + metrics
│   ├── AgentRegistry.js   Agent registry + health/metrics reporting
│   ├── AgentOrchestrator.js Multi-agent workflows
│   ├── VoiceAgent.js
│   ├── QuizAgent.js
│   ├── DebugAgent.js
│   ├── IntentAgent.js
│   └── MessageAgent.js
├── groqClient.js          LangChain ChatGroq instances + raw Groq SDK for Whisper
├── memory.js              Redis-backed LangChain chat history per session
├── prompts.js             ChatPromptTemplates + Zod-based StructuredOutputParsers
├── errorDiagnosis.js      Thin shim → graphs/errorAgent.js
├── whisper.js             Groq Whisper-large-v3 audio transcription
└── graphs/
    ├── errorAgent.js      LangGraph: error diagnosis agent (retry loop)
    ├── transcriptExplainerAgent.js
    ├── comprehensionCoachAgent.js
    └── intentAgent.js     LangGraph: file share intent detection
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

## Centralized Agents

All backend AI task execution now goes through `src/ai/Agents/` for a uniform lifecycle.

### BaseAgent contract

Each agent follows:
- `name`
- `version`
- `invoke(input)`
- `healthCheck()`

### Feature flags

Use env flags to safely enable/disable agents:

- `AI_AGENT_VOICE_AGENT_ENABLED`
- `AI_AGENT_QUIZ_AGENT_ENABLED`
- `AI_AGENT_DEBUG_AGENT_ENABLED`
- `AI_AGENT_INTENT_AGENT_ENABLED`
- `AI_AGENT_MESSAGE_AGENT_ENABLED`

### Metrics and observability

Per-agent tracking includes:
- calls
- latency (last/avg/total)
- errors + error rate
- token-cost estimate (when usage metadata is available)

### Agent health/metrics API

`GET /api/ai/agents`

Returns:
- agent health status
- metrics snapshot

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
| CORS_ALLOWED_ORIGINS | Yes (prod) | Comma-separated allowed frontend origins |
| STUDENT_JOIN_TOKEN_SECRET | Yes (prod) | Random signing secret for join tokens |
| STUDENT_JOIN_TOKEN_TTL_SECONDS | No | Join token TTL, default 3600 |

---

## Render Deployment

`render.yaml` at repo root configures the backend web service.

1. Create a new Render service from this repository.
2. Use the generated `wkai-backend` service config from `render.yaml`.
3. Set secrets and connection URLs:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `GROQ_API_KEY`
   - `STUDENT_JOIN_TOKEN_SECRET`
   - `CORS_ALLOWED_ORIGINS`
4. Deploy and verify:
   - `GET /health`
   - WebSocket handshake on `/ws`

---

## API Routes

| Method | Path | Description |
|---|---|---|
| POST | /api/sessions | Create session + Redis cache |
| POST | /api/sessions/:roomCode/join | Password validation + issue signed join token |
| GET | /api/sessions/:roomCode | Fetch room state using join token |
| PATCH | /api/sessions/:id/end | End session + cleanup memory + WS notify |
| GET | /api/sessions/:id/guide | Fetch all guide blocks |
| GET | /api/sessions/:id/memory | Debug: inspect LangChain session memory |
| POST | /api/ai/transcribe | Groq Whisper audio → text |
| POST | /api/ai/diagnose | LangGraph error agent |
| POST | /api/ai/intent | LangGraph intent detection |
| GET  | /api/ai/agents | Agent health + metrics snapshot |
| POST | /api/files/upload | Upload to Cloudinary |
| POST | /api/run | Sandboxed code execution (python3/node/bash) |

---

## WebSocket — ws://localhost:4000/ws

Connect with: `?session=ROOMCODE&role=instructor|student&studentId=OPTIONAL&joinToken=...`

| Message Type | Direction | Description |
|---|---|---|
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

---

## Agent Contract Tests

```bash
npm run test:agents
```

This verifies:
- agent registry integrity
- BaseAgent contract compliance
- feature-flag disable behavior