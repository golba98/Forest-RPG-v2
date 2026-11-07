# Performance measurements

The [comprehensive infinite-world report](performance/INFINITE_WORLD_PERFORMANCE_REPORT.md)
contains the November 1 active-gameplay investigation, including the completed
60-minute keyboard exploration run, repeated scene comparisons, retention tests
and engine assessment. Use the [profiling guide](performance/README.md) to reproduce
those measurements. The focused measurements below retain their original methods
and limitations; frozen diagnostic routes are not active-play stress tests.

These measurements are local observations, not guarantees for other hardware. Run `npm run benchmark` for seeded 150×150 generation and `node scripts/profile-browser.mjs` against a running production preview for browser cadence and regeneration heap. The browser script uses Chrome's debugging protocol and requires an installed Google Chrome.

## Nested terraces, 2026-11-03

The same seed-42 diagnostic route, 1280×720 production build and Chromium/ANGLE
configuration were used for generator 16. This is a shared Linux i7-13700/RTX 4080
workstation (Node 22.23.1); unrelated work was active, so the comparison cannot
isolate generator cost from host contention. Simulation is frozen and diagnostic
positioning moves the camera; keyboard exploration is validated separately.

| First 60 seconds                                    |       Prior hills v15 |          Terraces v16 |
| --------------------------------------------------- | --------------------: | --------------------: |
| RAF p95 / p99 / maximum                             | 16.8 / 16.8 / 50.0 ms | 16.7 / 16.8 / 83.3 ms |
| Post-GC JS heap, start → end                        |     15.73 → 18.17 MiB |     16.22 → 18.20 MiB |
| Generated / evicted / resident chunks               |         144 / 80 / 64 |         144 / 80 / 64 |
| Window transitions                                  |                    10 |                    10 |
| Generation request p50 / p95                        |        17.9 / 35.1 ms |       33.5 / 121.4 ms |
| Maximum generation request, including startup       |              152.6 ms |              421.0 ms |
| Maximum terrain preparation, including startup      |               27.0 ms |               92.8 ms |
| Owned terrain textures at end                       |                18 MiB |                18 MiB |
| Long tasks / urgent terrain misses / browser errors |             0 / 0 / 0 |             1 / 0 / 0 |

An initial v16 sample exposed synchronous terrace planning during adventure actor
publication: `baselineActors` called the generator for already-prepared cells.
Reading `ChunkSource`'s immutable baseline instead removed that duplicate work;
a regression test forbids generator queries during publication. Before this fix,
the first minute recorded eight long tasks and a 183.4 ms maximum frame interval;
afterward it recorded one long task and 83.3 ms. An occasional stall remains, and
worker generation is measurably more expensive than v15. Prefetch kept visible
terrain ready on this route; these figures are not a claim of universally smooth
60 FPS or an improvement in every latency measure.

Nearby relief sources loaded in 4.3–6.0 ms in the first minute. These include
fetch/decode on localhost, not separately measured GPU upload. Height arrays add
64 KiB for the 64 resident chunks and 36 KiB for the 192×192 gameplay window;
terrace plans retain at most 256 KiB of height arrays per generator. Heap readings
exclude total worker/GPU/driver allocations. Sources, staging and terrain textures
keep their existing independent retention limits.

The completed five-minute route reached approximately (1691, −340), crossing
forest and highland regions. It generated 550 chunks, evicted 486 and recorded
52 window transitions; all six residency samples held 64 data chunks. Post-GC JS
heap was 16.22 MiB initially, peaked at 20.53 MiB at four minutes and ended at
20.29 MiB. Terrain textures ended at 23 MiB within their 64 MiB budget. Each minute
reported p95 16.7–16.8 ms and p99 16.8 ms; after the first minute, sampled maximum
intervals were 16.8 ms. The entire run recorded one long task, no urgent terrain
misses and no browser errors. Quantiles use the profiler's rolling 3,600-frame
buffer, excluding its deliberate GC windows. This five-minute diagnostic sample
supplements, rather than replaces, extended active-play qualification.

