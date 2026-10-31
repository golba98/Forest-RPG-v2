# Milestone 2 preservation fixtures

The four `v10-seed-*.json` files were captured from the untouched generation,
placement, and loading code at commit `58baaf85064efd55fce239e3f0e05ec35276c940`,
before the Milestone 2 refactor. Each contains the complete authoritative world
for level 1, normal difficulty, 150×150: tiles, props, structures, spawn plans,
encounter sites, and compatibility markers. Binary elevation, stairs, water,
and reservations are reconstructible from those records. Weather, simulation
animation, and browser timing are excluded.

`baseline.json` records the original world hashes, configuration hash, Node
version, and five serial timing samples. Capture used:

```sh
TMPDIR=/dev/shm node scripts/profile-landscape.mjs --capture-baseline
```

Capture writes exclusively and refuses to overwrite an existing fixture. These
are preservation evidence, not snapshots to refresh when a refactor fails.
Run the harness without capture for comparison; keep measurements separate
from parallel tests. Changing a fixture requires an intentional generator
change in a later milestone and an investigation of the differences.
