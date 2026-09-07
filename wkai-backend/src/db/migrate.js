import "dotenv/config";
import { pool } from "./client.js";

const MIGRATIONS = [
  // ─── Sessions ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code       CHAR(6) UNIQUE NOT NULL,
    instructor_name TEXT NOT NULL,
    workshop_title  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'ended')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS sessions_room_code_idx ON sessions (room_code)`,
  `CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status)`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_password_hash TEXT`,

  // ─── Workspaces ────────────────────────────────────────────────────────────
  // A folder holding a series of sessions. Everything taught inside a workspace
  // is retrievable by every later session in it, which is what makes a course
  // that runs over several days behave like one continuous body of material
  // rather than a set of unrelated rooms.
  `CREATE TABLE IF NOT EXISTS workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    owner_name  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS workspaces_name_idx ON workspaces (lower(name))`,

  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS sessions_workspace_idx ON sessions (workspace_id)`,

  // ─── Guide Blocks ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS guide_blocks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type        TEXT NOT NULL
                CHECK (type IN ('step','tip','code','explanation','comprehension')),
    title       TEXT,
    content     TEXT NOT NULL,
    code        TEXT,
    language    TEXT,
    locked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS guide_blocks_session_idx ON guide_blocks (session_id)`,

  // ─── Comprehension Questions ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS comprehension_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    guide_block_id  UUID REFERENCES guide_blocks(id) ON DELETE SET NULL,
    question        TEXT NOT NULL,
    options         JSONB NOT NULL,       -- string[]
    correct_index   INT NOT NULL,
    explanation     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ─── Shared Files ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS shared_files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    size_bytes  BIGINT,
    shared_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS shared_files_session_idx ON shared_files (session_id)`,

  // ─── Student Messages (Q&A) ────────────────────────────────────────────────
  // message_id is the client-generated id the student's socket already uses to
  // correlate its optimistic "Sending…" bubble with the ack, so it has to be
  // stored — the server's own UUID is never seen by that client.
  `CREATE TABLE IF NOT EXISTS messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id    TEXT NOT NULL,
    student_id    TEXT NOT NULL,
    student_name  TEXT NOT NULL,
    message       TEXT NOT NULL,
    reply         TEXT,
    reply_role    TEXT CHECK (reply_role IN ('instructor', 'ai')),
    replied_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, message_id)
  )`,

  `CREATE INDEX IF NOT EXISTS messages_session_idx ON messages (session_id)`,

  // ─── Error Resolution Log ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS error_resolutions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id      TEXT NOT NULL,        -- anonymous student identifier
    error_message   TEXT NOT NULL,
    diagnosis       TEXT,
    fix_command     TEXT,
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ─── Assessments (quizzes and tests) ───────────────────────────────────────
  // One table for both because they are the same object with different rules:
  // a quiz is formative (optionally not scored, navigation free, no proctoring),
  // a test is summative (scored, often linear, proctored). Keeping them apart
  // would have duplicated questions, attempts, answers and grading wholesale.
  `CREATE TABLE IF NOT EXISTS assessments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id           UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind                 TEXT NOT NULL CHECK (kind IN ('quiz','test')),
    title                TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','live','closed')),
    -- 'linear' = one question at a time, no going back. 'free' = revisit any.
    navigation           TEXT NOT NULL DEFAULT 'free'
                         CHECK (navigation IN ('linear','free')),
    proctored            BOOLEAN NOT NULL DEFAULT FALSE,
    -- A practice quiz can be run without it counting against the student.
    counts_toward_score  BOOLEAN NOT NULL DEFAULT TRUE,
    source               TEXT NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('manual','ai','kahoot')),
    kahoot_url           TEXT,
    time_limit_seconds   INT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    launched_at          TIMESTAMPTZ,
    closed_at            TIMESTAMPTZ
  )`,

  `CREATE INDEX IF NOT EXISTS assessments_session_idx ON assessments (session_id)`,

  `CREATE TABLE IF NOT EXISTS assessment_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id  UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    position       INT NOT NULL,
    prompt         TEXT NOT NULL,
    options        JSONB NOT NULL,          -- string[]
    correct_index  INT NOT NULL,
    explanation    TEXT,
    points         INT NOT NULL DEFAULT 1,
    -- Free-text label ("promises", "list comprehensions") used to say what a
    -- student is weak at, rather than only how many they got wrong.
    topic          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS assessment_questions_assessment_idx
     ON assessment_questions (assessment_id, position)`,

  `CREATE TABLE IF NOT EXISTS assessment_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id      TEXT NOT NULL,
    student_name    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','submitted','locked')),
    score           NUMERIC,
    max_score       NUMERIC,
    ai_summary      TEXT,
    violation_count INT NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at    TIMESTAMPTZ,
    UNIQUE (assessment_id, student_id)
  )`,

  `CREATE TABLE IF NOT EXISTS assessment_answers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id     UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    question_id    UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
    selected_index INT,
    is_correct     BOOLEAN,
    answered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attempt_id, question_id)
  )`,

  // Proctoring flags: what happened, when, on whose attempt. Recorded rather
  // than only counted so the instructor can judge a single alt-tab differently
  // from six of them.
  `CREATE TABLE IF NOT EXISTS assessment_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id  UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS assessment_events_attempt_idx ON assessment_events (attempt_id)`,
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log("[Migrate] Running migrations…");
    for (const sql of MIGRATIONS) {
      await client.query(sql);
    }
    console.log("[Migrate] ✓ All migrations complete");
  } catch (err) {
    console.error("[Migrate] ✗ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
