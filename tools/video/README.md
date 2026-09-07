# Landing-page demo footage

Scripts that record and cut the product clips on the marketing page
(`wkai-student/public/videos/`). Everything here is reproducible: re-run it and
you get the same shots against the same seeded room.

## Why it exists

The first set of clips was shot against live but **empty** rooms — one guide
card, an empty Q&A, encoded at ~92 kbps. On the page that reads as a broken
product. These scripts fix the cause: a room with real content in it, captured
at a real bitrate, cut to the moment that matters.

## Prerequisites

- Backend + student app running (`localhost:4000` / `localhost:3000`)
- OBS running with obs-websocket enabled on `127.0.0.1:4455`
- DaVinci Resolve **Studio** running, external scripting working
- ffmpeg on PATH

## The flow

```bash
# 1. Fill a room with real content and hold it open (instructor socket stays
#    connected, or the "instructor is not here" modal appears mid-take).
node wkai-backend/scripts/seed-demo-session.js --room DEMO01 --live

# 2. Open Chrome on the room. App mode, fixed size, debug port for state resets.
#    Outer window 1616x1040 at (150,40) → client 1600x1032, page origin (158,72).
chrome --user-data-dir=<temp> --app=http://localhost:3000/room/DEMO01 \
       --remote-debugging-port=9222 --window-size=1616,1040 --window-position=150,40

# 3. Build the OBS scene (canvas 1600x1000 @60, window capture, titlebar cropped)
node tools/video/obs-setup.mjs   # see obs.mjs for the raw client

# 4. Shoot. Each take resets the page, rolls OBS, drives the real cursor, stops.
node tools/video/takes.mjs guide
node tools/video/takes.mjs qa      # re-points the seeded Q&A thread first
node tools/video/takes.mjs files
node tools/video/takes.mjs join
node tools/video/takes.mjs quiz

# 5. Cut and render (one timeline per clip, plus the 5-beat hero showcase)
python tools/video/resolve-assemble.py
python tools/video/resolve-showcase.py

# 6. Web encode into the site
ffmpeg -i <render>.mov -an -c:v libx264 -preset slow -crf 26 \
       -pix_fmt yuv420p -movflags +faststart -g 120 <out>.mp4
```

## Files

| File | Does |
|---|---|
| `obs.mjs` | obs-websocket v5 client (also a CLI: `node obs.mjs GetRecordStatus`) |
| `cdp.mjs` | Chrome DevTools client — page resets and reading element positions |
| `cursor.ps1` | Moves the **real** OS cursor on a cubic ease at ~120Hz, and clicks |
| `takes.mjs` | Per-take orchestration: prepare → roll → drive → stop → name |
| `attach-thread.mjs` | Points the seeded Q&A thread at the student id the camera holds |
| `resolve-assemble.py` | One trimmable timeline per clip, rendered at 1280x800 |
| `resolve-showcase.py` | The five-beat hero cut |
| `resolve-render.py` | Renders whatever is already queued |

## Things that will cost you an hour

- **Cursor motion**: the pointer is driven by script on an ease, not faked in
  post. That is what gives it the produced look without lying about the product.
- **Targets come from the DOM** at shoot time, never hardcoded pixels.
- **The guide auto-scrolls to the newest card** — reset
  `document.querySelector(".scroll-area").scrollTop = 0` before a scroll take.
  The page does not scroll; an inner `.scroll-area` does.
- **The Q&A tab renders empty** unless the thread is re-pointed at the current
  student id; every navigation re-joins and is issued a new one.
- **Resolve timelines start at 01:00:00:00.** Never pass `recordFrame: 0` — the
  clip lands before the start, the build returns success, the render reports
  Complete, and the file is one frame. Use `CreateEmptyTimeline` +
  `AppendToTimeline`, and check the output size afterwards. Both scripts do.
- `SaveProject()` is on the **ProjectManager**, not the Project.
- Chrome suspends video in an occluded window, so a check that reports
  `paused: true` may just mean the window is behind another one.
