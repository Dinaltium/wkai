/**
 * Seed a demo workshop for recording product footage.
 *
 * The footage on the landing page was shot against live but empty rooms: one
 * guide card, no files, an empty Q&A. On the page it reads as a broken
 * product. This fills a real session with real rows so the real components
 * render a room that has actually been taught in — no mocked UI, no fake
 * screenshots, just fixture data going through the ordinary code path.
 *
 * It also holds an instructor WebSocket open while it runs, because a room
 * with no instructor socket raises the "instructor is not here" modal a few
 * seconds into every take.
 *
 *   node scripts/seed-demo-session.js --room DEMO01
 *   node scripts/seed-demo-session.js --room DEMO01 --live      # hold the room open
 *   node scripts/seed-demo-session.js --room DEMO01 --live --beats
 *
 * --beats drips further guide cards and a student question in on a timer, so a
 * take can capture content *arriving* rather than only sitting there.
 */
import "dotenv/config";
import WebSocket from "ws";
import { pool, query } from "../src/db/client.js";
import { connectRedis, redis, setSessionData } from "../src/db/redis.js";
import { issueInstructorToken } from "../src/auth/sessionAccess.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return !next || next.startsWith("--") ? true : next;
};

const ROOM = String(flag("room", "DEMO01")).toUpperCase().slice(0, 6);
const TITLE = String(flag("title", "Intro to Python loops"));
const INSTRUCTOR = String(flag("instructor", "Ada Lovelace"));
const LIVE = Boolean(flag("live", false));
const BEATS = Boolean(flag("beats", false));
// The server sends a student only their OWN Q&A thread, so questions seeded
// under fictional ids leave the recording browser's Q&A tab empty. Pass the
// id the camera browser was assigned (its join token carries it) to attach the
// thread to whoever is being filmed.
const FOR_STUDENT = flag("for-student", null);
const PORT = process.env.PORT ?? 4000;

// ─── Fixture content ──────────────────────────────────────────────────────────
// Written as a workshop that has been running ~20 minutes: enough cards to fill
// the guide with a scroll, varied types so the panel does not look repetitive.

const GUIDE_BLOCKS = [
  {
    type: "step",
    title: "Set up the file we are working in",
    content:
      "Create loops.py in your project folder and open it side by side with the terminal. Everything today runs from this one file.",
    minutesAgo: 22,
  },
  {
    type: "explanation",
    title: "What a for loop actually does",
    content:
      "A for loop steps through a sequence one element at a time. Python hands you each item in turn and runs the indented block once per item — you never manage the index yourself.",
    minutesAgo: 19,
  },
  {
    type: "code",
    title: "The shape of every for loop",
    content: "Read it as: for each item in this sequence, do this.",
    code: "for name in [\"ada\", \"grace\", \"katherine\"]:\n    print(name.title())",
    language: "python",
    minutesAgo: 17,
  },
  {
    type: "tip",
    title: "range stops one short",
    content:
      "range(5) gives 0 through 4, not 1 through 5. Almost every off-by-one error in this class comes from forgetting that the end is exclusive.",
    minutesAgo: 14,
  },
  {
    type: "code",
    title: "Looping with an index when you need one",
    content: "enumerate gives you the position and the value together, so you stop writing range(len(...)).",
    code: "for position, name in enumerate(names, start=1):\n    print(position, name)",
    language: "python",
    minutesAgo: 11,
  },
  {
    type: "explanation",
    title: "Why the loop variable survives the loop",
    content:
      "After the loop ends, the loop variable still holds the last value it was given. That is useful occasionally and a source of confusing bugs often — do not rely on it.",
    minutesAgo: 8,
  },
  {
    type: "tip",
    title: "Break out early rather than checking twice",
    content:
      "If you are scanning for the first match, break as soon as you find it. Letting the loop run to the end and remembering the answer is slower and harder to read.",
    minutesAgo: 5,
  },
  {
    type: "code",
    title: "Finding the first match",
    content: "The else on a for loop runs only if the loop finished without breaking.",
    code: "for n in numbers:\n    if n % 7 == 0:\n        print(\"first multiple of seven:\", n)\n        break\nelse:\n    print(\"no multiples of seven\")",
    language: "python",
    minutesAgo: 2,
  },
];

const SHARED_FILES = [
  { name: "loops-starter.py", sizeBytes: 1_284, minutesAgo: 21 },
  { name: "python-loops-slides.pdf", sizeBytes: 2_310_442, minutesAgo: 18 },
  { name: "practice-questions.md", sizeBytes: 4_902, minutesAgo: 9 },
  { name: "loops-solutions.py", sizeBytes: 2_017, minutesAgo: 3 },
];

const STUDENTS = [
  "Grace Hopper",
  "Katherine Johnson",
  "Alan Turing",
  "Radia Perlman",
  "Barbara Liskov",
  "Tim Berners-Lee",
];

