/**
 * Shoots the landing-page product clips.
 *
 * Per take: reset the page over CDP, focus the window, roll OBS, drive the real
 * cursor along an eased path, stop, and name the file. Element positions are
 * read from the live DOM at shoot time rather than hardcoded, so a layout tweak
 * does not silently produce a take of the cursor clicking empty space.
 */
import { execFileSync } from "child_process";
import { writeFileSync, renameSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { connect } from "./obs.mjs";
import { cdp } from "./cdp.mjs";

// Helper scripts and the per-take action file live beside this one.
const HERE = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, "/");
const TAKES_DIR = "C:/Users/RAFAN AHAMAD SHEIK/Videos/OBS/wkai-takes";
const ROOM_URL = "http://localhost:3000/room/DEMO01";
const PAGE_ORIGIN = { x: 158, y: 72 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function focusWindow() {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class F{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);}';` +
      `$p = Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*WKAI*' } | Select-Object -First 1;` +
      `[void][F]::SetForegroundWindow($p.MainWindowHandle)`,
  ]);
}

function runCursor(actions) {
  const path = `${HERE}/current-take.json`;
  writeFileSync(path, JSON.stringify(actions, null, 2));
  execFileSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", `${HERE}/cursor.ps1`,
     "-ActionsPath", path, "-OriginX", String(PAGE_ORIGIN.x), "-OriginY", String(PAGE_ORIGIN.y)],
    { stdio: "inherit" }
  );
}

