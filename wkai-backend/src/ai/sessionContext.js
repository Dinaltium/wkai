import { query } from "../db/client.js";
import { getTranscript } from "../db/redis.js";
import { getSessionMemory } from "./memory.js";

/**
 * Session context for the student-facing agents.
 *
 * Everything a workshop has taught is already recorded — the workshop title,
 * every guide block generated from the instructor's screen and speech, the
 * files they shared, and the last thing they said. Until now the agents saw
 * none of it: they got `memory.getContextString()`, which is the last four
 * AI summaries and nothing else. So a student asking "why does my contract
 * fail" got a generic answer even though the session had spent twenty minutes
 * on exactly that.
 *
 * This assembles the record into a prompt block, ranked against the student's
 * actual question rather than dumped wholesale — a long session has far more
 * material than a prompt can hold, and the relevant part is rarely the newest.
 */

const MAX_CONTEXT_CHARS = 5_000;
const RECENT_BLOCKS = 3;
const RETRIEVED_BLOCKS = 5;
// Earlier sessions in the same workspace are the "folder memory": a course that
// runs over several days, or a series of related workshops, keeps one body of
// taught material instead of restarting from nothing every room. Capped tighter
// than the live session — older material is supporting context, not the subject.
const WORKSPACE_BLOCKS = 4;
const WORKSPACE_BLOCK_POOL = 120;

// Words too common in a coding workshop to discriminate between blocks.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "this", "that", "these",
  "with", "from", "for", "to", "of", "in", "on", "at", "is", "are", "was",
  "be", "been", "it", "its", "as", "by", "we", "you", "i", "my", "your",
  "how", "what", "why", "when", "can", "do", "does", "not", "no", "yes",
  "error", "code", "run", "running", "use", "using", "get", "getting",
]);

export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Term-overlap scoring with an inverse-document-frequency weight: a term that
 * appears in every block (the session's topic) says little about which block
 * to pick, while a rare one (a library name, an exception type) says a lot.
 * Deliberately not embeddings — a session is tens of blocks, not millions, and
 * a vector store would add infrastructure for a corpus this small. Swapping
 * this scorer for a vector search later touches only this function.
 */
export function rankBlocks(blocks, queryTokens) {
  if (!queryTokens.length) return [];

  const documentFrequency = new Map();
  const blockTokens = blocks.map((block) => {
    const tokens = new Set(tokenize(`${block.title ?? ""} ${block.content} ${block.code ?? ""}`));
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
    return tokens;
  });

  return blocks
    .map((block, index) => {
      let score = 0;
      for (const token of queryTokens) {
        if (!blockTokens[index].has(token)) continue;
        score += Math.log(1 + blocks.length / (documentFrequency.get(token) ?? 1));
      }
      return { block, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

function renderBlock(block) {
  const heading = block.title ? `${block.title} (${block.type})` : block.type;
  const code = block.code ? `\n\`\`\`${block.language ?? ""}\n${block.code}\n\`\`\`` : "";
  return `- ${heading}: ${block.content}${code}`;
}

/** Prior-session material is labelled with its session, so the model can say
 *  "we covered this on Tuesday" rather than implying it happened just now. */
function renderWorkspaceBlock(block) {
  const when = block.started_at
    ? new Date(block.started_at).toISOString().slice(0, 10)
    : "earlier";
  const heading = block.title ? `${block.title} (${block.type})` : block.type;
  return `- [${block.workshop_title}, ${when}] ${heading}: ${block.content}`;
}

/**
 * @param {string} sessionId
 * @param {string} [queryText] the student's question / error / notebook —
 *   what the retrieval is ranked against. Omitted, only recency is used.
 * @returns {Promise<string>} prompt-ready context, or "" when the session has
 *   taught nothing yet.
 */
export async function buildSessionContext(sessionId, queryText = "") {
  if (!sessionId) return "";

  try {
    const [sessionRows, blockRows, fileRows, transcript, memoryContext] = await Promise.all([
      query(
        `SELECT s.workshop_title, s.instructor_name, s.workspace_id, w.name AS workspace_name
         FROM sessions s LEFT JOIN workspaces w ON w.id = s.workspace_id
         WHERE s.id = $1`,
        [sessionId]
      ),
      query(
        "SELECT type, title, content, code, language, created_at FROM guide_blocks WHERE session_id = $1 ORDER BY created_at DESC LIMIT 60",
        [sessionId]
      ),
      query("SELECT name FROM shared_files WHERE session_id = $1 ORDER BY shared_at DESC LIMIT 10", [sessionId]),
      getTranscript(sessionId).catch(() => ""),
      getSessionMemory(sessionId).getContextString().catch(() => ""),
    ]);

    const sections = [];
    const session = sessionRows.rows[0];
    if (session) {
      const workspace = session.workspace_name ? ` Part of the "${session.workspace_name}" workspace.` : "";
      sections.push(`Workshop: "${session.workshop_title}" taught by ${session.instructor_name}.${workspace}`);
    }

    const blocks = blockRows.rows;
    if (blocks.length) {
      // The newest blocks are what the room is doing right now — always
      // included, whether or not they match the question.
      const recent = blocks.slice(0, RECENT_BLOCKS);
      const recentSet = new Set(recent);
      const retrieved = rankBlocks(blocks, tokenize(queryText))
        .filter((entry) => !recentSet.has(entry.block))
        .slice(0, RETRIEVED_BLOCKS)
        .map((entry) => entry.block);

      sections.push(`Most recent in this session:\n${recent.map(renderBlock).join("\n")}`);
      if (retrieved.length) {
        sections.push(`Earlier in this session, related to the question:\n${retrieved.map(renderBlock).join("\n")}`);
      }
    }

    // Material taught in earlier sessions of the same workspace.
    if (session?.workspace_id && queryText) {
      const priorRows = await query(
        `SELECT g.type, g.title, g.content, g.code, g.language,
                s.workshop_title, s.started_at
         FROM guide_blocks g
         JOIN sessions s ON s.id = g.session_id
         WHERE s.workspace_id = $1 AND s.id <> $2
         ORDER BY g.created_at DESC
         LIMIT $3`,
        [session.workspace_id, sessionId, WORKSPACE_BLOCK_POOL]
      );
      const prior = rankBlocks(priorRows.rows, tokenize(queryText))
        .slice(0, WORKSPACE_BLOCKS)
        .map((entry) => entry.block);
      if (prior.length) {
        const rendered = prior.map(renderWorkspaceBlock).join("\n");
        sections.push(`From earlier sessions in the "${session.workspace_name}" workspace:\n${rendered}`);
      }
    }

    if (fileRows.rows.length) {
      sections.push(`Files the instructor shared: ${fileRows.rows.map((f) => f.name).join(", ")}.`);
    }
    if (transcript) {
      sections.push(`Instructor just said: "${String(transcript).slice(0, 400)}"`);
    }
    if (memoryContext) {
      sections.push(`Running summary:\n${memoryContext}`);
    }

    return sections.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
  } catch (err) {
    // Context is an enhancement, never a dependency — an agent still answers
    // without it, just generically.
    console.error("[SessionContext] Build failed:", err.message);
    return "";
  }
}
