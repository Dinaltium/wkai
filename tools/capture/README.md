# Demo capture

Scripts for recording product footage of WKAI actually working — a real
session, a real browser, a real cursor. Nothing here is mocked: the clips show
the app talking to a running backend.

## Why these exist

The obvious way to record a demo is by hand. These make it repeatable: when the
UI changes, the same take can be shot again without re-learning where every
button is or how OBS was configured.

## Pieces

| Script | Does |
| --- | --- |
| `obs.mjs` | One OBS WebSocket request. `node obs.mjs <RequestType> [json\|@file]` |
| `shot.ps1` | Screenshots the primary display, so you can see what to click before clicking |
| `input.ps1` | Drives the real mouse and keyboard from a JSON action list |
| `win.ps1` | Focuses, moves and measures a window before a take |

## Requirements

- **OBS Studio 28+** with Tools → WebSocket Server Settings enabled. If a
  password is set, `obs.mjs` says so rather than failing obscurely.
- **Windows**, in the interactive desktop session. Input cannot be injected
  from an SSH session — Windows isolates session 0 from the desktop, so a
  script running there moves nothing.

```bash
npm install
```

## Recording a take

```bash
node obs.mjs GetRecordStatus
```

```bash
node obs.mjs StartRecord
```

Then drive the UI, and stop — the response carries the output path:

```bash
node obs.mjs StopRecord
```

## Action lists

`input.ps1` reads a JSON array. Movement is eased (`easeInOutCubic`) and
keystrokes are jittered, because a linear tween and perfectly even typing both
read as synthetic on camera.

```json
[
  { "type": "move", "x": 960, "y": 532, "ms": 1000 },
  { "type": "click" },
  { "type": "text", "value": "Grace Hopper", "cps": 11 },
  { "type": "scroll", "clicks": -3, "ms": 600 },
  { "type": "wait", "ms": 800 }
]
```

```bash
pwsh -File input.ps1 -ActionsPath shot-join.json
```

## The loop that makes this work

Screenshot, look, compute coordinates, move, screenshot again. Never move the
cursor at a position you have not verified — the window may have moved, or the
page may not have finished loading.

`shot.ps1` captures the screen (what you can click). `obs.mjs
SaveSourceScreenshot` captures what OBS sees (what ends up in the video). They
are not the same thing, and checking the second one is how you find out the
capture is bound to the wrong window before you record three minutes of it.

## Framing

Bind OBS to the demo window specifically rather than capturing the display —
a display capture puts whatever else is on screen into your footage.

The window capture returns the client area. Cropping the top removes the tab
strip and address bar, which leaves pure app content and keeps a localhost URL
out of marketing material.

## While a take is running

The scripts own the mouse and keyboard. Touching either mid-take corrupts the
shot.
