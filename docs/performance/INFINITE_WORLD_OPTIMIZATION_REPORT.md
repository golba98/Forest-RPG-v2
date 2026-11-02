# Infinite-world streaming optimization

Date: 1 November 2026. Local branch: `perf/infinite-world-streaming`.
No commit, push, merge or deployment was performed.

## Result

Exploration is measurably smoother under the matched conditions below. In the
10-minute route, major transition-associated intervals fell **24 → 1 (95.8%)**,
and skipped fixed-update opportunities fell **36 → 0**. Mean simulation-window
installation fell **13.68 → 2.65 ms (80.6%)**. Urgent terrain misses remained zero.
Across all three short optimized repetitions there were no major transition
intervals, versus 21 in the baseline repetitions.

The strict zero-hitch target is **not fully met**. One optimized first-render
activation took 64.3 ms; another 42.5 ms long-run interval and a 103.7 ms short-run
interval are unattributed. Overall worst-frame values therefore did not improve
in every repetition. The main reconstruction/installation bottleneck is greatly
reduced, but this is not a claim that every remaining hitch is fixed.

## Scope and reproducibility

This implementation targets the main-thread window reconstruction and installation
identified in the [profiling investigation](INFINITE_WORLD_PERFORMANCE_REPORT.md).
The procedural generator, generation version 13, Forest biome, save schemas,
artwork, Pixi renderer and game-loop frame cap are unchanged.

The earlier hour-long run (99 major intervals, 400 transitions, 186 skipped fixed
updates) is historical context. It is **not** compared directly with a shorter
optimized run. A fresh frozen baseline and optimized build use the same harness,
route, duration and settings. The agreed measurement budget is three 90-second
runs plus one 10-minute run per build: 29 measured minutes total. Separate smoke
checks, video capture and regression suites do not enter these tables.

| Condition        | Both builds                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| CPU / RAM        | Intel Core i7-13700, 24 logical processors / 32 GiB                                                              |
| GPU / driver     | NVIDIA RTX 4080 / 615.78.08; hardware ANGLE/OpenGL verified in-game                                              |
| OS               | Fedora 44, Linux 7.2.13-200.fc44.x86_64                                                                          |
| Browser          | Headful Chromium 156.0.8078.4; fresh disk-backed profile for each run                                            |
| Build            | Vite production profiling build; Node 22.23.1, TypeScript 5.9.3, Pixi 8.22.0                                     |
| Display          | Physical 2560×1440 at approximately 240 Hz; logical display scale 4/3                                            |
| View             | CSS 1920×1080, DPR 1, effective framebuffer 1920×1080, zoom 2                                                    |
| Cap / generation | Existing 60 FPS cap; seed 42, generator 13, Forest only                                                          |
| Route            | Actual keyboard movement; saved route SHA-256 `17a4e750d3de865a85fd61612d57e7d93f1070620fbfe7cfaa9007ee08e49f93` |
| Weather / health | Natural weather starting at daylight ratio 0.3; stress-only death prevention enabled on both builds              |
| Collection       | Same bounded profiler and resource checkpoints every 30 seconds; GPU timer queries disabled on both              |
| Isolation        | No builds, test suites, tracing or other game benchmark ran alongside timed collection                           |

Both builds originate from commit `a5cd38b6b78d05782346ea2a7d3ab7f0c3b381d1`
with the inherited working changes. Their manifests, source maps and complete
builds are preserved under `artifacts/optimization/`. All 140 public asset hashes
match. The baseline includes reason-specific wait counters, before optimization.
After measurement, two trailing spaces in `SurfaceMoisture.ts` were removed;
no executable code changed. Frozen hashes refer to the measured source. The
ordinary production build was verified again after that whitespace cleanup.

| Fingerprint             | Baseline                                                           | Optimized                                                          |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Source manifest SHA-256 | `ffe3502f2b948bee001d4914a796dad45a588d7920218851082f1c521a28f64f` | `57b326d5afe06be3799238a5a43a6db2ac054f8600c35a8673b62d7a44c34586` |
| Build SHA-256           | `233277b6603e46ac24eb76312ab40deb32e5f900c0179bbbd6c4192f9eae1caf` | `3a1b55c1560c7f08433d270a6735c4d6357e4c244d5f70dffc15f46f89c51f87` |

