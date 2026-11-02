# Performance measurements

The [comprehensive infinite-world report](performance/INFINITE_WORLD_PERFORMANCE_REPORT.md)
contains the November 1 active-gameplay investigation, including the completed
60-minute keyboard exploration run, repeated scene comparisons, retention tests
and engine assessment. Use the [profiling guide](performance/README.md) to reproduce
those measurements. The focused measurements below retain their original methods
and limitations; frozen diagnostic routes are not active-play stress tests.

These measurements are local observations, not guarantees for other hardware. Run `npm run benchmark` for seeded 150×150 generation and `node scripts/profile-browser.mjs` against a running production preview for browser cadence and regeneration heap. The browser script uses Chrome's debugging protocol and requires an installed Google Chrome.

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