Raw results live in `artifacts/terraces/profile/`; the diagnostic pre-fix sample
is retained in `artifacts/terraces/profile-before-fix/`. Reproduce with:

```sh
FOREST_BENCH_URL=http://localhost:4174 FOREST_PROFILE_MS=300000 FOREST_PROFILE_OUTPUT=artifacts/terraces/profile node scripts/profile-infinite-world.mjs
```

## Biome hills, 2026-11-03

Generator 15 was sampled after its unit/browser checks, using the same production
60-second route, seed 42, 1280×720, Chromium 156.0.8078.4, ANGLE/OpenGL and
Node 22.23.1 as the generator-14 comparison below. Hardware remains the shared
Linux i7-13700/RTX 4080 workstation. This freezes simulation and moves the camera
through diagnostic positioning; real keyboard collision is verified separately.

| Same 60-second route                                |          Previous v14 |             Hills v15 |
| --------------------------------------------------- | --------------------: | --------------------: |
| RAF p95 / p99 / maximum                             | 16.7 / 16.8 / 16.8 ms | 16.8 / 16.8 / 50.0 ms |
| Post-GC JS heap, start → end                        |     16.74 → 19.27 MiB |     15.73 → 18.17 MiB |
| Generated / evicted data chunks                     |              144 / 80 |              144 / 80 |
| Resident data chunks, start / end                   |               64 / 64 |               64 / 64 |
| Local-window transitions                            |                    10 |                    10 |
| Generation request p50 / p95                        |        14.1 / 28.3 ms |        17.9 / 35.1 ms |
| Maximum generation request, including startup       |              152.2 ms |              152.6 ms |
| Maximum terrain preparation, including startup      |               26.2 ms |               27.0 ms |
| Owned terrain textures at end                       |                18 MiB |                18 MiB |
| Long tasks / urgent terrain misses / browser errors |             0 / 0 / 0 |             0 / 0 / 0 |

Local landform sampling and four-sided slope planning increase worker request
cost. Prefetch kept the visible terrain ready on this route. The 50 ms maximum
frame interval remains a limitation; no matching long task or urgent terrain miss
was recorded, and this sample does not attribute GPU or host scheduling delays.
The lower heap sample does not establish a general memory improvement: object
composition differs. Total worker/GPU/driver memory is not included. The short
run does not replace the earlier extended streaming profile.

The additional hill atlas loaded in 2.6 ms; recorded environment-source loads
ranged from 2.2 to 5.5 ms on localhost. These `Assets.load` intervals include
fetch/decode but do not separate them or measure GPU upload. Raw results are in
`artifacts/biome-hills/profile/result.json`. Reproduce against a production preview:

```sh
FOREST_BENCH_URL=http://localhost:4174 FOREST_PROFILE_MS=60000 FOREST_PROFILE_OUTPUT=artifacts/biome-hills/profile node scripts/profile-infinite-world.mjs
```

## Five-biome infinite world, 2026-11-03

The comparison below uses the restored streaming generator 13 as its baseline,
then the final five-biome streaming generator 14. It does **not** compare a finite
150×150 map with a streamed map. The earlier finite-biome p95 of approximately
16.8 ms is historical context; its camera route and retained world differ.

Both 60-second samples use `scripts/profile-infinite-world.mjs`, seed 42,
1280×720, Chromium 156.0.8078.4, ANGLE/OpenGL, Node 22.23.1, Linux, an Intel
i7-13700 and NVIDIA RTX 4080. The final short profile ran after the test suites
finished. This remains a shared workstation, not an isolated hardware lab.
The diagnostic route advances at 5.625 tiles/s with simulation time frozen and
collision bypassed. Ordinary keyboard traversal is tested separately in both
browsers. Cadence is capped at 60 Hz; it is not GPU execution time.

