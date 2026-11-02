# Reproducible infinite-world profiling

The [performance report](INFINITE_WORLD_PERFORMANCE_REPORT.md) contains measured results and their limits. This guide describes the optional collector and benchmark tools. They preserve terrain output, artwork, simulation rules and save formats.

## Build and serve

Use a production build with profiling explicitly compiled in:

```sh
npm run typecheck
npm run profile:build
npx vite preview --outDir artifacts/performance/profile-build --host localhost --port 4177 --strictPort
```

Open `http://localhost:4177/?debug=1&profile=1&autostart=1&seed=42`. Both the build flag `VITE_PERF_PROFILE=1` and URL switch are required. Normal `npm run build` removes the collector, endpoint, GL wrappers, route driver and worker timing protocol. A profiling build without `profile=1` does not install the adapter.

The diagnostics endpoint is `window.__PERF__`. Use `start(label)`, `stop()`, `snapshot()` and `resources()` for short manual investigations. `configure()` controls the existing game settings and optional GPU timing. Collection does not add an overlay to ordinary gameplay. `dispose()` restores wrapped methods and releases probe resources.

## Run a campaign

Prepare fixtures and collision-valid keyboard routes **before** measuring. Route planning is an offline tool and can be expensive; do not run it alongside a benchmark.

```sh
npm run profile:fixtures
npm run profile:routes
npm run profile:scenarios
FOREST_PERF_TAIL_TRACE=1 npm run profile:stress
node scripts/performance/lab.mjs
node scripts/performance/retention.mjs
node scripts/performance/reload.mjs
node scripts/performance/save.mjs
node scripts/performance/trace.mjs explore
node scripts/performance/trace.mjs rain --allocation
npm run profile:cold
npm run profile:platform
npm run profile:refresh
npm run profile:record
```

The scenario runner uses three repetitions for headline comparisons and one pass for supplemental seed, coordinate, resolution and effect controls. The scenario metadata records this choice; set `FOREST_PERF_REPEATS` to override all cases. It uses disk-backed isolated browser profiles and headful Chromium with hardware ANGLE/OpenGL, recording native window bounds and a blank-page rAF cadence. On this workstation the native window is pinned to logical position `(1960,40)` on the primary display; update `browser.mjs` for another display layout. Avoid overlapping windows or other GPU-heavy workloads when establishing hardware limits.

Useful overrides:

| Variable                  | Meaning                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `FOREST_PERF_OUTPUT`      | Evidence directory; use a new directory to preserve older runs              |
| `FOREST_PERF_FILTER`      | Scenario-name regular expression                                            |
| `FOREST_PERF_REPEATS`     | Override scenario repetitions; calibration defaults to 3                    |
| `FOREST_PERF_MS`          | Explicit shorter diagnostic duration; the run metadata records the override |
| `FOREST_PERF_BROWSER`     | `chromium` or `firefox` for scenario runs                                   |
| `FOREST_PERF_PROFILE_DIR` | Reuse an explicitly selected benchmark browser profile                      |
| `FOREST_HEADLESS`         | `1` for functional smoke checks; unsuitable for display-cadence conclusions |
| `FOREST_ROUTE_SEEDS`      | Comma-separated seeds for offline route preparation                         |
| `FOREST_ROUTE_TILES`      | Offline route length, default 30000                                         |
| `FOREST_PERF_CYCLES`      | Eviction-laboratory repetitions, default 20                                 |

Run one game benchmark at a time. Do not run builds, tests, route planning, heap snapshots or detailed tracing concurrently with headline measurements. The stress test follows actual keyboard movement for one wall-clock hour with active simulation and natural weather. Only that test prevents player death. Fast traversal uses the game's sprint/dash and speed potions; benchmark inventory provisioning is recorded. Ordinary combat retains damage, death, cooldowns and resource consumption.

The eviction laboratory deliberately freezes simulation and teleports between three separated regions. It is a controlled resource-retention and restoration experiment, not a substitute for active exploration. It checks a removed flower and an opened chest, saves and reloads through the existing API, and captures forced-GC main/worker heaps. Snapshot pauses must not be interpreted as ordinary gameplay frame times.

The native-retention follow-up uses the inherited production build on port 4176
for 60 eviction cycles and the profiling build for 20. It omits heap snapshots and
per-cycle world hashing, includes four warming cycles, and records three-minute
idle periods before and after cycling. Process anonymous/file/shared PSS fields
help separate JS/resource counts from native residency. This deliberately tests
whether a process-memory increase survives without the full profiler.

The keyboard driver records waypoint progress separately from distance moved. After 600 ms without approaching its target it temporarily tightens its steering tolerance to correct small bridge-centerline offsets. A 20-second target-progress watchdog aborts an invalid route; jump cycles and knockback cannot keep it alive, while a long straight segment may continue for as long as it keeps getting closer. Steering corrections and window-blur events are counted. This controller repair preserves ordinary movement, collision and generation behavior. Video capture runs separately and is excluded from headline timing.

## What the numbers mean

### Matched streaming comparison

