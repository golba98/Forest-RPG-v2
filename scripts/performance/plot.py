"""Render standalone figures from measured campaign outputs; no synthetic points."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path("artifacts/performance/campaign/D-stress-0")
points = json.loads((root / "checkpoints.json").read_text())
summary = json.loads((root / "summary.json").read_text())
minutes = [p["elapsedMs"] / 60000 for p in points]
fig, axes = plt.subplots(3, 1, figsize=(10, 9), constrained_layout=True)
# The completed run extends a few milliseconds into bucket 60. Do not draw that
# two-frame tail as though it were another full minute; raw summary retains it.
complete_minutes = [p for p in summary["minutes"] if (p["minute"] + 1) * 60000 <= summary["observedMs"]]
times = [p["minute"] + 0.5 for p in complete_minutes]
for name in ["mean", "p95", "p99"]:
    axes[0].plot(times, [p["frame"][name] for p in complete_minutes], label=name)
axes[0].axhline(16.67, linestyle="--", color="grey", label="60 FPS interval budget")
axes[0].set(ylabel="Game-tick interval (ms)", title="Active infinite exploration: measured minute summaries")
axes[0].legend(ncol=4)
mib = 1048576
axes[1].plot(minutes, [p["heap"]["usedSize"] / mib for p in points], label="Main heap, natural GC")
axes[1].plot(minutes, [sum(w["heap"]["usedSize"] for w in p.get("workers", [])) / mib for p in points], label="Generation-worker heap")
post_path = root / "post-gc.json"
if post_path.exists():
    post = json.loads(post_path.read_text())
    axes[1].scatter([minutes[-1]], [post["heap"]["usedSize"] / mib], marker="x", color="black", label="End: forced main GC")
axes[1].set(ylabel="JS heap (MiB)")
axes[1].legend(ncol=3)
axes[2].plot(minutes, [p["state"]["streaming"]["residentChunks"] for p in points], label="Resident data chunks")
axes[2].plot(minutes, [p["state"]["renderer"]["residency"]["resourceBytes"] / mib for p in points], label="Owned terrain textures (MiB)")
axes[2].set(xlabel="Actual elapsed time (minutes)", ylabel="Chunks / MiB")
axes[2].legend(ncol=2)
for ax in axes:
    ax.grid(alpha=0.2)
    ax.set_xlim(0, max(minutes))
destination = Path("docs/images/performance")
destination.mkdir(parents=True, exist_ok=True)
fig.savefig(destination / "infinite-exploration.svg")
fig.savefig(root / "infinite-exploration.png", dpi=160)
