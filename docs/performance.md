# Performance measurements

These measurements are local observations, not guarantees for other hardware. Run `npm run benchmark` for seeded 150×150 generation and `node scripts/profile-browser.mjs` against a running production preview for browser cadence and regeneration heap. The browser script uses Chrome's debugging protocol and requires an installed Google Chrome.

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
