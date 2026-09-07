import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { textLLM, callWithRetry } from "../groqClient.js";
import { buildSessionContext } from "../sessionContext.js";
import { extractJsonBlock } from "../jsonBlock.js";
import { getLangSmithConfig } from "../langsmith.js";
import { UNTRUSTED_INPUT_RULES, wrapUntrusted } from "../untrusted.js";

// ─── Question generation ─────────────────────────────────────────────────────

const QuestionSchema = z.object({
  prompt: z.string().min(5),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  topic: z.string().min(1),
});

const GeneratedQuestionsSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(20),
});

const questionsParser = StructuredOutputParser.fromZodSchema(GeneratedQuestionsSchema);

const generationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You write assessment questions for a live coding workshop.

What this workshop has actually taught:
{session_context}

Rules:
- Ask ONLY about material present in the context above. If the context does not
  support {count} questions, return fewer. Never invent topics the room has not
  covered — a question about something untaught measures nothing.
- Exactly 4 options per question, exactly one correct.
- {difficulty_rule}
- Options must be plausible: wrong answers should be the mistakes a beginner
  actually makes here, not obvious filler.
- "topic" is a short label for what the question tests ("async/await",
  "pip install", "list slicing") — it is used to tell a student what they are
  weak at, so make it specific.
- "explanation" says why the correct option is correct, in one or two sentences.

{format_instructions}`,
  ],
  ["human", "Write {count} {kind} questions.{extra_instructions}"],
]);

const DIFFICULTY_RULES = {
  easy: "Keep questions recall-level: definitions, syntax, what a command does.",
  medium:
    "Mix recall with application: given this code or error, what happens or what fixes it.",
  hard: "Favour application and diagnosis over recall; include at least one question that requires reasoning across two things taught.",
};

/**
 * Generate questions grounded in what the session actually taught.
 *
 * @param {string} sessionId
 * @param {object} options
 * @param {number} [options.count]
 * @param {"quiz"|"test"} [options.kind]
 * @param {"easy"|"medium"|"hard"} [options.difficulty]
 * @param {string} [options.focus] instructor's own steer, e.g. "cover the async part"
 */
export async function generateAssessmentQuestions(sessionId, options = {}) {
  const count = Math.min(Math.max(Number(options.count) || 5, 1), 20);
  const kind = options.kind === "test" ? "test" : "quiz";
  const difficulty = DIFFICULTY_RULES[options.difficulty] ? options.difficulty : "medium";

  // Ranked against the instructor's focus when they gave one, so "cover the
  // async part" retrieves the async material rather than the newest blocks.
  const sessionContext = await buildSessionContext(sessionId, options.focus ?? "");
  if (!sessionContext) {
    return { questions: [], reason: "This session has not recorded any teaching material yet." };
  }

  const chain = generationPrompt.pipe(textLLM);
  const response = await callWithRetry(() =>
    chain.invoke({
      session_context: sessionContext,
      count,
      kind,
      difficulty_rule: DIFFICULTY_RULES[difficulty],
      // The instructor is trusted, but this text still reaches the model
      // verbatim, so it is fenced for the same reason student text is.
      extra_instructions: options.focus
        ? `\n\nThe instructor asked you to focus on:\n${wrapUntrusted("instructor focus note", options.focus)}\n\n${UNTRUSTED_INPUT_RULES}`
        : "",
      format_instructions: questionsParser.getFormatInstructions(),
    })
  );

  const parsed = await questionsParser.parse(
    extractJsonBlock(String(response.content ?? "")) ?? String(response.content ?? "")
  );

  return { questions: parsed.questions.slice(0, count), reason: null };
}

// ─── Attempt evaluation ──────────────────────────────────────────────────────

const evaluationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You summarise one student's assessment attempt for their instructor.

Rules:
- Base every statement on the answer record below. Do not speculate about
  effort, attitude, attendance, or anything the record does not show.
- Say what they understood, then what they did not, naming the topics.
- If the record is too small to justify a conclusion (fewer than 3 questions),
  say so plainly rather than generalising.
- 4 sentences maximum, plain language, addressed to the instructor.
- No score restating — the instructor can already see the number.

${UNTRUSTED_INPUT_RULES}`,
  ],
  ["human", "{record}"],
]);

/**
 * Turn one attempt's answers into a short read on the student, grounded in the
 * per-question record rather than the score alone.
 *
 * @param {object} attempt { studentName, score, maxScore, answers: [{prompt, topic, selected, correct, isCorrect}] }
 */
export async function evaluateAttempt(attempt) {
  const answers = Array.isArray(attempt?.answers) ? attempt.answers : [];
  if (!answers.length) return null;

  const record = [
    `Student: ${wrapUntrusted("student name", attempt.studentName ?? "Student")}`,
    `Score: ${attempt.score ?? 0} / ${attempt.maxScore ?? answers.length}`,
    "Answers:",
    ...answers.map((a, i) => {
      const verdict = a.isCorrect ? "correct" : "wrong";
      const chose = a.selected ?? "(no answer)";
      return `${i + 1}. [${a.topic ?? "untagged"}] ${a.prompt} → chose "${chose}" (${verdict}; correct answer "${a.correct}")`;
    }),
  ].join("\n");

  try {
    const chain = evaluationPrompt.pipe(textLLM);
    const response = await callWithRetry(() =>
      chain.invoke(
        { record: wrapUntrusted("assessment answer record", record) },
        getLangSmithConfig("assessment-evaluate", ["assessment", "langchain"])
      )
    );
    return String(response.content ?? "").trim() || null;
  } catch (err) {
    console.error("[AssessmentAgent] evaluateAttempt failed:", err.message);
    return null;
  }
}