## Frame pacing and simulation continuity

All intervals below are milliseconds. No outliers were discarded. Actual
collection durations were 90.022–90.033 seconds for optimized short runs and
600.029 seconds for the optimized long run; baseline was 90.024–90.030 and
600.035 seconds respectively, including collector finalization. Frame samples
come from raw application intervals, not the duration of that finalization.

| Route / build     |    FPS |   Mean | Median |  p95 |  p99 | Worst | 1% low FPS | >16.67 ms | >33.33 ms | Transition-associated >33.33 |
| ----------------- | -----: | -----: | -----: | ---: | ---: | ----: | ---------: | --------: | --------: | ---------------------------: |
| Short 0 baseline  | 59.824 | 16.716 |   16.7 | 17.4 | 17.6 |  89.8 |      41.39 |     2,708 |        10 |                            9 |
| Short 0 optimized | 59.985 | 16.671 |   16.6 | 17.4 | 17.6 |  29.0 |      52.50 |     2,680 |         0 |                            0 |
| Short 1 baseline  | 59.885 | 16.699 |   16.6 | 17.4 | 17.6 |  47.7 |      45.50 |     2,670 |         6 |                            6 |
| Short 1 optimized | 59.980 | 16.672 |   16.6 | 17.4 | 17.6 |  26.6 |      53.47 |     2,659 |         0 |                            0 |
| Short 2 baseline  | 59.851 | 16.708 |   16.6 | 17.4 | 17.6 |  53.8 |      45.29 |     2,690 |         6 |                            6 |
| Short 2 optimized | 59.907 | 16.693 |   16.7 | 17.4 | 17.6 | 103.7 |      47.05 |     2,727 |         1 |                            0 |
| 10 min baseline   | 59.917 | 16.690 |   16.7 | 17.4 | 17.6 |  47.3 |      48.88 |    18,414 |        24 |                           24 |
| 10 min optimized  | 59.984 | 16.671 |   16.7 | 17.4 | 17.6 |  64.3 |      53.55 |    18,268 |         2 |                            1 |

The common median/p95/p99 reflect the cap and normal cadence. The improvement is
in rare transition hitches and the slowest 1%, not a large average-FPS gain.
Counting intervals just above 16.67 ms is sensitive to cadence/timer jitter and
must not be mistaken for equivalent CPU overruns.

| Continuity / build                            | Short 0 | Short 1 | Short 2 | 10 min |
| --------------------------------------------- | ------: | ------: | ------: | -----: |
| Baseline transitions                          |      15 |      15 |      15 |     76 |
| Optimized transitions                         |      15 |      15 |      15 |     77 |
| Baseline skipped fixed updates: installation  |       4 |       7 |       9 |     36 |
| Optimized skipped fixed updates: installation |       0 |       0 |       0 |      0 |
| Baseline / optimized preparation-edge waits   |   0 / 0 |   0 / 0 |   0 / 0 |  0 / 0 |
| Baseline / optimized persistence-edge waits   |   0 / 0 |   0 / 0 |   0 / 0 |  0 / 0 |
| Baseline / optimized stream-error-edge waits  |   0 / 0 |   0 / 0 |   0 / 0 |  0 / 0 |
| Baseline / optimized urgent terrain misses    |   0 / 0 |   0 / 0 |   0 / 0 |  0 / 0 |

The long routes reached the same waypoint index 598: 3,660.52 tiles baseline and
3,663.90 optimized, ending near `(1264,-1137)` and `(1266,-1139)`. Small movement
and encounter timing differences can change the final window; identical input
waypoints and wall duration do not promise identical frame-by-frame actor state.
All eight measured runs completed, with no console/page/route/stream errors,
telemetry drops or interval coverage gaps. End checkpoints report no game-loop
dropped frames. Safety guards were retained and exercised by delayed/failed-save
tests; simulation was not silently skipped to obtain these results.

