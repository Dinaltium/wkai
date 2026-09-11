import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { classifyBlocks, filterUngroundedBlocks } from "../src/ai/guideBlockFilter.js";

const block = (over = {}) => ({
  type: "explanation",
  content: "Run the migration script before starting the backend, or the tables will not exist.",
  ...over,
});

describe("deciding which guide blocks a student actually sees", () => {
  test("a grounded explanation is kept", () => {
    const { kept, dropped } = classifyBlocks([block()]);
    assert.equal(kept.length, 1);
    assert.equal(dropped.length, 0);
  });

  test("narration of the screen is rejected, and says so", () => {
    const { kept, dropped } = classifyBlocks([
      block({ content: "The instructor is reviewing the migrate.js file in VS Code." }),
    ]);
    assert.equal(kept.length, 0);
    assert.equal(dropped[0].reason, "narrates the screen instead of teaching");
  });

  test("a block too short to teach anything is rejected", () => {
    const { kept, dropped } = classifyBlocks([block({ content: "SQL tables." })]);
    assert.equal(kept.length, 0);
    assert.equal(dropped[0].reason, "too short");
  });

  test("a code block with no code is rejected — that is an explanation, or an invention", () => {
    const { kept, dropped } = classifyBlocks([
      block({ type: "code", content: "This creates the guide_blocks table with an id and a session id." }),
    ]);
    assert.equal(kept.length, 0);
    assert.equal(dropped[0].reason, "code block with no code");
  });

  test("a code block carrying real code is kept", () => {
    const { kept } = classifyBlocks([
      block({
        type: "code",
        content: "The migration creates the table only when it is missing, so it is safe to re-run.",
        code: "CREATE TABLE IF NOT EXISTS guide_blocks (id UUID PRIMARY KEY);",
      }),
    ]);
    assert.equal(kept.length, 1);
  });

  test("every rejection is reported, not just the first", () => {
    const { kept, dropped } = classifyBlocks([
      block({ content: "The screen shows a terminal window with output." }),
      block({ content: "Too short." }),
      block(),
    ]);
    assert.equal(kept.length, 1);
    assert.equal(dropped.length, 2);
  });

  test("filterUngroundedBlocks still returns just the survivors", () => {
    const kept = filterUngroundedBlocks([block(), block({ content: "The user is typing." })]);
    assert.equal(kept.length, 1);
  });
});