| Same 60-second route                                | Restored forest baseline |      Five-biome final |
| --------------------------------------------------- | -----------------------: | --------------------: |
| RAF p95 / p99 / maximum                             |    16.7 / 16.8 / 16.8 ms | 16.7 / 16.8 / 16.8 ms |
| Post-GC JS heap, start → end                        |        10.30 → 13.25 MiB |     16.74 → 19.27 MiB |
| Generated / evicted data chunks                     |                 144 / 80 |              144 / 80 |
| Resident data chunks, start / end                   |                  64 / 64 |               64 / 64 |
| Local-window transitions                            |                       10 |                    10 |
| Maximum generation request, including startup       |                  77.5 ms |              152.2 ms |
| Maximum terrain preparation, including startup      |                  24.9 ms |               26.2 ms |
| Long tasks / urgent terrain misses / browser errors |                0 / 0 / 0 |             0 / 0 / 0 |

Final generation requests measured p50 14.1 ms and p95 28.3 ms over the latest
128 requests. These include backend/worker round trips, not pure worker CPU.
The richer biome fields increase retained heap and startup generation cost.
Source chunks are prefetched ahead of the camera; a generation request is not a
main-thread frame. Owned terrain textures ended at 18 MiB in both samples, with
a 64 MiB target. JS heap excludes total GPU/driver memory.

A separate final-build menu sample entered all five biomes in one world, then
sampled 180 stationary RAF intervals per biome after settling and forced GC:

| Biome           | Explore click → playable HUD | Stationary p95 / p99 | Resident props / visible objects |
| --------------- | ---------------------------: | -------------------: | -------------------------------: |
| Forest          |                     1,426 ms |       16.8 / 16.8 ms |                         148 / 77 |
| Meadow          |                     1,822 ms |       16.7 / 16.8 ms |                          69 / 34 |
| Rocky Highlands |                     1,373 ms |       16.8 / 16.8 ms |                         119 / 70 |
| Wetlands        |                     1,825 ms |       16.7 / 16.8 ms |                         111 / 62 |
| Autumn Woodland |                     1,322 ms |       16.8 / 16.8 ms |                         127 / 77 |

These are after-only Biome Walk samples without combat, not the adventure route
comparison. Entry includes destination generation, safe landing selection and
presentation preparation. The largest single terrain preparation during an
explicit biome jump was **205.9 ms**; gameplay is paused behind the loading screen
for those jumps. Ordinary adjacent chunks do not use that screen. Recorded lazy
asset `Assets.load` intervals were 1.9–3.8 ms on localhost; fetch/decode are not
separated and GPU upload is excluded. This is not a cold-network benchmark.
All five samples had ready terrain, zero urgent misses and no browser errors.
Object counts describe culling, not GPU draw calls. Raw measurements are in
`artifacts/infinite-biome-entry-profile.json` with the local capture script
`artifacts/profile-biome-entry.mjs`.

A separate **30-minute** generator-14 route produced 3,627 chunks, evicted 3,563,
and crossed 260 local-window boundaries. Every minute checkpoint held 64 data
chunks; the largest sampled owned terrain allocation was 28 MiB. Post-GC heap
was 17.44 → 19.29 MiB, with a 23.76 MiB peak. Minute-window p95 ranged from 16.7
to 16.8 ms, p99 stayed at or below 16.8 ms, and the maximum interval was **50 ms**.
There were no recorded long tasks, urgent terrain misses or browser errors.
Maximum generation round trip was 293.7 ms; maximum terrain preparation was
72.9 ms, including setup. Browser/unit tests were active during parts of this
soak, and the final distant-jump failure recovery fix came afterward. The final
60-second comparison above uses that fix. Neither run proves absence of every
leak or eliminates occasional stalls; the soak is a cache/streaming test, not
thirty minutes of collision-driven player input.

Remaining costs include Pixi terrain construction/upload, garbage collection,
initial worker/region preparation and shared-host scheduling. GPU draw calls and
total GPU memory were not instrumented. Do not infer uninterrupted 60 FPS on
weaker devices from a capped desktop cadence sample.

Raw results are in `artifacts/infinite-walk-baseline/`,
`artifacts/infinite-biomes-after/`, and `artifacts/infinite-biomes-extended/`.
Reproduce with a production preview on port 4176:

