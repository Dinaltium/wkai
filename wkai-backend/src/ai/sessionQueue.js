// Per-session AI request queue.
//
// Problem this solves: when many students in one session trigger AI calls at the
// same moment (e.g. everyone pastes an error, or a comprehension question fires
// for the whole room), all requests hit Groq concurrently and trip its rate
// limit — and every retry then fires on the same backoff schedule, producing a
// thundering herd. This serialises AI work per session behind a small concurrency
// cap, and applies a global cap across all sessions so one busy room can't starve
// the whole backend.

const PER_SESSION_CONCURRENCY = Number(process.env.AI_PER_SESSION_CONCURRENCY ?? 2);
const GLOBAL_CONCURRENCY = Number(process.env.AI_GLOBAL_CONCURRENCY ?? 8);
const MAX_QUEUE_PER_SESSION = Number(process.env.AI_MAX_QUEUE_PER_SESSION ?? 50);

let globalActive = 0;
const globalWaiters = []; // resolvers waiting for a global slot

// sessionId -> { active, queue: [ {task, resolve, reject} ] }
const sessions = new Map();

function acquireGlobalSlot() {
  if (globalActive < GLOBAL_CONCURRENCY) {
    globalActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => globalWaiters.push(resolve));
}

function releaseGlobalSlot() {
  const next = globalWaiters.shift();
  if (next) {
    // Hand the slot directly to the next waiter (globalActive stays the same).
    next();
  } else {
    globalActive = Math.max(0, globalActive - 1);
  }
}

function getSessionState(sessionId) {
  let state = sessions.get(sessionId);
  if (!state) {
    state = { active: 0, queue: [] };
    sessions.set(sessionId, state);
  }
  return state;
}

function pump(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) return;

  while (state.active < PER_SESSION_CONCURRENCY && state.queue.length > 0) {
    const item = state.queue.shift();
    state.active += 1;

    acquireGlobalSlot()
      .then(() => item.task())
      .then(
        (result) => item.resolve(result),
        (err) => item.reject(err)
      )
      .finally(() => {
        releaseGlobalSlot();
        state.active -= 1;
        if (state.active === 0 && state.queue.length === 0) {
          sessions.delete(sessionId);
        } else {
          pump(sessionId);
        }
      });
  }
}

/**
 * Run `task` (an async fn) on the queue for `sessionId`. Resolves/rejects with
 * the task's result. Rejects immediately if the session queue is saturated, so a
 * flood degrades gracefully instead of growing memory without bound.
 *
 * @template T
 * @param {string} sessionId
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function runQueued(sessionId, task) {
  const state = getSessionState(sessionId);
  if (state.queue.length >= MAX_QUEUE_PER_SESSION) {
    return Promise.reject(new Error("AI queue is full for this session; try again shortly."));
  }
  return new Promise((resolve, reject) => {
    state.queue.push({ task, resolve, reject });
    pump(sessionId);
  });
}

export function getQueueStats() {
  return {
    globalActive,
    globalWaiting: globalWaiters.length,
    sessions: sessions.size,
  };
}
