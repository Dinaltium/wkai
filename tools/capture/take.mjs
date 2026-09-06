/**
 * Records one demo take start to finish, unattended.
 *
 * Driving a take interactively produces footage full of dead air: the tape
 * keeps rolling while whoever is steering decides what to do next. Everything
 * a take needs — the room, the speech that becomes guide cards, the answer to
 * the student's question, the shared file, and the pointer moving through the
 * UI — is scripted here so the recording is only the parts worth keeping.
 *
 *   node take.mjs [--dry]   (--dry skips OBS, for rehearsing the choreography)
 *
 * Assumes the demo browser is open and maximised on a 1920x1200 display, and
 * that a backend is running. Coordinates below are for that window.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WkaiClient } from "../../wkai-mcp/src/client.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");
const BACKEND = process.env.WKAI_BACKEND_URL ?? "http://localhost:4000";
const APP_URL = process.env.WKAI_APP_URL ?? "http://127.0.0.1:3000/";

/** Screen coordinates for the maximised demo window. */
const AT = {
  heroJoinButton: [512, 892],
  nameField: [960, 532],
  firstCodeBox: [810, 650],
  submitJoin: [960, 818],
  tabGuide: [196, 172],
  tabFiles: [578, 172],
  tabQa: [1732, 172],
  askInput: [960, 1080],
  askSend: [1886, 1120],
  idle: [900, 480],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs one action list through the real mouse and keyboard. */
function drive(actions, label) {
  const file = path.join(tmpdir(), `wkai-take-${label}.json`);
  writeFileSync(file, JSON.stringify(actions));
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "input.ps1"), "-ActionsPath", file],
    { stdio: "inherit" }
  );
  if (r.status !== 0) throw new Error(`input.ps1 failed during "${label}"`);
}

function obs(requestType) {
  if (DRY) return console.log(`[dry] obs ${requestType}`);
  const r = spawnSync(process.execPath, [path.join(HERE, "obs.mjs"), requestType], { encoding: "utf8" });
  process.stdout.write(r.stdout ?? "");
  if (r.status !== 0) throw new Error(`obs ${requestType} failed: ${r.stderr}`);
  return r.stdout;
}

const move = (to, ms = 900) => ({ type: "move", x: to[0], y: to[1], ms });
const click = () => ({ type: "click" });
const wait = (ms) => ({ type: "wait", ms });
const type = (value, cps = 15) => ({ type: "text", value, cps });

const client = new WkaiClient(BACKEND);

try {
  console.log("opening a room…");
  const { roomCode, session, instructorToken } = await client.createSession({
    instructorName: "Ada Lovelace",
    workshopTitle: "Intro to Python loops",
  });
  await client.connectInstructor({ sessionId: session.id, roomCode, instructorToken });
  const instructor = client.instructor(session.id);
  console.log(`room ${roomCode}`);

  // Put the browser on the landing page before the tape rolls, so the take
  // opens on the hero rather than on whatever was left on screen.
  drive(
    [
      { type: "key", value: "^l" },
      wait(400),
      type(APP_URL, 40),
      { type: "key", value: "{ENTER}" },
      wait(4000),
    ],
    "reset"
  );

  obs("StartRecord");
  await sleep(1500);

  // 1 — the hero, then into the join form.
  drive([wait(1200), move(AT.idle, 900), wait(1200), move(AT.heroJoinButton, 1100), wait(500), click(), wait(2200)], "join");

  // 2 — fill it in the way a student would.
  drive(
    [
      move(AT.nameField, 900), wait(350), click(), wait(400),
      type("Grace Hopper", 11), wait(600),
      move(AT.firstCodeBox, 800), wait(300), click(), wait(400),
      type(roomCode, 6), wait(1000),
      move(AT.submitJoin, 800), wait(500), click(), wait(3200),
    ],
    "fill"
  );

  // 3 — the instructor talks; the guide writes itself while the student watches.
  instructor.send("audio-transcript", {
    transcript:
      "A for loop walks a sequence one item at a time. When you write for i in range(5), Python gives you zero through four — range stops one short of the number you pass, which is the off-by-one that catches everyone in their first week. If you want the items themselves rather than their positions, write for item in my_list instead.",
    recentFiles: [],
  });
  drive([move(AT.idle, 900), wait(9000)], "guide-arrives");

  // 4 — a question, answered.
  drive(
    [
      move(AT.tabQa, 1100), wait(450), click(), wait(1600),
      move(AT.askInput, 800), wait(350), click(), wait(400),
      type("Why does my for loop never reach the last item?", 16), wait(700),
      move(AT.askSend, 700), wait(350), click(), wait(2500),
    ],
    "ask"
  );

  const asked = [...instructor.room.inbox.values()].at(-1);
  if (asked) {
    instructor.send("instructor-reply", {
      messageId: asked.messageId,
      studentId: asked.studentId,
      reply:
        "`range(n)` stops one short of **n** — it yields 0 to n-1. Loop over the list directly with `for item in items` and you cannot run off the end.",
    });
  }
  drive([move(AT.idle, 900), wait(4500)], "answered");

  // 5 — a file, shared instantly.
  instructor.send("file-shared", {
    name: "loops-exercises.py",
    url: "https://example.com/loops-exercises.py",
    sizeBytes: 2048,
  });
  drive([move(AT.tabFiles, 1000), wait(450), click(), wait(3500)], "files");

  // 6 — end on the guide, which is the thing that sells the product.
  drive([move(AT.tabGuide, 1000), wait(450), click(), wait(2500), move(AT.idle, 900), wait(2500)], "close");

  obs("StopRecord");
  console.log("take complete");
  await client.endSession(session.id, instructorToken).catch(() => {});
} catch (err) {
  console.error(`take failed: ${err.message}`);
  if (!DRY) obs("StopRecord");
  process.exitCode = 1;
} finally {
  client.closeAll();
}