const MESSAGES = [
  {
    student: "Grace Hopper",
    message: "Why does range(5) stop at 4? I expected it to print 5 as well.",
    reply:
      "Because the end value is exclusive — range(5) means five numbers starting at zero. If you want 1 through 5, use range(1, 6).",
    replyRole: "instructor",
    minutesAgo: 12,
  },
  {
    student: "Alan Turing",
    message: "Is enumerate faster than using range(len(list))?",
    reply:
      "Not meaningfully faster, but it is clearer, and it works on things that have no length. Prefer it for readability.",
    replyRole: "ai",
    minutesAgo: 7,
  },
  {
    student: "Barbara Liskov",
    message: "My loop prints nothing at all and there is no error.",
    reply:
      "That usually means the sequence is empty. Print the list itself just before the loop — if it shows [], the bug is where you built it, not in the loop.",
    replyRole: "instructor",
    minutesAgo: 4,
  },
  { student: "Radia Perlman", message: "Can we see the solutions file again?", reply: null, minutesAgo: 1 },
];

const QUIZ = {
  title: "Quick check: loops",
  questions: [
    {
      prompt: "What does range(5) produce?",
      options: ["1, 2, 3, 4, 5", "0, 1, 2, 3, 4", "0, 1, 2, 3, 4, 5", "5 on its own"],
      correctIndex: 1,
      explanation: "The start defaults to 0 and the end is exclusive.",
      topic: "range",
    },
    {
      prompt: "What does enumerate give you on each pass?",
      options: ["The value only", "The index only", "The index and the value", "A copy of the list"],
      correctIndex: 2,
      explanation: "enumerate yields (index, value) pairs.",
      topic: "enumerate",
    },
    {
      prompt: "When does the else block on a for loop run?",
      options: [
        "Every time the loop ends",
        "Only if the loop body never ran",
        "Only if the loop finished without break",
        "Only if an exception was raised",
      ],
      correctIndex: 2,
      explanation: "for/else runs the else only when no break happened.",
      topic: "for/else",
    },
  ],
  // Scores that give the results screen something to show: a spread, not all 3/3.
  attempts: [
    { student: "Grace Hopper", answers: [1, 2, 2] },
    { student: "Katherine Johnson", answers: [1, 2, 0] },
    { student: "Alan Turing", answers: [1, 2, 2] },
    { student: "Radia Perlman", answers: [0, 2, 2] },
    { student: "Barbara Liskov", answers: [1, 0, 1] },
  ],
};

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

async function seed() {
  await connectRedis();

  // One demo room, reused: re-running the seeder must not leave a trail of
  // half-populated rooms behind for the next take to pick the wrong one.
  await query("DELETE FROM sessions WHERE room_code = $1", [ROOM]);
  const { rows: sessionRows } = await query(
    `INSERT INTO sessions (room_code, instructor_name, workshop_title, status, started_at)
     VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
    [ROOM, INSTRUCTOR, TITLE, minutesAgo(24)]
  );
  const session = sessionRows[0];

  // The socket's session-state snapshot is gated on this Redis key existing.
  // Without it the client still gets the guide over HTTP at join, but never
  // the socket snapshot — so the student count stays 0 and the Q&A thread
  // renders empty, which is exactly the "dead room" look we are fixing.
  await setSessionData(session.id, {
    id: session.id,
    roomCode: session.room_code,
    instructorName: session.instructor_name,
    workshopTitle: session.workshop_title,
    status: session.status,
    startedAt: session.started_at,
  });

  console.log(`[seed] session ${ROOM} (${session.id})`);

  for (const block of GUIDE_BLOCKS) {
    await query(
      `INSERT INTO guide_blocks (session_id, type, title, content, code, language, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        session.id,
        block.type,
        block.title,
        block.content,
        block.code ?? null,
        block.language ?? null,
        minutesAgo(block.minutesAgo),
      ]
    );
  }
  console.log(`[seed] ${GUIDE_BLOCKS.length} guide blocks`);

  for (const file of SHARED_FILES) {
    await query(
      `INSERT INTO shared_files (session_id, name, url, size_bytes, shared_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        session.id,
        file.name,
        `https://example.invalid/demo/${encodeURIComponent(file.name)}`,
        file.sizeBytes,
        minutesAgo(file.minutesAgo),
      ]
    );
  }
  console.log(`[seed] ${SHARED_FILES.length} shared files`);

  const studentIds = new Map(STUDENTS.map((name) => [name, `demo-${name.toLowerCase().replace(/\s+/g, "-")}`]));

  for (const [i, m] of MESSAGES.entries()) {
    await query(
      `INSERT INTO messages (session_id, message_id, student_id, student_name, message, reply, reply_role, replied_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        session.id,
        `demo-msg-${i}`,
        FOR_STUDENT || studentIds.get(m.student),
        m.student,
        m.message,
        m.reply,
        m.reply ? m.replyRole : null,
        m.reply ? minutesAgo(m.minutesAgo - 0.5) : null,
        minutesAgo(m.minutesAgo),
      ]
    );
  }
  console.log(`[seed] ${MESSAGES.length} questions`);

  // ─── Quiz, launched, with a spread of results ──────────────────────────────
  const { rows: quizRows } = await query(
    `INSERT INTO assessments (session_id, kind, title, status, navigation, proctored, counts_toward_score, source, launched_at)
     VALUES ($1,'quiz',$2,'live','free',false,false,'manual',$3) RETURNING *`,
    [session.id, QUIZ.title, minutesAgo(6)]
  );
  const quiz = quizRows[0];

  const questionIds = [];
  for (const [i, q] of QUIZ.questions.entries()) {
    const { rows } = await query(
      `INSERT INTO assessment_questions (assessment_id, position, prompt, options, correct_index, explanation, points, topic)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,1,$7) RETURNING id`,
      [quiz.id, i, q.prompt, JSON.stringify(q.options), q.correctIndex, q.explanation, q.topic]
    );
    questionIds.push(rows[0].id);
  }

  for (const attempt of QUIZ.attempts) {
    const { rows } = await query(
      `INSERT INTO assessment_attempts (assessment_id, student_id, student_name, status, submitted_at, started_at)
       VALUES ($1,$2,$3,'submitted',$4,$5) RETURNING id`,
      [
        quiz.id,
        studentIds.get(attempt.student),
        attempt.student,
        minutesAgo(3),
        minutesAgo(5),
      ]
    );
    const attemptId = rows[0].id;
    let score = 0;
    for (const [i, selected] of attempt.answers.entries()) {
      const correct = selected === QUIZ.questions[i].correctIndex;
      if (correct) score += 1;
      await query(
        `INSERT INTO assessment_answers (attempt_id, question_id, selected_index, is_correct)
         VALUES ($1,$2,$3,$4)`,
        [attemptId, questionIds[i], selected, correct]
      );
    }
    await query("UPDATE assessment_attempts SET score = $2, max_score = $3 WHERE id = $1", [
      attemptId,
      score,
      QUIZ.questions.length,
    ]);
  }
  console.log(`[seed] quiz "${QUIZ.title}" with ${QUIZ.attempts.length} submitted attempts`);

  // Roster: the header count and the People panel both read this set.
  const rosterKey = `students_active:${session.id}`;
  await redis.del(rosterKey);
  for (const name of STUDENTS) await redis.sAdd(rosterKey, studentIds.get(name));
  await redis.expire(rosterKey, 86_400);
  console.log(`[seed] ${STUDENTS.length} students online`);

  return session;
}

/**
 * Hold an instructor socket open. Without one the server broadcasts
 * "instructor-offline" after its grace period and the student client raises a
 * modal over whatever is being recorded.
 */
function holdInstructorSocket(session) {
  const token = issueInstructorToken({ sessionId: session.id, roomCode: session.room_code });
  const url = `ws://localhost:${PORT}/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);

  ws.on("open", () => console.log("[seed] instructor socket open — room reads as live"));
  ws.on("close", () => console.log("[seed] instructor socket closed"));
  ws.on("error", (err) => console.error("[seed] instructor socket error:", err.message));
  return ws;
}