## Main-thread and chunk costs

These are matched **10-minute** results. CPU columns are elapsed scoped work;
explicitly labelled wall durations include asynchronous waiting.

| Measurement                                                         | Baseline mean / p95 / worst ms | Optimized mean / p95 / worst ms |
| ------------------------------------------------------------------- | -----------------------------: | ------------------------------: |
| Window assembly: synchronous baseline; optimized synchronous prefix |             7.59 / 11.5 / 14.8 |                1.30 / 2.0 / 2.8 |
| Candidate assembly wall duration                                    |              Synchronous above |                1.30 / 2.0 / 2.8 |
| Surface index synchronous constructor                               |             8.53 / 14.0 / 15.1 |    Prepared before installation |
| Surface index preparation wall duration                             |              Synchronous above |              6.42 / 11.2 / 14.0 |
| All cooperative slices, each task                                   |                 Not applicable |                1.32 / 2.0 / 2.7 |
| Moisture restoration                                                |               4.34 / 6.8 / 8.5 |                1.40 / 3.5 / 3.8 |
| Simulation installation, inclusive                                  |            13.68 / 18.9 / 19.8 |                2.65 / 4.6 / 6.1 |
| State capture, per call                                             |               3.11 / 7.2 / 9.8 |                2.44 / 5.6 / 9.3 |
| Checkpoint durable wall duration                                    |               3.15 / 4.8 / 6.5 |              8.24 / 15.9 / 21.5 |
| Request through safely rendered window, wall duration               |         153.42 / 252.3 / 348.2 |          139.08 / 226.0 / 256.4 |
| Worker baseline execution                                           |             9.37 / 19.0 / 43.6 |              9.05 / 18.9 / 40.0 |
| Worker queue wait                                                   |          66.28 / 164.1 / 296.3 |           61.64 / 148.4 / 205.9 |
| Worker round trip                                                   |             9.62 / 19.7 / 43.9 |              9.28 / 19.1 / 40.4 |
| Window prune                                                        |              0.054 / 0.2 / 0.3 |               0.084 / 0.2 / 0.2 |

Optimized assembly completed within its first slice on this route; the API still
supports yielding for larger workloads. There were 399 measured preparation
slices, totaling 527.4 ms across assembly and both derived indexes. This aggregate
does not isolate each index's CPU cost. Surface preparation wall time is not
equivalent to its blocking CPU time.

Capture now occurs both before preparation and at publication: 174 calls and
425.2 ms total, versus 96 calls and 299.0 ms baseline. That extra correctness work
remains an optimization opportunity. The longer checkpoint wall duration occurs
while the active simulation continues; it is not an installation pause.

Worker output was unchanged. It completed 871 / 873 jobs (1.452 / 1.455 per
second), including 236 / 238 observed regenerations after eviction, and saw the
same 635 distinct generated addresses. Both arms peaked at 22 pending requests
and 87 resident baselines at dispatch, with 3,993 / 4,055 cache hits. Small worker
timing differences are run variability, not evidence of a faster generator.

Mean tick elapsed time fell 1.433 → 1.173 ms; p95 fell 2.4 → 2.0 ms. Cumulative
CDP main-thread `ThreadTime` increased by 69.27 → 57.22 seconds over the respective
runs, about 17.4% less CPU time (11.55% → 9.54% of one core). Tick timing excludes
out-of-tick preparation; the CDP counter covers it. Measured WebGL draw calls
remained effectively identical: 53.659 → 53.655 per rendered frame, p95 62 and
worst 67 on both. This change reduced synchronous work, not scene complexity.

## Memory and resource residency

Matched 10-minute measurements; MiB means 1,048,576 bytes.

