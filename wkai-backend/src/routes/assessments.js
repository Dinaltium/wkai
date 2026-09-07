import { Router } from "express";
import { query } from "../db/client.js";
import { requireSessionToken } from "../auth/sessionAccess.js";
import { broadcastToStudents, broadcastToInstructor } from "../ws/server.js";
import {
  generateAssessmentQuestions,
  evaluateAttempt,
} from "../ai/graphs/assessmentAgent.js";

export const assessmentRouter = Router();

// Every route here is addressed by assessment or attempt id, never by session
// id, so ownership is checked against the token explicitly rather than by the
// `:id` shortcut in requireSessionToken.
const requireInstructor = requireSessionToken({ requiredRole: "instructor" });
const requireStudent = requireSessionToken({ requiredRole: "student" });

// ─── Shape helpers ────────────────────────────────────────────────────────────

function formatAssessment(row, questionCount) {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    navigation: row.navigation,
    proctored: row.proctored,
    countsTowardScore: row.counts_toward_score,
    source: row.source,
    kahootUrl: row.kahoot_url,
    timeLimitSeconds: row.time_limit_seconds,
    createdAt: row.created_at,
    launchedAt: row.launched_at,
    closedAt: row.closed_at,
    questionCount: questionCount ?? Number(row.question_count ?? 0),
  };
}

/** Instructor view — includes the answer key. */
function formatQuestion(row) {
  return {
    id: row.id,
    position: row.position,
    prompt: row.prompt,
    options: row.options,
    correctIndex: row.correct_index,
    explanation: row.explanation,
    points: row.points,
    topic: row.topic,
  };
}

/** Student view — the answer key is stripped server-side, never client-side. */
function formatQuestionForStudent(row) {
  return {
    id: row.id,
    position: row.position,
    prompt: row.prompt,
    options: row.options,
    points: row.points,
    topic: row.topic,
  };
}

function sanitizeQuestions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((q, index) => {
      const options = Array.isArray(q?.options)
        ? q.options.map((o) => String(o ?? "").slice(0, 500)).filter(Boolean)
        : [];
      const correctIndex = Number(q?.correctIndex);
      if (!q?.prompt || options.length < 2) return null;
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        return null;
      }
      return {
        position: index,
        prompt: String(q.prompt).slice(0, 2_000),
        options,
        correctIndex,
        explanation: q.explanation ? String(q.explanation).slice(0, 2_000) : null,
        points: Number.isFinite(Number(q.points)) ? Math.max(1, Number(q.points)) : 1,
        topic: q.topic ? String(q.topic).slice(0, 120) : null,
      };
    })
    .filter(Boolean);
}

async function loadAssessment(assessmentId) {
  const { rows } = await query("SELECT * FROM assessments WHERE id = $1", [assessmentId]);
  return rows[0] ?? null;
}

/** 403 unless the caller's token belongs to the assessment's session. */
function ownsAssessment(req, assessment) {
  return assessment && req.sessionToken?.sessionId === assessment.session_id;
}

async function replaceQuestions(assessmentId, questions) {
  await query("DELETE FROM assessment_questions WHERE assessment_id = $1", [assessmentId]);
  for (const q of questions) {
    await query(
      `INSERT INTO assessment_questions
         (assessment_id, position, prompt, options, correct_index, explanation, points, topic)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
      [
        assessmentId,
        q.position,
        q.prompt,
        JSON.stringify(q.options),
        q.correctIndex,
        q.explanation,
        q.points,
        q.topic,
      ]
    );
  }
}

// ─── Instructor: list / create ────────────────────────────────────────────────

assessmentRouter.get("/sessions/:id/assessments", requireInstructor, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, COUNT(q.id) AS question_count
         FROM assessments a
         LEFT JOIN assessment_questions q ON q.assessment_id = a.id
        WHERE a.session_id = $1
        GROUP BY a.id
        ORDER BY a.created_at DESC`,
      [req.params.id]
    );
    res.json({ assessments: rows.map((r) => formatAssessment(r)) });
  } catch (err) {
    next(err);
  }
});

