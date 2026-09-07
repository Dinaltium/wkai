"""Cut the hero showcase: one timeline, five beats, in the order a workshop happens.

Built as separate timeline items rather than a flattened export, so the beats
stay trimmable — the hero is the clip most likely to want re-timing later.
"""
import os
import sys
import time

RES_API = r"C:/ProgramData/Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting"
os.environ["RESOLVE_SCRIPT_API"] = RES_API
os.environ["RESOLVE_SCRIPT_LIB"] = r"C:/Program Files/Blackmagic Design/DaVinci Resolve/fusionscript.dll"
sys.path.append(os.path.join(RES_API, "Modules"))

import DaVinciResolveScript as dvr  # noqa: E402

RENDER_DIR = r"C:/Users/RAFAN AHAMAD SHEIK/Videos/OBS/wkai-renders"
TIMELINE = "wkai-showcase-master"

# (clip, in_seconds, out_seconds) — the story: get in, watch the guide build,
# ask something, collect the files, take the check.
BEATS = [
    ("join.mp4", 4.6, 12.9),
    ("guide.mp4", 2.8, 9.0),
    ("qa.mp4", 6.2, 13.2),
    ("files.mp4", 2.6, 7.8),
    ("quiz.mp4", 6.4, 12.6),
]

resolve = dvr.scriptapp("Resolve")
pm = resolve.GetProjectManager()
project = pm.GetCurrentProject()
if project.GetName() != "WKAI Landing Demos":
    project = pm.LoadProject("WKAI Landing Demos")
print("project:", project.GetName())

media_pool = project.GetMediaPool()
clips = {c.GetName(): c for c in media_pool.GetRootFolder().GetClipList()}

for i in range(1, int(project.GetTimelineCount()) + 1):
    tl = project.GetTimelineByIndex(i)
    if tl.GetName() == TIMELINE:
        media_pool.DeleteTimelines([tl])
        break

# No recordFrame. A Resolve timeline starts at 01:00:00:00 (216000 frames at
# 60fps), so clips placed at record frame 0 land BEFORE the timeline start:
# the build reports success, the render reports Complete, and the file is a
# single frame. Appending lets Resolve place each beat end to end itself.
clip_infos = []
for name, t_in, t_out in BEATS:
    clip = clips[name]
    fps = float(clip.GetClipProperty("FPS"))
    start = int(round(t_in * fps))
    end = int(round(t_out * fps))
    clip_infos.append({"mediaPoolItem": clip, "startFrame": start, "endFrame": end})
    print(f"  {name}: {start}-{end} ({(end - start) / fps:.1f}s)")

timeline = media_pool.CreateEmptyTimeline(TIMELINE)
if not timeline:
    raise SystemExit("showcase timeline build failed")
project.SetCurrentTimeline(timeline)
if not media_pool.AppendToTimeline(clip_infos):
    raise SystemExit("append failed")

project.SetCurrentTimeline(timeline)
items = timeline.GetItemListInTrack("video", 1)
total = sum(int(i.GetDuration()) for i in items)
print(f"showcase: {len(items)} items, {total} frames ({total / 60:.1f}s)")

project.DeleteAllRenderJobs()
project.SetRenderSettings({
    "SelectAllFrames": True,
    "TargetDir": RENDER_DIR,
    "CustomName": TIMELINE,
    "FormatWidth": 1280,
    "FormatHeight": 800,
    "ExportVideo": True,
    "ExportAudio": False,
})
project.AddRenderJob()
pm.SaveProject()

project.StartRendering()
while project.IsRenderingInProgress():
    time.sleep(2)

out = os.path.join(RENDER_DIR, TIMELINE + ".mov")
size = os.path.getsize(out) if os.path.exists(out) else 0
print(f"rendered {out} ({size} bytes)")
if size < 200_000:
    raise SystemExit("render looks collapsed — check timeline placement")