| Measurement                                          |            Baseline |           Optimized |
| ---------------------------------------------------- | ------------------: | ------------------: |
| Main heap, before collection after GC                |           13.65 MiB |           13.64 MiB |
| Natural main heap, sampled range                     |     15.45–44.24 MiB |     14.71–46.66 MiB |
| Main heap, post-run GC                               |           17.44 MiB |           17.54 MiB |
| Generation-worker heap, post-run GC                  |            3.24 MiB |            3.24 MiB |
| Data chunks, periodic range / dispatch peak          |          64–72 / 87 |          64–72 / 87 |
| Retained delta chunks, periodic range                |                  64 |                  64 |
| Terrain texture targets, periodic range              |            8–22 MiB |            8–23 MiB |
| Referenced source texture estimate, periodic maximum |           30.49 MiB |           31.95 MiB |
| Sprite count, periodic range                         |             224–436 |             224–443 |
| Active entities, periodic range                      |               24–39 |               24–39 |
| Terrain texture evictions during measurement         |                 721 |                 722 |
| Browser-family PSS, first / maximum sample           | 634.48 / 793.57 MiB | 639.44 / 796.49 MiB |
| Browser-family PSS, post-run GC                      |          690.52 MiB |          712.24 MiB |

The candidate and its derived indexes add a bounded temporary working set.
Source/index ownership uses weak caches, one candidate and one pending automatic
checkpoint. Resource counts and post-GC JS heaps are comparable despite continued
travel and hundreds of evictions. The short-run post-GC heaps were 15.14–15.46
MiB baseline and 15.70–16.16 MiB optimized; warming/scene variation is visible.

**Native/process memory did not demonstrate a flat plateau.** PSS increased in
both arms; optimized post-GC PSS was 21.72 MiB higher. The extra final window,
textures, browser/native allocation and warming are possible contributors, not
proven explanations. This is not evidence of a confirmed new leak, nor proof of
stable native memory over an hour. The earlier investigation's native-retention
question remains open. Texture estimates must not be summed into precise VRAM.

## Architecture and correctness

The previous transition awaited its checkpoint while holding the installation
guard, reconstructed the complete local tile window, then built surface and
collision indexes synchronously. The worker was already preparing baseline
terrain successfully; replacing that generator would miss this bottleneck.

Ordinary transitions now follow these steps:

1. Prepare the next chunk set while the current world continues simulating.
2. Assemble an owned candidate in cooperative tasks targeting 2 ms each. Copy
   unchanged overlap by typed-array rows; reconstruct entering chunks from their
   deterministic baselines, legacy overrides and saved edits. Neither the active
   origin nor its buffers change during preparation.
3. Prepare target surface eligibility and prop collider indexes in cooperative
   tasks. Bridge approach protection is indexed once rather than repeatedly
   testing every approach for every eligible tile. Eligibility and puddle
   descriptors match golden fixtures captured from the preoptimization build.
4. Validate the active world, props, requested window size, teleport version and
   session epoch. Edits or a changed view cancel and retry obsolete preparation.
5. Publish in one synchronous operation between simulation calls: capture the
   latest state, queue its immutable checkpoint, copy live overlap/discovery,
   commit the origin, rebase actors and install the prepared indexes. Retained
   actors keep their live object identity and current combat state. No storage
   await occurs inside the installation guard.
6. Prune only after that checkpoint becomes durable. At most one automatic
   checkpoint is pending. A failure retains modifications, blocks another shift
   and preserves the edge safety guard. A successful explicit save can recover.

This is not a completely incremental global index. Surface hashes intentionally
retain established local-coordinate behavior, so target indexes still rebuild
in slices. Buffers are owned copies, not aliased mutable views. Initial loading,
explicit distant teleportation and save restoration retain synchronous setup.
The 2 ms slice target is cooperative: an individual iterator step or browser
descheduling can exceed it.

Moisture restoration groups work by data chunk and memoizes repeated integration
inputs with a bounded 4,096-entry per-call cache. The weather integration math is
unchanged. Live overlapping Float32 wetness, puddles and update remainder carry
over without a save-byte round trip. Entering terrain uses existing restoration.
Rendering texture identities, minimap discovery and coordinate limits remain as
documented in [world generation](../world-generation.md).