assessmentRouter.post("/sessions/:id/assessments", requireInstructor, async (req, res, next) => {
  try {
    const {
      kind = "quiz",
      title,
      navigation = "free",
      proctored = kind === "test",
      countsTowardScore = kind === "test",
      source = "manual",
      kahootUrl = null,
      timeLimitSeconds = null,
      questions = [],
    } = req.body ?? {};

    if (!["quiz", "test"].includes(kind)) {
      return res.status(400).json({ error: "kind must be 'quiz' or 'test'" });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "A title is required." });
    }
    if (source === "kahoot" && !kahootUrl) {
      return res.status(400).json({ error: "A Kahoot game link is required for a Kahoot quiz." });
    }

    const clean = sanitizeQuestions(questions);
    if (source !== "kahoot" && clean.length === 0) {
      return res.status(400).json({ error: "Add at least one valid question." });
    }

    const { rows } = await query(
      `INSERT INTO assessments
         (session_id, kind, title, navigation, proctored, counts_toward_score,
          source, kahoot_url, time_limit_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.params.id,
        kind,
        String(title).slice(0, 200),
        navigation === "linear" ? "linear" : "free",
        Boolean(proctored),
        Boolean(countsTowardScore),
        ["manual", "ai", "kahoot"].includes(source) ? source : "manual",
        kahootUrl ? String(kahootUrl).slice(0, 500) : null,
        Number.isFinite(Number(timeLimitSeconds)) && Number(timeLimitSeconds) > 0
          ? Math.round(Number(timeLimitSeconds))
          : null,
      ]
    );

    const assessment = rows[0];
    if (clean.length) await replaceQuestions(assessment.id, clean);

    res.status(201).json({ assessment: formatAssessment(assessment, clean.length) });
  } catch (err) {
    next(err);
  }
});

// ─── Instructor: AI question generation ───────────────────────────────────────
// Draft only. Nothing is stored until the instructor saves it, because a
// generated question they have not read is not a question they want to ask.

assessmentRouter.post("/sessions/:id/assessments/generate", requireInstructor, async (req, res, next) => {
  try {
    const { count = 5, kind = "quiz", difficulty = "medium", focus = "" } = req.body ?? {};
    const result = await generateAssessmentQuestions(req.params.id, {
      count,
      kind,
      difficulty,
      focus: String(focus ?? "").slice(0, 500),
    });
    if (!result.questions.length) {
      return res.status(422).json({
        error: result.reason ?? "The AI could not produce questions from this session yet.",
      });
    }
    res.json({ questions: result.questions });
  } catch (err) {
    console.error("[Assessments] generate failed:", err.message);
    res.status(502).json({ error: "Question generation failed. Try again in a moment." });
  }
});

// ─── Instructor: read / update / launch / close ───────────────────────────────

assessmentRouter.get("/assessments/:assessmentId", requireInstructor, async (req, res, next) => {
  try {
    const assessment = await loadAssessment(req.params.assessmentId);
    if (!ownsAssessment(req, assessment)) return res.status(404).json({ error: "Not found" });

    const { rows } = await query(
      "SELECT * FROM assessment_questions WHERE assessment_id = $1 ORDER BY position ASC",
      [assessment.id]
    );
    res.json({
      assessment: formatAssessment(assessment, rows.length),
      questions: rows.map(formatQuestion),
    });
  } catch (err) {
    next(err);
  }
});

assessmentRouter.put("/assessments/:assessmentId", requireInstructor, async (req, res, next) => {
  try {
    const assessment = await loadAssessment(req.params.assessmentId);
    if (!ownsAssessment(req, assessment)) return res.status(404).json({ error: "Not found" });
    if (assessment.status !== "draft") {
      return res.status(409).json({ error: "A launched assessment can no longer be edited." });
    }

    const { title, navigation, proctored, countsTowardScore, timeLimitSeconds, questions } =
      req.body ?? {};
    const clean = sanitizeQuestions(questions);
    if (assessment.source !== "kahoot" && clean.length === 0) {
      return res.status(400).json({ error: "Add at least one valid question." });
    }

    const { rows } = await query(
      `UPDATE assessments
          SET title = COALESCE($2, title),
              navigation = COALESCE($3, navigation),
              proctored = COALESCE($4, proctored),
              counts_toward_score = COALESCE($5, counts_toward_score),
              time_limit_seconds = $6
        WHERE id = $1
        RETURNING *`,
      [
        assessment.id,
        title ? String(title).slice(0, 200) : null,
        navigation === "linear" || navigation === "free" ? navigation : null,
        typeof proctored === "boolean" ? proctored : null,
        typeof countsTowardScore === "boolean" ? countsTowardScore : null,
        Number.isFinite(Number(timeLimitSeconds)) && Number(timeLimitSeconds) > 0
          ? Math.round(Number(timeLimitSeconds))
          : null,
      ]
    );

    await replaceQuestions(assessment.id, clean);
    res.json({ assessment: formatAssessment(rows[0], clean.length) });
  } catch (err) {
    next(err);
  }
});

assessmentRouter.post("/assessments/:assessmentId/launch", requireInstructor, async (req, res, next) => {
  try {
    const assessment = await loadAssessment(req.params.assessmentId);
    if (!ownsAssessment(req, assessment)) return res.status(404).json({ error: "Not found" });
    if (assessment.status === "closed") {
      return res.status(409).json({ error: "This assessment is already closed." });
    }

    const { rows: questionRows } = await query(
      "SELECT COUNT(*)::int AS count FROM assessment_questions WHERE assessment_id = $1",
      [assessment.id]
    );
    if (assessment.source !== "kahoot" && questionRows[0].count === 0) {
      return res.status(400).json({ error: "Add questions before launching." });
    }

    const { rows } = await query(
      `UPDATE assessments SET status = 'live', launched_at = NOW() WHERE id = $1 RETURNING *`,
      [assessment.id]
    );
    const live = formatAssessment(rows[0], questionRows[0].count);

    // Students are told an assessment exists, never what is in it — the
    // questions come from the student endpoint, after an attempt is opened.
    broadcastToStudents(assessment.session_id, {
      type: "assessment-launched",
      payload: live,
    });

    res.json({ assessment: live });
  } catch (err) {
    next(err);
  }
});

assessmentRouter.post("/assessments/:assessmentId/close", requireInstructor, async (req, res, next) => {
  try {
    const assessment = await loadAssessment(req.params.assessmentId);
    if (!ownsAssessment(req, assessment)) return res.status(404).json({ error: "Not found" });

    const { rows } = await query(
      `UPDATE assessments SET status = 'closed', closed_at = NOW() WHERE id = $1 RETURNING *`,
      [assessment.id]
    );

    // Anything still open is submitted where it stands, so a student who walked
    // away is graded on what they did rather than left in_progress forever.
    await query(
      `UPDATE assessment_attempts SET status = 'submitted', submitted_at = NOW()
        WHERE assessment_id = $1 AND status = 'in_progress'`,
      [assessment.id]
    );
    await regradeAssessment(assessment.id);

    broadcastToStudents(assessment.session_id, {
      type: "assessment-closed",
      payload: { assessmentId: assessment.id },
    });

    res.json({ assessment: formatAssessment(rows[0]) });
  } catch (err) {
    next(err);
  }
});

assessmentRouter.delete("/assessments/:assessmentId", requireInstructor, async (req, res, next) => {
  try {
    const assessment = await loadAssessment(req.params.assessmentId);
    if (!ownsAssessment(req, assessment)) return res.status(404).json({ error: "Not found" });
    await query("DELETE FROM assessments WHERE id = $1", [assessment.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Grading ──────────────────────────────────────────────────────────────────

async function gradeAttempt(attemptId) {
  const { rows } = await query(
    `SELECT q.points, a.is_correct
       FROM assessment_answers a
       JOIN assessment_questions q ON q.id = a.question_id
      WHERE a.attempt_id = $1`,
    [attemptId]
  );
  const { rows: totalRows } = await query(
    `SELECT COALESCE(SUM(q.points), 0) AS max_score
       FROM assessment_questions q
       JOIN assessment_attempts att ON att.assessment_id = q.assessment_id
      WHERE att.id = $1`,
    [attemptId]
  );
  const score = rows.reduce((sum, r) => sum + (r.is_correct ? Number(r.points) : 0), 0);
  const maxScore = Number(totalRows[0]?.max_score ?? 0);
  await query("UPDATE assessment_attempts SET score = $2, max_score = $3 WHERE id = $1", [
    attemptId,
    score,
    maxScore,
  ]);
  return { score, maxScore };
}

async function regradeAssessment(assessmentId) {
  const { rows } = await query("SELECT id FROM assessment_attempts WHERE assessment_id = $1", [
    assessmentId,
  ]);
  for (const row of rows) await gradeAttempt(row.id);
}

// ─── Student: take the assessment ─────────────────────────────────────────────

assessmentRouter.get("/sessions/:id/assessments/live", requireStudent, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, COUNT(q.id) AS question_count
         FROM assessments a
         LEFT JOIN assessment_questions q ON q.assessment_id = a.id
        WHERE a.session_id = $1 AND a.status = 'live'
        GROUP BY a.id
        ORDER BY a.launched_at DESC`,
      [req.params.id]
    );
    res.json({ assessments: rows.map((r) => formatAssessment(r)) });
  } catch (err) {
    next(err);
  }
});