```sh
FOREST_BENCH_URL=http://localhost:4176 FOREST_PROFILE_MS=60000 FOREST_PROFILE_OUTPUT=artifacts/infinite-biomes-after node scripts/profile-infinite-world.mjs
```

Omit `FOREST_PROFILE_MS` for the thirty-minute route. The profiler stores at most
3,600 frame intervals and 2,000 long-task records, samples heap after forced GC,
and excludes the GC interval and following settling window from cadence.

## Five-biome environment, 2026-11-03

Baseline: commit `a5cd38b`. After: generator 13 working tree. Node 22.23.1,
Linux 7.2.13, Intel i7-13700, NVIDIA RTX 4080, Chrome 156.0.8078.79 with ANGLE/OpenGL.
Generation used one warmup and five serial samples per seed, without this
repository's tests running. Browser samples used the same machine and 60 Hz
presentation cap. A separate training workload occupied approximately 99% GPU
utilization during the after measurements. These are shared-host observations,
not an isolated hardware benchmark or a general speedup claim.

Median milliseconds, **before → after**:

| Seed | Generate 150×150 | Simulation load | Current save import |
| ---- | ---------------: | --------------: | ------------------: |
| 1    |  971.63 → 543.59 |    5.88 → 12.02 |       10.17 → 16.38 |
| 42   |  760.56 → 448.74 |     4.67 → 6.92 |        8.82 → 16.79 |
| 123  |  976.27 → 443.54 |     5.36 → 7.12 |        9.34 → 16.37 |
| 1337 |  370.81 → 420.11 |     5.17 → 6.39 |        9.75 → 15.42 |

The layouts intentionally differ. After worlds contain 2,603–2,801 props versus
1,284–1,834 before, mainly passable ecological details. Generation is faster on
three sampled seeds and slower on seed 1337. Saved environmental fields and extra
props increase load/import cost. The profiler's synthetic v9 conversion of a new
world is not a historical-save comparison; archived-save correctness is tested
separately. The varying-seed Vitest benchmark completed 10 timed samples: mean
537.37 ms, range 386.54–693.30 ms (wide ±17.63% relative margin).

With 62 living enemies, 120 RAF samples per resolution:

| Resolution | Before p95 | After p95 | After p99 |
| ---------- | ---------: | --------: | --------: |
| 1920×1080  |    16.7 ms |   16.7 ms |   16.8 ms |
| 2560×1440  |    16.8 ms |   16.7 ms |   16.8 ms |
| 3840×2160  |    16.8 ms |   16.7 ms |   16.8 ms |

The new camera stress scenario advances 600 frames along a 108-tile eastward arc,
faster than normal walking. Prefetch initially built an entering row together:
p95 33.3 ms, maximum 66.7 ms. Budgeted construction reduced p95 to 16.8 ms;
p99 remained 33.4 ms, maximum 50 ms, with 26 of 599 intervals over 33 ms.
There were **zero unavailable terrain frames and zero placeholder sprites**.
Resident chunks ranged from 30 to 56 rather than retaining all 100 map chunks.
The steady-view sample held 1,219 resident props and 59–74 visible scenery sprites.
Actual GPU draw calls were not instrumented; these are culling/workload counters.

Recent CPU chunk builds measured median 6.6 ms, p95 7.4 ms, maximum 7.9 ms.
The 4 ms scheduler budget cannot split a single build. Source fetch/decode intervals
peaked at 159.8 ms in this local-preview sample; GPU upload is excluded. Remaining
stalls can include construction, cache upload, garbage collection and host contention.
This does not establish smooth 60 FPS on weaker hardware or eliminate every hitch.

Forced-GC JavaScript heap over 20 random regenerations was **56.5 → 62.3 MB before**
and **31.5 → 39.7 MB after**, with an after peak of 42.7 MB. GPU memory is excluded,
the random worlds differ, and a short run does not establish absence of leaks.
The asset/residency caches are bounded; the simulation and save still hold the
entire finite map.

