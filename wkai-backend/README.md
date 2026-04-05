# WKAI Backend

Node.js + WebSocket + PostgreSQL + Redis + **LangChain + LangGraph + Groq**

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

## Quick Start

```bash
# 1. Start infra
docker compose up -d

# 2. Install deps
npm install

# 3. Configure
cp .env.example .env
# Edit: GROQ_API_KEY=gsk_...

# 4. Create DB tables
npm run db:migrate

# 5. Start server
npm run dev
```

---

## API Routes

| Method | Path                       | Description                               |
|--------|----------------------------|-------------------------------------------|
| POST   | /api/sessions              | Create session + Redis cache              |
| GET    | /api/sessions/:roomCode    | Join validation + full initial state      |
| PATCH  | /api/sessions/:id/end      | End session + cleanup memory + WS notify  |
| GET    | /api/sessions/:id/guide    | Fetch all guide blocks                    |
| GET    | /api/sessions/:id/memory   | Debug: inspect LangChain session memory   |
| POST   | /api/ai/transcribe         | Groq Whisper audio → text                 |
| POST   | /api/ai/diagnose           | LangGraph error agent                     |
| POST   | /api/ai/intent             | LangGraph intent detection                |
| POST   | /api/files/upload          | Upload to Firebase Storage                |
| POST   | /api/run                   | Sandboxed code execution                  |