/** Open (or resume) this student's attempt and hand back the questions. */
assessmentRouter.post("/assessments/:assessmentId/attempts", requireStudent, async (req, res, next) => {
  try {
    const assessment = await loadAssessment(req.params.assessmentId);
    if (!assessment || assessment.session_id !== req.sessionToken.sessionId) {
      return res.status(404).json({ error: "Not found" });
    }
    if (assessment.status !== "live") {
      return res.status(409).json({ error: "This assessment is not open." });
    }

    const { studentId, studentName } = req.sessionToken;
    const { rows } = await query(
      `INSERT INTO assessment_attempts (assessment_id, student_id, student_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (assessment_id, student_id) DO UPDATE SET student_name = EXCLUDED.student_name
       RETURNING *`,
      [assessment.id, studentId, studentName ?? "Student"]
    );
    const attempt = rows[0];

    if (attempt.status !== "in_progress") {
      return res.status(409).json({
        error:
          attempt.status === "locked"
            ? "Your attempt was locked after you left the test."
            : "You have already submitted this attempt.",
        attempt: { id: attempt.id, status: attempt.status },
      });
    }

    const [questionRows, answerRows] = await Promise.all([
      query("SELECT * FROM assessment_questions WHERE assessment_id = $1 ORDER BY position ASC", [
        assessment.id,
      ]),
      query("SELECT question_id, selected_index FROM assessment_answers WHERE attempt_id = $1", [
        attempt.id,
      ]),
    ]);

    res.json({
      assessment: formatAssessment(assessment, questionRows.rows.length),
      attempt: { id: attempt.id, status: attempt.status, startedAt: attempt.started_at },
      questions: questionRows.rows.map(formatQuestionForStudent),
      // A reload mid-test restores what they already answered instead of
      // silently discarding it.
      answers: answerRows.rows.map((r) => ({
        questionId: r.question_id,
        selectedIndex: r.selected_index,
      })),
    });
  } catch (err) {
    next(err);
  }
});