## Regression validation

| Check                                          | Result                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| TypeScript                                     | Passed                                                                       |
| ESLint                                         | Passed, zero errors; five inherited non-null assertion warnings              |
| Vitest unit/integration suite                  | 829 passed in 82 files, including eight new transition regressions           |
| Profiling tests after Node import guard repair | 7 passed                                                                     |
| Node statistics tests                          | 4 passed                                                                     |
| Production and profiling builds                | Passed; profiling tokens absent from ordinary production output              |
| Full Playwright, Chromium and Firefox          | 402 passed, 32 skipped, 4 failed; 438 discovered, 19.7 minutes               |
| Frozen-baseline failure controls               | 4 passed, 2 failed: the same tree collision assertion fails in both browsers |
| Optimized isolated Firefox controls            | Both visual tests passed in profiling and ordinary production builds         |

The full suite is **not all green**. `gameplay-repair.spec.ts:123` reports overlap
against its fixed tree rectangle on both builds/browsers. Firefox additionally
failed `encounters.spec.ts:287` (still emerging at a fixed timestamp) and
`visual-rendering.spec.ts:265` (pixel-opacity difference zero) in the full run.
Both passed in isolation on the baseline and optimized build. These are
timing-sensitive failures with no demonstrated streaming regression; they remain
documented rather than weakening assertions or changing unrelated gameplay.

Passing browser coverage includes continuous movement, bridges and raised-bank
landings, hills, combat/encounters, weather/moisture, portals, minimap/resize,
finite-save conversion, signed distant coordinates, persistence, and eviction
with return visits. Eight new tests additionally cover exact preoptimization
surface fixtures, cancellation, owned negative-coordinate staging, delayed and
failed checkpoint safety, edits/live enemy state during preparation, nonaligned
moisture indexing and sub-byte moisture continuity.

The only auxiliary repair was guarding `import.meta.env` when the profiling
module is imported by Node during Playwright discovery. It retains Vite's
compile-time elimination of normal-build instrumentation; it changes no world
output or gameplay. Browser checks confirmed ordinary saves and disabled
profiling behavior.

## Targets and remaining work

| Target                                                      | Result                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Zero major transition-associated intervals                  | **Not met:** 1 first-render spike, versus 24 baseline                                                 |
| Zero major reconstruction/installation-associated intervals | Met in all four optimized routes; baseline had 45 total                                               |
| Zero avoidable skipped fixed updates                        | Met on the measured routes: all wait-reason counters zero                                             |
| Zero urgent terrain preparation misses                      | Met in both arms                                                                                      |
| Approximately 60 FPS under reference conditions             | Met on average; occasional outliers mean perfect pacing is not established                            |
| Determinism/persistence compatibility regressions           | No regression found in the passing unit and browser coverage; full-suite failures disclosed above     |
| Bounded active caches/queue                                 | Met on these routes: dispatch peaks 87 baselines / 22 pending requests; texture targets within 64 MiB |
| No progressive native-memory growth                         | Inconclusive; PSS rose in both arms                                                                   |

Remaining work, in priority order:

1. **Profile renderer activation more narrowly.** In the optimized long run,
   the frame at page time 246,925.2 ms followed a 64.1 ms tick. Its previous
   `PixiRenderer.render` scope was 63.9 ms, including 59.3 ms self elapsed time;
   `WorldObjects.setWorld` was 2.1 ms and Pixi submission 1.1 ms. A 64 ms long
   task and `window.firstSafeFrame` overlap confirm transition association. The
   renderer's world-change block is at `src/rendering/PixiRenderer.ts:267`,
   including water/sky/effect rebasing. These scopes do **not** isolate the exact
   cause of the remaining self time; GC, descheduling and individual unwrapped
   operations cannot be distinguished here. Reproduce with the saved route and
   a targeted trace around that activation. Subsystem reuse/preparation could
   reduce this spike, but that benefit is a hypothesis. Profiling complexity is
   low; changing rendering preparation is medium/high complexity with visual and
   resource-lifetime regression risk. No speculative renderer repair was added.
