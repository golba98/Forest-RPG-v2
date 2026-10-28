# Performance measurements

These measurements are local observations, not guarantees for other hardware. Run `npm run benchmark` for seeded 150×150 generation and `node scripts/profile-browser.mjs` against a running production preview for browser cadence and regeneration heap. The browser script uses Chrome's debugging protocol and requires an installed Google Chrome.

One isolated generation run sampled 99 varying seeds: mean 30.36 ms, minimum 16.23 ms, maximum 113.96 ms and p99 113.96 ms. The results depend on machine load and seed selection.

A prior Chrome 156.0.8078.47 run on Linux, Intel i7-13700 and an NVIDIA RTX 4080 sampled 120 requestAnimationFrame intervals at each of 1920×1080, 2560×1440 and 3840×2160 with 63 living enemies. The p50/p95/p99 intervals were 16.7/16.7/16.8 ms at each resolution. This is observed display cadence at the 60 Hz cap, not CPU or GPU rendering time. It does not measure higher-refresh presentation.

In the same run, forced-GC JavaScript heap was 40,338,196 bytes before 20 regenerations, 41,638,712 bytes afterward, and peaked at 47,228,832 bytes across the sampled checkpoints. GPU memory is excluded and this short run does not prove the absence of a leak. Synthetic fixed-loop tests cover 60, 120, 144, 170 and 240 Hz input timing; they do not replace hardware profiling at those refresh rates.

A repeat after the flower-cutting build produced p50/p95/p99 requestAnimationFrame intervals of 16.7/16.8/16.8 ms at 1080p and 1440p, and 16.7/16.7/16.8 ms at 4K. After 20 regenerations the sampled JavaScript heap went from 40,357,536 to 40,855,824 bytes, with a sampled peak of 45,812,108 bytes. The same limitations apply; this run preceded the final HUD scaling adjustment.