async function loadOwnAttempt(req) {
  const { rows } = await query(
    `SELECT att.*, a.session_id, a.kind, a.navigation, a.title, a.counts_toward_score
       FROM assessment_attempts att
       JOIN assessments a ON a.id = att.assessment_id
      WHERE att.id = $1`,
    [req.params.attemptId]
  );
  const attempt = rows[0];
  if (!attempt) return null;
  if (attempt.session_id !== req.sessionToken.sessionId) return null;
  if (attempt.student_id !== req.sessionToken.studentId) return null;
  return attempt;
}

assessmentRouter.post("/attempts/:attemptId/answer", requireStudent, async (req, res, next) => {
  try {
    const attempt = await loadOwnAttempt(req);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (attempt.status !== "in_progress") {
      return res.status(409).json({ error: "This attempt is closed." });
    }

    const { questionId, selectedIndex } = req.body ?? {};
    const { rows } = await query(
      "SELECT * FROM assessment_questions WHERE id = $1 AND assessment_id = $2",
      [questionId, attempt.assessment_id]
    );
    const question = rows[0];
    if (!question) return res.status(400).json({ error: "Unknown question." });

    const index = Number(selectedIndex);
    if (!Number.isInteger(index) || index < 0 || index >= question.options.length) {
      return res.status(400).json({ error: "Invalid answer." });
    }

    // Correctness is decided here, never sent to the client during the attempt.
    const isCorrect = index === question.correct_index;

    // In linear mode an answered question stays answered: DO NOTHING rather
    // than DO UPDATE is what actually enforces "no going back".
    const conflictClause =
      attempt.navigation === "linear"
        ? "DO NOTHING"
        : "DO UPDATE SET selected_index = EXCLUDED.selected_index, is_correct = EXCLUDED.is_correct, answered_at = NOW()";

    await query(
      `INSERT INTO assessment_answers (attempt_id, question_id, selected_index, is_correct)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attempt_id, question_id) ${conflictClause}`,
      [attempt.id, question.id, index, isCorrect]
    );

    const { rows: progressRows } = await query(
      "SELECT COUNT(*)::int AS answered FROM assessment_answers WHERE attempt_id = $1",
      [attempt.id]
    );

    broadcastToInstructor(attempt.session_id, {
      type: "assessment-progress",
      payload: {
        assessmentId: attempt.assessment_id,
        attemptId: attempt.id,
        studentId: attempt.student_id,
        studentName: attempt.student_name,
        answered: progressRows[0].answered,
      },
    });

    res.json({ ok: true, answered: progressRows[0].answered });
  } catch (err) {
    next(err);
  }
});