Raw JSON is retained locally under `artifacts/environment-before/`,
`artifacts/environment-after-generation.json`, and
`artifacts/environment-after-browser.json`. Reproduce using the profiler commands
below and `FOREST_BENCH_URL=http://127.0.0.1:4174 node scripts/profile-browser.mjs`
with a production preview on that port. Browser profile samples should run after
prefetch settles and without concurrent test suites.

## Earlier measurements

## World visibility and residency

The October 31, 2026 comparison uses seed 42, a production build, Chromium
156.0.8078.4 and ANGLE/OpenGL on an NVIDIA RTX 4080. Each viewport samples 180
requestAnimationFrame intervals after a forced-GC checkpoint. The pre-change
baseline is `a5cd38b`. Other work was active on this host; the figures are local
observations rather than an isolated hardware benchmark.

| Viewport  | p95 cadence, before → after | Post-GC JS heap, before → after | After: owned terrain textures |
| --------- | --------------------------- | ------------------------------- | ----------------------------- |
| 1280×720  | 16.7 → 16.7 ms              | 55.9 → 12.1 MiB                 | 12 MiB / 12 chunks            |
| 390×844   | 16.7 → 16.8 ms              | 56.5 → 12.2 MiB                 | 6 MiB / 6 chunks              |
| 1920×1080 | 16.7 → 16.7 ms              | 57.4 → 12.0 MiB                 | 9 MiB / 9 chunks              |

Mean main-thread task time across those intervals was 5.97 → 4.81 ms,
5.78 → 3.95 ms and 5.12 → 3.18 ms respectively. These CDP task measurements
include simulation, rendering and other page tasks. After-only instrumentation
measured p95 renderer CPU time of 5.5, 4.3 and 3.8 ms respectively; there is no
equivalent pre-change renderer-only measurement. Cadence at the 60 Hz cap does
not measure GPU execution time or establish higher-refresh performance.

The former renderer instantiated all 1,284 props and 344 forest-tree sprites
for seed 42. The 1280×720 spawn view now prepares 67 props and three forest
trees. These are residency counts, not changes to world population. The owned
terrain target is 64 MiB with a staging reserve; a mandatory working set larger
than that explicitly increases its budget. Shared source textures, decoded
images and driver memory are excluded from owned-texture accounting. Initial
preparation was synchronous and reached 127 ms on this shared host; this is not
the cost of an ordinary movement frame.

The complete 600-second camera route recorded p50/p95/p99 cadence of
16.7/16.8/33.4 ms, with a 116.7 ms maximum interval. Renderer CPU time was
1.4/2.8/4.0 ms at those percentiles, with a 19.6 ms maximum. Occasional long
presentation intervals remain on this shared host; these observations do not
establish their individual causes or promise uninterrupted 60 Hz presentation.
There were **zero urgent preparation misses**, 729 chunk evictions, and no
browser errors. The largest sampled owned-texture residency was 33 MiB, below
the 64 MiB target. All eleven post-GC checkpoints were between 13.1 and 15.6 MiB;
the profiler itself retains frame samples during the run. The authoritative
world hash was identical before and after the route.

Allocation sampling included objects subsequently collected by minor/major GC.
It estimated 218.7 GiB allocated over the route (approximately 373 MiB/s), not
retained memory. A separate short source-mapped probe attributed most sampled
activity to Pixi graphics construction/batching and existing water drawing;
the main renderer submits deferred graphics work for several layers. These
dynamic graphics still create substantial garbage and remain an optimization
limit. The bounded residency results are not a claim that all rendering
allocations have been removed. Sampling estimates and instrumented CPU times
should not be treated as precise allocation counts or uninstrumented timings.

Reproduce with a running production preview:

```sh
FOREST_BENCH_URL=http://localhost:4173 node scripts/profile-world-visibility.mjs
```

