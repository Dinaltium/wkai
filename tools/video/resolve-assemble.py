"""Assemble the landing-page clips in DaVinci Resolve.

One timeline per clip, built from source in/out points so every edit stays a
real edit the instructor can trim by hand later — not a flattened export.

Frame maths follows the clip's own FPS as Resolve reports it, not ffprobe's:
the two disagree on variable-frame-rate sources, and a uniform 1.001 error
shows up as half a second of drift by the end of a take.
"""
import os
import sys
import time

RES_API = r"C:/ProgramData/Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting"
os.environ["RESOLVE_SCRIPT_API"] = RES_API
os.environ["RESOLVE_SCRIPT_LIB"] = r"C:/Program Files/Blackmagic Design/DaVinci Resolve/fusionscript.dll"
sys.path.append(os.path.join(RES_API, "Modules"))

import DaVinciResolveScript as dvr  # noqa: E402

TAKES_DIR = r"C:/Users/RAFAN AHAMAD SHEIK/Videos/OBS/wkai-takes"
RENDER_DIR = r"C:/Users/RAFAN AHAMAD SHEIK/Videos/OBS/wkai-renders"
PROJECT = "WKAI Landing Demos"

# name -> (in_seconds, out_seconds). Trimmed off the head/tail padding the
# recorder leaves, and cut before the action goes slack.
CLIPS = {
    "join": (3.6, 14.2),
    "guide": (0.8, 13.6),
    "qa": (1.0, 14.6),
    "files": (0.8, 11.9),
    "quiz": (1.0, 15.6),
}

resolve = dvr.scriptapp("Resolve")
if not resolve:
    raise SystemExit("Resolve is not reachable")

pm = resolve.GetProjectManager()

project = pm.GetCurrentProject()
if not project or project.GetName() != PROJECT:
    project = pm.LoadProject(PROJECT) or pm.CreateProject(PROJECT)
if not project:
    raise SystemExit(f"could not open or create {PROJECT}")
print("project:", project.GetName())

project.SetSetting("timelineResolutionWidth", "1600")
project.SetSetting("timelineResolutionHeight", "1000")
project.SetSetting("timelineFrameRate", "60")
project.SetSetting("videoMonitorFormat", "HD 1080p 60")

media_pool = project.GetMediaPool()
root = media_pool.GetRootFolder()
media_pool.SetCurrentFolder(root)

# Import anything not already in the pool, so re-runs do not duplicate clips.
existing = {c.GetName(): c for c in root.GetClipList()}
to_import = [
    f"{TAKES_DIR}/{name}.mp4" for name in CLIPS if f"{name}.mp4" not in existing
]
if to_import:
    media_pool.ImportMedia(to_import)
    existing = {c.GetName(): c for c in root.GetClipList()}
print("pool clips:", sorted(existing))

os.makedirs(RENDER_DIR, exist_ok=True)
project.DeleteAllRenderJobs()

for name, (t_in, t_out) in CLIPS.items():
    clip = existing.get(f"{name}.mp4")
    if not clip:
        print(f"!! {name}: not in media pool")
        continue

    # The clip's own FPS is the authority for seconds -> frames.
    fps = float(clip.GetClipProperty("FPS"))
    start_frame = int(round(t_in * fps))
    end_frame = int(round(t_out * fps))  # exclusive

    timeline_name = f"wkai-{name}"
    for i in range(1, int(project.GetTimelineCount()) + 1):
        tl = project.GetTimelineByIndex(i)
        if tl.GetName() == timeline_name:
            media_pool.DeleteTimelines([tl])
            break

    # Build empty, then append. Passing clips positionally invites the
    # recordFrame trap: a timeline starts at 01:00:00:00, so anything placed at
    # frame 0 lands BEFORE the start — the build returns success, the render
    # reports Complete, and the file is one frame long. Appending lets Resolve
    # place the clip itself.
    timeline = media_pool.CreateEmptyTimeline(timeline_name)
    if not timeline:
        print(f"!! {name}: timeline build failed")
        continue
    project.SetCurrentTimeline(timeline)
    if not media_pool.AppendToTimeline(
        [{"mediaPoolItem": clip, "startFrame": start_frame, "endFrame": end_frame}]
    ):
        print(f"!! {name}: append failed")
        continue

    project.SetCurrentTimeline(timeline)
    items = timeline.GetItemListInTrack("video", 1)
    dur = sum(int(i.GetDuration()) for i in items)
    print(f"{name}: {fps:g}fps  frames {start_frame}-{end_frame}  timeline {dur}f ({dur / fps:.1f}s)")

    project.SetRenderSettings({
        "SelectAllFrames": True,
        "TargetDir": RENDER_DIR,
        "CustomName": f"wkai-feature-{name}",
        "FormatWidth": 1280,
        "FormatHeight": 800,
        "ExportVideo": True,
        "ExportAudio": False,
    })
    job = project.AddRenderJob()
    print(f"  queued {job}")

pm.SaveProject()
print("rendering…")
project.StartRendering()
while project.IsRenderingInProgress():
    time.sleep(2)
print("render complete")

# Never trust the job status. Resolve reports Complete for a collapsed render,
# and rewrites the job's own mark range to match, so the metadata agrees with
# itself while the file is a stub. The file on disk is the only witness.
failed = []
for name in CLIPS:
    path = os.path.join(RENDER_DIR, f"wkai-feature-{name}.mov")
    size = os.path.getsize(path) if os.path.exists(path) else 0
    ok = size > 500_000
    print(f"  wkai-feature-{name}.mov {size} bytes {'ok' if ok else 'COLLAPSED'}")
    if not ok:
        failed.append(name)
if failed:
    raise SystemExit(f"renders collapsed: {', '.join(failed)} — check timeline placement")
