"""Render the queued jobs and report what landed on disk."""
import os, sys, time
RES_API = r"C:/ProgramData/Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting"
os.environ["RESOLVE_SCRIPT_API"] = RES_API
os.environ["RESOLVE_SCRIPT_LIB"] = r"C:/Program Files/Blackmagic Design/DaVinci Resolve/fusionscript.dll"
sys.path.append(os.path.join(RES_API, "Modules"))
import DaVinciResolveScript as dvr

RENDER_DIR = r"C:/Users/RAFAN AHAMAD SHEIK/Videos/OBS/wkai-renders"
resolve = dvr.scriptapp("Resolve")
pm = resolve.GetProjectManager()
project = pm.GetCurrentProject()
pm.SaveProject()
jobs = project.GetRenderJobList()
print("jobs queued:", len(jobs))
project.StartRendering()
while project.IsRenderingInProgress():
    time.sleep(2)
print("render complete")
for f in sorted(os.listdir(RENDER_DIR)):
    print(" ", f, os.path.getsize(os.path.join(RENDER_DIR, f)), "bytes")