assessmentRouter.post("/attempts/:attemptId/submit", requireStudent, async (req, res, next) => {
  try {
    const attempt = await loadOwnAttempt(req);
    if (!attempt) return res.status(404).json({ error: "Not found" });

    const locked = req.body?.locked === true;
    if (attempt.status === "in_progress") {
      await query(
        `UPDATE assessment_attempts SET status = $2, submitted_at = NOW() WHERE id = $1`,
        [attempt.id, locked ? "locked" : "submitted"]
      );
    }

    const { score, maxScore } = await gradeAttempt(attempt.id);

    broadcastToInstructor(attempt.session_id, {
      type: "assessment-submitted",
      payload: {
        assessmentId: attempt.assessment_id,
        attemptId: attempt.id,
        studentId: attempt.student_id,
        studentName: attempt.student_name,
        score,
        maxScore,
        locked,
      },
    });

    // A quiz shows its answers straight away — that is the point of a quiz. A
    // test does not, until the instructor closes it, or students would compare
    // notes while others are still working.
    const reveal = attempt.kind === "quiz";
    let review = null;
    if (reveal) {
      const { rows } = await query(
        `SELECT q.prompt, q.options, q.correct_index, q.explanation, q.topic,
                ans.selected_index, ans.is_correct
           FROM assessment_questions q
           LEFT JOIN assessment_answers ans
             ON ans.question_id = q.id AND ans.attempt_id = $1
          WHERE q.assessment_id = $2
          ORDER BY q.position ASC`,
        [attempt.id, attempt.assessment_id]
      );
      review = rows.map((r) => ({
        prompt: r.prompt,
        options: r.options,
        correctIndex: r.correct_index,
        explanation: r.explanation,
        topic: r.topic,
        selectedIndex: r.selected_index,
        isCorrect: r.is_correct,
      }));
    }

    res.json({
      score,
      maxScore,
      countsTowardScore: attempt.counts_toward_score,
      status: locked ? "locked" : "submitted",
      review,
    });
  } catch (err) {
    next(err);
  }
});

/** Proctoring flag from the student client (fullscreen exit, tab switch). */
assessmentRouter.post("/attempts/:attemptId/events", requireStudent, async (req, res, next) => {
  try {
    const attempt = await loadOwnAttempt(req);
    if (!attempt) return res.status(404).json({ error: "Not found" });

    const kind = String(req.body?.kind ?? "unknown").slice(0, 60);
    const detail = req.body?.detail ? String(req.body.detail).slice(0, 500) : null;

    await query("INSERT INTO assessment_events (attempt_id, kind, detail) VALUES ($1, $2, $3)", [
      attempt.id,
      kind,
      detail,
    ]);
    const { rows } = await query(
      `UPDATE assessment_attempts SET violation_count = violation_count + 1
        WHERE id = $1 RETURNING violation_count`,
      [attempt.id]
    );

    broadcastToInstructor(attempt.session_id, {
      type: "assessment-violation",
      payload: {
        assessmentId: attempt.assessment_id,
        attemptId: attempt.id,
        studentId: attempt.student_id,
        studentName: attempt.student_name,
        kind,
        detail,
        violationCount: rows[0].violation_count,
      },
    });

    res.json({ ok: true, violationCount: rows[0].violation_count });
  } catch (err) {
    next(err);
  }
});

// ─── Instructor: results ──────────────────────────────────────────────────────