`node scripts/performance/optimize.mjs baseline` and the corresponding `optimized`
arm each run three 90-second routes and one 10-minute route. Serve each frozen
profiling build on port 4180 in turn. Both use seed 42, the saved seed-42 keyboard
route, 1920×1080/DPR 1, zoom 2, the 60 FPS cap and natural weather starting at
daylight ratio 0.3. Death prevention is enabled on both arms. Forced GC runs
outside measurement. Do not run regression tests or builds concurrently.

`FOREST_OPT_VIDEO=1 node scripts/performance/optimize.mjs optimized` records a
separate 30-second evidence route. Video results are excluded from timing tables.
After both arms finish, `node scripts/performance/compare-streaming.mjs` rebuilds
their summaries and writes `artifacts/optimization/comparison.json`. The
[streaming optimization report](INFINITE_WORLD_OPTIMIZATION_REPORT.md) documents
results and limitations. These scripts use local ignored evidence, not a second
project checkout.

### Measurement definitions

- **Game frame interval:** wall time between starts of rendered game ticks, including configured frame limiting and any work or pauses between ticks. It approximates application presentation cadence; it is not a physical scanout or input-to-photon measurement.
- **Raw rAF interval:** browser animation callback timestamps before the game's frame limiter. This helps distinguish a cap from lost callbacks.
- **Tick CPU scope:** elapsed main-thread time inside `GameLoop.tick`, including nested instrumentation and GL submission. It excludes asynchronous rebase callbacks outside the tick. Elapsed timing can include thread descheduling; it is not OS thread CPU time.
- **Stages:** inclusive and self elapsed time. Self subtracts instrumented children, not every operation. Asynchronous hooks measure their synchronous prefix and separately report `.wall` until Promise completion. Never add nested inclusive times together.
- **Percentiles:** nearest-rank values from raw interval samples. Stage/event histograms have 0.1 ms bins. Histogram percentiles above 2000 ms are reported as `null` with an overflow count; exact worst values remain available.
- **1% low FPS:** `1000 / mean(slowest ceil(frameCount × 0.01) frame intervals)`. It is not `1000 / p99`.
- **Collision sampling:** exact invocation counters and time samples every 64 calls (some coarse operations every 16). Sampled collision stage percentiles are not total per-frame collision time. CPU profiles independently identify hot stacks. Their sampled wall intervals, especially unresolved `(program)` samples, are not OS thread CPU time; compare CDP `ThreadTime` and trace tasks before attributing cost.
- **GPU:** asynchronous `EXT_disjoint_timer_query_webgl2` command-span elapsed time every 30 rendered frames, at most 16 outstanding queries, with disjoint samples discarded. It is not utilization, physical presentation time or precise GPU memory. Compare GPU-enabled and disabled controls.
- **Draw calls/binds/uploads:** actual wrapped WebGL calls, including offscreen terrain bakes. Terrain calls are counted separately. Sprite/batch counts are sampled from Pixi's GL batch adaptor on the GPU-sampled frames; divide totals by `sampled.gpu.frames`, not by every game frame. Scene sprites and submitted sprites are different quantities.
- **Texture bytes:** terrain targets have explicit ownership accounting. The resource census also estimates referenced and TextureStore-owned sources as base RGBA8 dimensions. These estimates exclude mipmaps, driver allocations, compressed formats, filter pools and some global asset-cache textures. They are not total VRAM measurements.
- **Worker phases:** queued wait, backend region establishment, worker construction/execution, delivery and end-to-end readiness are separate. Cross-context epoch stamps have timer-resolution/clock-offset uncertainty; tiny negative one-way values mean below measurement resolution. Round-trip minus execution/construction is a more robust aggregate communication measure.
- **Memory:** CDP main and generation-worker heap values, process RSS/PSS and explicit cache/resource counts. Natural heap samples include garbage awaiting collection. Only controlled post-GC same-region comparisons can support retention claims; rising natural heap alone does not demonstrate a leak.

## Bounded collection and evidence

The browser uses fixed rings: 4096 game frames, 8192 rAF samples and 16384 events, with at most 256 stage IDs and 128 nested scopes. Numeric records transfer as binary batches over a tokenized loopback HTTP receiver once per second. At most two requests are in flight; failures, pressure and dropped samples are exposed. Node compresses JSONL to disk. Browser metadata serialization and encoding cost is measured explicitly. There is no growing in-page history.

Each run stores its scenario, checkpoints, environment, errors, compressed raw telemetry, summary and end screenshot under ignored `artifacts/performance/`. Detailed traces add `.cpuprofile`, allocation profiles and compressed Chrome traces. Open CPU profiles and traces in DevTools/Perfetto; source-mapped summaries point to the exact profiled build's source maps. Heap summaries report node counts and self sizes, not dominator retained sizes.

```sh
node scripts/performance/analyze.mjs artifacts/performance/campaign/A-idle-0
node scripts/performance/report-data.mjs
node scripts/performance/tables.mjs
node scripts/performance/build-id.mjs artifacts/performance/profile-build artifacts/performance/build-id.json
node --test scripts/performance/statistics.test.mjs
```

Overhead calibration additionally needs the saved uninstrumented production build served on port 4176. `profile:calibrate` rotates baseline, profiling-build-disabled and enabled runs over three repeats. All use the same seed, uncapped setting, zoom and short in-place keyboard square. Inspect CPU time per rendered frame and host/display variability; equal capped FPS alone does not prove negligible overhead.