/** Centre of the first element matching a selector, in page coordinates. */
async function centreOf(page, selector, index = 0) {
  const box = await page.eval(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els[${index}];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
  if (!box) throw new Error(`no element for ${selector}[${index}]`);
  return box;
}

async function tabCentre(page, label) {
  const box = await page.eval(`
    (() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").trim() === ${JSON.stringify(label)}
      );
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
  if (!box) throw new Error(`no tab named ${label}`);
  return box;
}

// ─── Takes ────────────────────────────────────────────────────────────────────

const TAKES = {
  /** The guide filling with cards — the core of the product. */
  async guide(page) {
    await page.navigate(ROOM_URL);
    // The feed auto-scrolls to the newest card, so a take that starts here has
    // nowhere to scroll to. Reset to the top of the real scroll container —
    // the page itself does not scroll, an inner .scroll-area does.
    await page.eval(`document.querySelector(".scroll-area").scrollTop = 0; true`);
    await sleep(700);
    const copy = await centreOf(page, "button.copy, [aria-label*='Copy'], button", 3).catch(
      () => ({ x: 1480, y: 300 })
    );
    return [
      { type: "move", x: 880, y: 560, ms: 900 },
      { type: "wait", ms: 900 },
      { type: "scroll", notches: -2, ms: 1100 },
      { type: "wait", ms: 1100 },
      { type: "scroll", notches: -2, ms: 1100 },
      { type: "wait", ms: 1000 },
      { type: "move", x: copy.x, y: copy.y, ms: 800 },
      { type: "wait", ms: 1000 },
      { type: "scroll", notches: -3, ms: 1400 },
      { type: "wait", ms: 1400 },
    ];
  },

  /** Files arriving from the instructor, ready to download. */
  async files(page) {
    await page.navigate(ROOM_URL);
    await sleep(400);
    const tab = await tabCentre(page, "Files");
    return [
      { type: "move", x: 800, y: 500, ms: 600 },
      { type: "clickAt", x: tab.x, y: tab.y, ms: 800 },
      { type: "wait", ms: 1200 },
      { type: "move", x: 700, y: 200, ms: 700 },
      { type: "wait", ms: 600 },
      { type: "move", x: 700, y: 285, ms: 600 },
      { type: "wait", ms: 600 },
      { type: "move", x: 1480, y: 285, ms: 700 },
      { type: "wait", ms: 1100 },
    ];
  },

  /** An existing thread, plus a new question being asked and landing in it. */
  async qa(page) {
    await page.navigate(ROOM_URL);
    await sleep(400);

    // Each navigation re-joins and is issued a new student id, so the seeded
    // thread has to be pointed at the identity the camera holds right now or
    // the tab renders empty.
    const studentId = await page.eval(`
      (() => {
        const t = sessionStorage.getItem("wkai_join_token");
        return t ? JSON.parse(atob(t.split(".")[0])).studentId : null;
      })()`);
    if (studentId) {
      execFileSync("node", [`${HERE}/attach-thread.mjs`, studentId], { stdio: "inherit" });
      await page.eval(`location.reload(); true`);
      await sleep(4000);
    }

    const tab = await tabCentre(page, "Q&A");
    return [
      { type: "move", x: 900, y: 500, ms: 600 },
      { type: "clickAt", x: tab.x, y: tab.y, ms: 800 },
      { type: "wait", ms: 1400 },
      { type: "clickAt", x: 700, y: 935, ms: 900 },
      { type: "wait", ms: 400 },
      { type: "type", text: "How do I loop over a dictionary?", cps: 14 },
      { type: "wait", ms: 500 },
      { type: "key", key: "{ENTER}" },
      { type: "wait", ms: 2200 },
    ];
  },

  /**
   * A student joining with the code — the first thing anyone does. Typed for
   * real into the real form, so the take ends on the room actually opening.
   */
  async join(page) {
    await page.navigate("http://localhost:3000/join");
    await page.eval(`document.querySelectorAll("input").forEach(i => { i.value = ""; }); true`);
    await sleep(500);
    const name = await centreOf(page, "input[placeholder='Alex Smith']");
    const firstCode = await centreOf(page, "input[placeholder='·']", 0);
    return [
      { type: "move", x: 800, y: 300, ms: 700 },
      { type: "clickAt", x: name.x, y: name.y, ms: 700 },
      { type: "wait", ms: 350 },
      { type: "type", text: "Grace Hopper", cps: 13 },
      { type: "wait", ms: 600 },
      { type: "clickAt", x: firstCode.x, y: firstCode.y, ms: 700 },
      { type: "wait", ms: 350 },
      // The code boxes advance on their own as each character lands.
      { type: "type", text: "DEMO01", cps: 5 },
      { type: "wait", ms: 900 },
      { type: "key", key: "{ENTER}" },
      { type: "wait", ms: 3500 },
    ];
  },

  /** Opening the quiz and answering a question — the flow, not just the card. */
  async quiz(page) {
    await page.navigate(ROOM_URL);
    await sleep(400);
    const tab = await tabCentre(page, "Quiz");

    // Measure "Start quiz" where it actually renders: open the tab in JS, read
    // the button, then put the tab back so the real cursor still performs the
    // click on camera. Guessing this coordinate produced a take of the pointer
    // clicking dead space next to the card.
    const start = await page.eval(`
      (async () => {
        const quizTab = [...document.querySelectorAll("button")].find(
          (b) => (b.textContent || "").trim() === "Quiz"
        );
        quizTab?.click();
        await new Promise((r) => setTimeout(r, 900));
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /start (quiz|test)/i.test((b.textContent || "").trim())
        );
        const box = btn
          ? (() => { const r = btn.getBoundingClientRect();
              return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()
          : null;
        const guideTab = [...document.querySelectorAll("button")].find(
          (b) => (b.textContent || "").trim() === "Guide"
        );
        guideTab?.click();
        return box;
      })()`);
    await sleep(600);

    const actions = [
      { type: "move", x: 900, y: 500, ms: 600 },
      { type: "clickAt", x: tab.x, y: tab.y, ms: 800 },
      { type: "wait", ms: 1600 },
    ];
    if (start) {
      actions.push(
        { type: "clickAt", x: start.x, y: start.y, ms: 800 },
        { type: "wait", ms: 2200 },
        { type: "move", x: 800, y: 430, ms: 700 },
        { type: "wait", ms: 800 },
        { type: "clickAt", x: 800, y: 500, ms: 700 },
        { type: "wait", ms: 1800 }
      );
    } else {
      actions.push({ type: "move", x: 800, y: 320, ms: 700 }, { type: "wait", ms: 1600 });
    }
    return actions;
  },
};

// ─── Runner ───────────────────────────────────────────────────────────────────

const name = process.argv[2];
if (!TAKES[name]) {
  console.error(`usage: node takes.mjs <${Object.keys(TAKES).join("|")}>`);
  process.exit(1);
}

if (!existsSync(TAKES_DIR)) mkdirSync(TAKES_DIR, { recursive: true });

const obs = await connect();
await obs.call("SetRecordDirectory", { recordDirectory: TAKES_DIR });

const page = await cdp();
console.log(`[${name}] preparing page`);
const actions = await TAKES[name](page);
page.close();

focusWindow();
await sleep(700);

console.log(`[${name}] rolling`);
await obs.call("StartRecord");
await sleep(700); // clean head before the cursor moves

runCursor(actions);

await sleep(700); // clean tail
const { outputPath } = await obs.call("StopRecord");
obs.close();

await sleep(1200); // let the muxer finish writing
const target = `${TAKES_DIR}/${name}.mp4`;
try {
  if (existsSync(target)) renameSync(target, `${target}.${Date.now()}.bak`);
  renameSync(outputPath, target);
  console.log(`[${name}] saved ${target}`);
} catch (err) {
  console.log(`[${name}] recorded ${outputPath} (rename failed: ${err.message})`);
}