The default ten-minute route freezes simulation time and moves diagnostic player
positions at 180 world pixels/s, bypassing collision to visit terrain throughout
the map. Real keyboard movement, boosted speed, traversal, combat and saves are
checked separately. The profiler records post-GC checkpoints, sampled allocation
volume, frame/CPU percentiles, evictions and urgent misses. It excludes explicit
forced-GC intervals and the following frame from cadence samples. Results go to
ignored `artifacts/world-rendering-persistence/after/performance.json`; live
checkpoints and the capture script use the same evidence directory. See
[testing](testing.md) for capture commands and output overrides.

One isolated generation run sampled 99 varying seeds: mean 30.36 ms, minimum 16.23 ms, maximum 113.96 ms and p99 113.96 ms. The results depend on machine load and seed selection.

A prior Chrome 156.0.8078.47 run on Linux, Intel i7-13700 and an NVIDIA RTX 4080 sampled 120 requestAnimationFrame intervals at each of 1920×1080, 2560×1440 and 3840×2160 with 63 living enemies. The p50/p95/p99 intervals were 16.7/16.7/16.8 ms at each resolution. This is observed display cadence at the 60 Hz cap, not CPU or GPU rendering time. It does not measure higher-refresh presentation.

In the same run, forced-GC JavaScript heap was 40,338,196 bytes before 20 regenerations, 41,638,712 bytes afterward, and peaked at 47,228,832 bytes across the sampled checkpoints. GPU memory is excluded and this short run does not prove the absence of a leak. Synthetic fixed-loop tests cover 60, 120, 144, 170 and 240 Hz input timing; they do not replace hardware profiling at those refresh rates.

A repeat after the flower-cutting build produced p50/p95/p99 requestAnimationFrame intervals of 16.7/16.8/16.8 ms at 1080p and 1440p, and 16.7/16.7/16.8 ms at 4K. After 20 regenerations the sampled JavaScript heap went from 40,357,536 to 40,855,824 bytes, with a sampled peak of 45,812,108 bytes. The same limitations apply; this run preceded the final HUD scaling adjustment.

## Milestone 2 generation and loading comparison

The pre-change capture at `58baaf8` and the Milestone 2 working tree used Node
v22.23.1, the same Vite SSR harness, one generation warmup, and five serial
samples per seed with no browser or test processes running. Each sample generates
a level-1 normal 150×150 world, loads it into the simulation, imports a current
save, then imports its pre-hilltop v9 representation. The configuration hash and
all four authoritative world hashes matched exactly. Timings exclude rendering.

Median milliseconds, **before → after**:

| Seed | Generation      | Simulation load | Current save import | Legacy hilltop conversion/import |
| ---- | --------------- | --------------- | ------------------- | -------------------------------- |
| 1    | 784.13 → 689.15 | 7.39 → 5.82     | 9.37 → 9.12         | 124.56 → 116.09                  |
| 42   | 535.68 → 518.90 | 4.19 → 4.65     | 7.50 → 7.53         | 84.36 → 82.52                    |
| 123  | 759.17 → 709.62 | 5.48 → 5.32     | 8.78 → 8.34         | 135.63 → 126.65                  |
| 1337 | 231.26 → 220.02 | 4.88 → 4.87     | 7.63 → 7.81         | 76.79 → 76.24                    |

No median increase exceeded the investigation threshold of both 10% and 5 ms.
The largest load/import median increase was 0.47 ms; five samples do not establish a
general speedup. First-sample JIT/initialization effects remain visible in the
raw ranges. These measurements should not be compared with older generation
figures above, which predate the completed hilltop-object stage and use other
sampling methods.

The final landscape view scans stairs/protections once per loaded world;
component and summit maps are lazy and linear in map size when first queried.
Placement reuses the existing swept collision checks. Normal gameplay performs
no full-map planning rebuild each frame. Debug traces retain at most 256 entries
per consumer plus complete counters; required-access diagnostic replay runs
only on request. This does not measure GPU cost or maximum-map diagnostic heap.

Reproduce with `TMPDIR=/dev/shm node scripts/profile-landscape.mjs --output /tmp/landscape-after.json`.
The temp-directory override avoids the current environment's default-temp quota
error. Original samples are in `tests/fixtures/landscape/baseline.json`; the
historical comparisons remain in Git history. Save new measurements under ignored
`artifacts/` or another explicit output path.