2. **Reduce full state-capture scans if further CPU headroom is needed.**
   `InfiniteSession.capture` remains synchronous, now called before staging and
   at publication by `Simulation.advanceStream`. Its measured maximum was
   9.3 ms; aggregate capture work increased 299.0 → 425.2 ms. Dirty tile/object
   tracking and ownership-aware actor snapshots could reduce publication work
   and allocations. Expected benefit is hypothetical until benchmarked;
   complexity and persistence-regression risk are high. Retain immutable queued
   snapshots and failed-save recovery tests.
3. **Investigate unattributed cadence outliers without relabelling them.**
   The long-run 42.5 ms interval at page time 331,439.8 ms had no overlapping
   transition event or long task; adjacent tick elapsed times were 1.2 and
   2.7 ms. The short-run 103.7 ms interval likewise had no measured window work
   or long task. No specific CPU, GPU or browser cause is established. This is a
   targeted tracing/platform-control task, not evidence for a language rewrite.
4. **Repeat native-memory and lower-end hardware validation before release.**
   Use equal-region post-GC eviction cycles and longer production-build runs to
   resolve PSS retention. Test 1440p and laptop-class hardware separately. This
   has no gameplay regression risk and is a higher priority than an engine move.

Cooperative surface/prop indexes still do target-window work and allocate
metadata. Global-coordinate metadata reuse could reduce that remaining work,
but retaining existing surface hashes and collision rules makes it a larger,
higher-risk follow-up. The current evidence supports targeted TypeScript/Pixi
work; no native-engine performance advantage was measured in this milestone.

## Measurement definitions and limits

Frame intervals are wall time between rendered application ticks, including the
existing cap and time outside the tick. They are not CPU execution time or
physical display scanout. FPS is `1000 / mean interval`. The 1% low is
`1000 / mean(slowest ceil(frame count × 0.01) intervals)`. Percentiles use nearest
rank. Stage/event histograms have 0.1 ms bins. Inclusive stage times overlap;
do not add installation and its nested moisture restoration together.

Asynchronous `.wall` durations include yields and waiting. They are not blocking
main-thread CPU costs. `transition.slice` reports measured task spans;
`GameLoop.tick` elapsed time excludes preparation callbacks outside that tick.
CDP `ThreadTime` provides a separate cumulative main-thread CPU measurement.
A slow frame is classified as transition-associated when its interval overlaps
the recorded synchronous reconstruction, capture, installation, surface work or
preparation slices, pruning, checkpoints or first-render activation. The latter
uses the first-safe-frame span, not a claim that its entire duration is CPU work.
Temporal overlap is evidence of association, not proof that
a short overlapping task caused the entire delay.

Forced GC is requested before collection and after stopping it. The first
recorded application interval can still straddle the start marker; no such
interval is silently removed. Natural heap samples include garbage awaiting GC.
Resource checkpoints are periodic rather than continuous peaks. Process PSS
includes browser, renderer, GPU and supporting processes; it is neither JS heap
nor precise VRAM. GPU timer queries were off in both arms, so this comparison
cannot attribute unexplained pauses to the GPU.

This is a bounded 10-minute-per-build exploration verification, with repeated
short routes, rather than another hour-long campaign. It does not certify
long-term native-memory behavior, lower-end hardware, 120 FPS, or performance at
a 2560×1440 framebuffer. A high-end RTX 4080 result is not a production-readiness
claim. Cross-browser regression checks used actual Chromium and Firefox;
headline performance numbers here are Chromium only. Separate footage is visual
evidence, not a physical presentation-timing measurement.

## Changed files

These changes are relative to the inherited workspace, not a claim of ownership
of every dirty file shown by Git.

