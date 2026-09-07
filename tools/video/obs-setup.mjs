/**
 * Build the capture scene for the WKAI product footage.
 *
 * Canvas is set to the Chrome client area exactly (1600x1000, 16:10), so the
 * recording is 1:1 with what the page renders — no scaling in the capture path,
 * which is what keeps UI text sharp. The landing page frames these clips at
 * roughly 700px wide, so the only downscale happens once, at export.
 */
import { connect } from "./obs.mjs";

const SCENE = "WKAI Demo";
const SOURCE = "Chrome — WKAI";
const WIDTH = 1600;
const HEIGHT = 1000;
const FPS = 60;

const obs = await connect();

// 1. Canvas + framerate
await obs.call("SetVideoSettings", {
  baseWidth: WIDTH,
  baseHeight: HEIGHT,
  outputWidth: WIDTH,
  outputHeight: HEIGHT,
  fpsNumerator: FPS,
  fpsDenominator: 1,
});
console.log(`canvas ${WIDTH}x${HEIGHT} @${FPS}`);

// 2. Scene (idempotent — re-running must not stack duplicates)
const { scenes } = await obs.call("GetSceneList");
if (!scenes.some((s) => s.sceneName === SCENE)) {
  await obs.call("CreateScene", { sceneName: SCENE });
  console.log("scene created");
} else {
  console.log("scene exists");
}

// 3. Window capture. OBS identifies windows as "title:class:executable".
const windowSpec = "WKAI — Workshop AI:Chrome_WidgetWin_1:chrome.exe";
const inputSettings = {
  window: windowSpec,
  // 2 = Windows Graphics Capture: keeps capturing when the window is not the
  // top-most one, and does not tear on resize the way BitBlt does.
  capture_method: 2,
  client_area: true,
  cursor: true,
};

const existing = await obs.call("GetSceneItemList", { sceneName: SCENE });
const found = existing.sceneItems.find((i) => i.sourceName === SOURCE);
if (!found) {
  await obs.call("CreateInput", {
    sceneName: SCENE,
    inputName: SOURCE,
    inputKind: "window_capture",
    inputSettings,
  });
  console.log("source created");
} else {
  await obs.call("SetInputSettings", { inputName: SOURCE, inputSettings });
  console.log("source settings updated");
}

// 4. Fit the source to the canvas
const items = await obs.call("GetSceneItemList", { sceneName: SCENE });
const item = items.sceneItems.find((i) => i.sourceName === SOURCE);
await obs.call("SetSceneItemTransform", {
  sceneName: SCENE,
  sceneItemId: item.sceneItemId,
  sceneItemTransform: {
    positionX: 0,
    positionY: 0,
    scaleX: 1,
    scaleY: 1,
    boundsType: "OBS_BOUNDS_SCALE_INNER",
    boundsWidth: WIDTH,
    boundsHeight: HEIGHT,
    boundsAlignment: 0,
  },
});

await obs.call("SetCurrentProgramScene", { sceneName: SCENE });

// 5. Mute the mics: these are silent UI loops, and a stray desk noise in the
// file means re-exporting later to strip it.
const { inputs } = await obs.call("GetInputList");
for (const input of inputs) {
  if (/audio|mic|desktop/i.test(input.inputKind ?? "")) {
    await obs.call("SetInputMute", { inputName: input.inputName, inputMuted: true }).catch(() => {});
  }
}

const status = await obs.call("GetRecordStatus");
console.log("scene active, recording:", status.outputActive);
obs.close();