## Infinite-world streaming

The November 1, 2026 measurements use Node v22.23.1 and a production build in
Chromium 156.0.8078.4 with ANGLE/OpenGL on the same shared Linux host. They are
observations on this machine, with other applications active.

The final serial generator benchmark includes terrain, scenery, bridge planning
and hilltop clearance, with varying chunk coordinates and warm generator caches:

| Data chunk | Samples |     Mean | p99 / maximum |
| ---------- | ------: | -------: | ------------: |
| 32×32      |      89 | 16.92 ms |      34.91 ms |
| 64×64      |      29 | 51.73 ms |      65.09 ms |

32 tiles was selected for the smaller preparation unit and lower latency, rather
than treating the larger chunk's fourfold area as equal work. Generation runs in
a module worker; browsers without workers use a row-yielding fallback. Camera
preparation and a separate retention margin hide worker latency during normal
movement. The figures are not main-thread frame costs or low-end device results.

A thirty-minute real-time camera route at 180 world pixels/s covered all eight
headings, positive/negative coordinates and 260 local-window transitions. It
generated 3,627 chunks and evicted 3,563. End residency was 64 data chunks;
minute checkpoints were 64 except one preparation sample at 72. All sampled
minute p95/p99 frame intervals were at most 16.8 ms. There were zero browser
errors and zero urgent terrain preparation misses. One 56 ms browser long task
was recorded; its individual cause was not attributed. This is not a promise of
uninterrupted 60 Hz presentation.

Excluding the initial checkpoint, post-GC JavaScript heap ranged from 13.8 to
18.8 MiB. Sampled owned terrain textures peaked at 28 MiB, under the 64 MiB
target. These figures exclude decoded images, shared textures, worker heap and
graphics-driver memory. Data, field, presentation and texture caches have explicit
bounds; persistent explored history lives in IndexedDB and grows with exploration.
The worker's worst observed request latency was 483.6 ms, including storage and
worker scheduling, rather than generation CPU alone. That latency was prepared
ahead of the visible view.

The extended run preceded the final viewport, movement-runtime and chest-reload
safeguards, grove clearing reservations, and a reduction of the main-thread field
cache to 2,048 entries (the worker retains 32,768). Final checks include recorded
real-keyboard routes in Chromium and Firefox, rather than relying on the
collision-bypassing camera profile to establish traversability. Those checks
cover cardinal/diagonal legs and repeated chunk crossings; the viewport suite
also covers phone/desktop sizes, zoom changes and ±1 billion tile positions.

A follow-up two-minute production probe with those safeguards and smaller main
field cache generated 232 chunks, evicted 168 and completed 21 transitions. It
ended at 64 resident chunks with p99 16.8 ms, no browser errors, no long tasks and
no urgent misses. Post-GC heap was 10.6/12.7/14.0 MiB at its three checkpoints;
owned terrain peaked at 18 MiB. This shorter probe preceded only the separate
larger-map centering adjustment; it used radar mode throughout. It confirms the
active streaming path after the safeguards, without replacing the extended run.
Its results are in `artifacts/infinite-world/final-probe/`.

Reproduce the serial benchmark and thirty-minute production profile:

```sh
npm run benchmark -- tests/benchmarks/infinite.bench.ts --maxWorkers=1
FOREST_BENCH_URL=http://localhost:4175 node scripts/profile-infinite-world.mjs
```

The profiler freezes simulation time and uses diagnostic movement. Forced-GC
intervals are excluded; a bounded 3,600-frame ring supplies each checkpoint's
percentiles. `FOREST_PROFILE_MS` and `FOREST_PROFILE_OUTPUT` override duration
and output. Evidence is in ignored `artifacts/infinite-world/`: `extended/`
contains the long profile and route screenshots, `evidence/` contains keyboard
videos and signed-coordinate captures, and `benchmark-final.json` contains the
chunk comparison. See [testing](testing.md#infinite-world-verification).