| Files                                                                                                              | Purpose                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/core/WorkSlice.ts`                                                                                            | Bounded cooperative task scheduling and cancellation                                                             |
| `src/world/infinite/InfiniteSession.ts`                                                                            | Candidate staging, row overlap, explicit target metadata/discovery, immutable checkpoint fields and safe pruning |
| `src/world/infinite/WindowOverlap.ts`                                                                              | Latest live tile/discovery reconciliation at publication                                                         |
| `src/world/infinite/ChunkMoisture.ts`                                                                              | Chunk-wise restoration and bounded integration memoization                                                       |
| `src/systems/SurfaceMoisture.ts`                                                                                   | Cooperative surface index, equivalent bridge protection, precise live overlap                                    |
| `src/systems/CollisionSystem.ts`                                                                                   | Shared synchronous/cooperative prop-index builder                                                                |
| `src/simulation/Simulation.ts`                                                                                     | Continuous preparation, atomic publication, cancellation, live actors and durability backpressure                |
| `src/types/simulation.ts`                                                                                          | Optional wait-reason diagnostics                                                                                 |
| `src/performance/install.ts`, `src/performance/FrameProfiler.ts`                                                   | Separate wait reasons/staging measurements; Node import guard                                                    |
| `tests/unit/world/infinite/transitions.test.ts`                                                                    | Eight behavioral regressions                                                                                     |
| `tests/fixtures/streaming-surface.ts`, `tests/fixtures/streaming-surface-reference.json`                           | Fixed bridge/surface fixtures and preoptimization golden hashes                                                  |
| `scripts/performance/capture-transition-reference.mjs`                                                             | One-off oracle extraction from frozen baseline source maps                                                       |
| `scripts/performance/optimize.mjs`, `scripts/performance/compare-streaming.mjs`, `scripts/performance/analyze.mjs` | Matched route runner, offline comparison, synchronous slice correlation                                          |
| `docs/world-generation.md`, `docs/performance/README.md`, this report                                              | Maintained architecture, reproduction and results                                                                |

## Evidence and reproduction

See the [profiling commands](README.md#matched-streaming-comparison). Serve each
frozen build on port 4180 in turn and run `optimize.mjs baseline` or `optimized`.
Run `compare-streaming.mjs` after both arms complete. There are no automatic long
reruns. Save the source/build manifests when testing another revision.

- [Baseline build manifest](../../artifacts/optimization/baseline/manifest.json)
  and [optimized manifest](../../artifacts/optimization/optimized/manifest.json).
- [Baseline progress](../../artifacts/optimization/baseline/progress.log) and
  [optimized progress](../../artifacts/optimization/optimized/progress.log).
- [Full browser results](../../artifacts/optimization/validation/browser-results.json),
  [baseline controls](../../artifacts/optimization/validation/baseline-control.json),
  [isolated optimized controls](../../artifacts/optimization/validation/optimized-control.json),
  [ordinary-build isolated controls](../../artifacts/optimization/validation/normal-control.json),
  and [unit results](../../artifacts/optimization/validation/unit-results.json).
- [Comparison data](../../artifacts/optimization/comparison.json),
  [baseline long summary](../../artifacts/optimization/baseline/long/summary.json)
  and [optimized long summary](../../artifacts/optimization/optimized/long/summary.json).
- [Baseline gameplay clip](../../artifacts/optimization/baseline/video/exploration.webm)
  and [optimized clip](../../artifacts/optimization/optimized/video/exploration.webm):
  separate 30-second routes, six window transitions each, captured at 1280×720
  and 25 FPS. Clips include boot/warmup and are excluded from headline timings.
  Both raw recordings survived an export-after-browser-close error and were
  remuxed without reencoding; their retained raw sources and logs are beside
  them. The final runner now closes the page, saves the artifact while its
  browser connection remains alive, then closes the context; a separate
  two-second recording verified that repair. No timed route was repeated for it.
- [Baseline end screenshot](../../artifacts/optimization/baseline/long/end.png)
  and [optimized end screenshot](../../artifacts/optimization/optimized/long/end.png).

Evidence is local and ignored by Git. Each measured run contains its scenario,
browser/environment metadata, compressed raw telemetry, checkpoints, summary,
post-GC checkpoint and end screenshot. No profiler traces were fabricated or
relabelled as optimized evidence.