/**
 * Drip content in on a timer so a take can capture arrival, not just presence.
 * Each beat is a real insert plus the same broadcast the live pipeline sends.
 */
async function runBeats(session, ws) {
  const beats = [
    {
      after: 6_000,
      run: async () => {
        const { rows } = await query(
          `INSERT INTO guide_blocks (session_id, type, title, content, code, language)
           VALUES ($1,'tip',$2,$3,null,null) RETURNING *`,
          [
            session.id,
            "Nested loops multiply the work",
            "Two loops one inside the other run the inner one once per outer pass. Ten by ten is a hundred passes — fine here, not fine on a million rows.",
          ]
        );
        return { type: "guide-block", row: rows[0] };
      },
    },
    {
      after: 14_000,
      run: async () => {
        const { rows } = await query(
          `INSERT INTO guide_blocks (session_id, type, title, content, code, language)
           VALUES ($1,'code',$2,$3,$4,'python') RETURNING *`,
          [
            session.id,
            "Walking a grid",
            "The classic nested loop: rows on the outside, columns on the inside.",
            "for row in grid:\n    for cell in row:\n        print(cell, end=\" \")\n    print()",
          ]
        );
        return { type: "guide-block", row: rows[0] };
      },
    },
  ];

  for (const beat of beats) {
    await new Promise((r) => setTimeout(r, beat.after));
    const { row } = await beat.run();
    console.log(`[beat] guide block: ${row.title}`);
    // Reuse the server's own broadcast by posting through the instructor socket
    // is not possible for guide blocks, so the client picks these up on its
    // next session-state; for live arrival during a take, reload the student
    // tab just before the beat fires.
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "noop", payload: {} }));
    }
  }
}

const session = await seed();

if (LIVE) {
  const ws = holdInstructorSocket(session);
  if (BEATS) await runBeats(session, ws);
  console.log(`\n[seed] holding room ${ROOM} open. Student URL: http://localhost:3000/room/${ROOM}`);
  console.log("[seed] Ctrl+C to close the room.\n");
  process.on("SIGINT", async () => {
    ws.close();
    await pool.end();
    await redis.quit();
    process.exit(0);
  });
} else {
  await pool.end();
  await redis.quit();
  console.log(`\n[seed] done. Student URL: http://localhost:3000/room/${ROOM}`);
  console.log("[seed] re-run with --live before recording, or the offline modal appears.\n");
}