assessmentRouter.get("/assessments/:assessmentId/results", requireInstructor, async (req, res, next) => {
  try {
    const assessment = await loadAssessment(req.params.assessmentId);
    if (!ownsAssessment(req, assessment)) return res.status(404).json({ error: "Not found" });

    const [attemptRows, answerRows, eventRows, questionRows] = await Promise.all([
      query(
        `SELECT * FROM assessment_attempts WHERE assessment_id = $1 ORDER BY student_name ASC`,
        [assessment.id]
      ),
      query(
        `SELECT ans.attempt_id, ans.selected_index, ans.is_correct,
                q.id AS question_id, q.prompt, q.options, q.correct_index, q.topic, q.points
           FROM assessment_answers ans
           JOIN assessment_questions q ON q.id = ans.question_id
          WHERE q.assessment_id = $1`,
        [assessment.id]
      ),
      query(
        `SELECT e.attempt_id, e.kind, e.detail, e.created_at
           FROM assessment_events e
           JOIN assessment_attempts att ON att.id = e.attempt_id
          WHERE att.assessment_id = $1
          ORDER BY e.created_at ASC`,
        [assessment.id]
      ),
      query("SELECT * FROM assessment_questions WHERE assessment_id = $1 ORDER BY position ASC", [
        assessment.id,
      ]),
    ]);

    const answersByAttempt = new Map();
    for (const row of answerRows.rows) {
      const list = answersByAttempt.get(row.attempt_id) ?? [];
      list.push({
        questionId: row.question_id,
        prompt: row.prompt,
        options: row.options,
        correctIndex: row.correct_index,
        selectedIndex: row.selected_index,
        isCorrect: row.is_correct,
        topic: row.topic,
        points: row.points,
      });
      answersByAttempt.set(row.attempt_id, list);
    }

    const eventsByAttempt = new Map();
    for (const row of eventRows.rows) {
      const list = eventsByAttempt.get(row.attempt_id) ?? [];
      list.push({ kind: row.kind, detail: row.detail, at: row.created_at });
      eventsByAttempt.set(row.attempt_id, list);
    }

    // Per-topic weakness across the whole room: what to reteach, not just who
    // scored badly.
    const topicTotals = new Map();
    for (const row of answerRows.rows) {
      const topic = row.topic ?? "untagged";
      const entry = topicTotals.get(topic) ?? { topic, correct: 0, total: 0 };
      entry.total += 1;
      if (row.is_correct) entry.correct += 1;
      topicTotals.set(topic, entry);
    }

    res.json({
      assessment: formatAssessment(assessment, questionRows.rows.length),
      questions: questionRows.rows.map(formatQuestion),
      attempts: attemptRows.rows.map((a) => ({
        id: a.id,
        studentId: a.student_id,
        studentName: a.student_name,
        status: a.status,
        score: a.score === null ? null : Number(a.score),
        maxScore: a.max_score === null ? null : Number(a.max_score),
        aiSummary: a.ai_summary,
        violationCount: a.violation_count,
        startedAt: a.started_at,
        submittedAt: a.submitted_at,
        answers: answersByAttempt.get(a.id) ?? [],
        events: eventsByAttempt.get(a.id) ?? [],
      })),
      topics: [...topicTotals.values()].sort((a, b) => a.correct / a.total - b.correct / b.total),
    });
  } catch (err) {
    next(err);
  }
});

/** AI read on one student's attempt, cached on the attempt row. */
assessmentRouter.post("/attempts/:attemptId/evaluate", requireInstructor, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT att.*, a.session_id
         FROM assessment_attempts att
         JOIN assessments a ON a.id = att.assessment_id
        WHERE att.id = $1`,
      [req.params.attemptId]
    );
    const attempt = rows[0];
    if (!attempt || attempt.session_id !== req.sessionToken.sessionId) {
      return res.status(404).json({ error: "Not found" });
    }
    if (attempt.ai_summary && req.body?.refresh !== true) {
      return res.json({ summary: attempt.ai_summary, cached: true });
    }

    const { rows: answerRows } = await query(
      `SELECT q.prompt, q.options, q.correct_index, q.topic,
              ans.selected_index, ans.is_correct
         FROM assessment_questions q
         LEFT JOIN assessment_answers ans
           ON ans.question_id = q.id AND ans.attempt_id = $1
        WHERE q.assessment_id = $2
        ORDER BY q.position ASC`,
      [attempt.id, attempt.assessment_id]
    );

    const summary = await evaluateAttempt({
      studentName: attempt.student_name,
      score: attempt.score,
      maxScore: attempt.max_score,
      answers: answerRows.map((r) => ({
        prompt: r.prompt,
        topic: r.topic,
        selected: r.selected_index === null ? null : r.options[r.selected_index],
        correct: r.options[r.correct_index],
        isCorrect: Boolean(r.is_correct),
      })),
    });

    if (!summary) {
      return res.status(502).json({ error: "Could not produce a summary for this attempt." });
    }

    await query("UPDATE assessment_attempts SET ai_summary = $2 WHERE id = $1", [
      attempt.id,
      summary,
    ]);
    res.json({ summary, cached: false });
  } catch (err) {
    next(err);
  }
});
