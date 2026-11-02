import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = process.env.FOREST_PERF_ROUTES ?? 'artifacts/performance/routes';
const length = Number(process.env.FOREST_ROUTE_TILES ?? 30000);
const seeds = (process.env.FOREST_ROUTE_SEEDS ?? '42').split(',').map(Number);
await mkdir(output, { recursive: true });
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { InfiniteSession, bindSession } = await server.ssrLoadModule(
    '/src/world/infinite/InfiniteSession.ts',
  );
  const { WorldRepository } = await server.ssrLoadModule('/src/persistence/WorldRepository.ts');
  const { Simulation } = await server.ssrLoadModule('/src/simulation/Simulation.ts');
  const { findPath } = await server.ssrLoadModule('/src/world/pathfinding.ts');
  const { canOccupy, hasClearPath } = await server.ssrLoadModule('/src/systems/CollisionSystem.ts');
  const { entityFootprint } = await server.ssrLoadModule('/src/systems/EntityFootprint.ts');
  class Memory extends WorldRepository {
    async establish() {}
    async readChunk() {
      return undefined;
    }
    async checkpoint() {}
  }
  for (const seed of seeds) {
    const session = new InfiniteSession(
      {
        id: 'route',
        seed,
        generatorVersion: 13,
        biomeVersion: 1,
        chunkSize: 32,
        level: 1,
        difficulty: 'normal',
      },
      new Memory({}),
    );
    await session.prepareAt(0.5, 0.5);
    const sim = new Simulation();
    sim.loadWorld(bindSession(session.buildWindow(), session));
    let cachedWorld, walk, edges;
    const plan = (gx, gy) => {
      const world = sim.world,
        w = world.meta.width,
        origin = session.origin,
        foot = entityFootprint(sim.player);
      if (cachedWorld !== world) {
        cachedWorld = world;
        walk = new Uint8Array(world.tiles.length);
        edges = new Map();
      }
      const pass = (x, y) => {
        const i = y * w + x;
        if (!walk[i]) walk[i] = canOccupy(world, x + 0.5, y + 0.5, foot) ? 2 : 1;
        return walk[i] === 2;
      };
      const step = (a, b) => {
        const key =
          (a.y * w + a.x) * 8 +
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ].findIndex(([x, y]) => b.x - a.x === x && b.y - a.y === y);
        if (!edges.has(key))
          edges.set(key, hasClearPath(world, a.x + 0.5, a.y + 0.5, b.x + 0.5, b.y + 0.5, foot));
        return edges.get(key);
      };
      const target = { x: Math.floor(gx - origin.x), y: Math.floor(gy - origin.y) },
        start = { x: Math.floor(sim.player.x), y: Math.floor(sim.player.y) };
      const candidates = [];
      for (let y = -3; y <= 3; y++)
        for (let x = -3; x <= 3; x++) {
          const p = { x: target.x + x, y: target.y + y };
          if (p.x >= 2 && p.y >= 2 && p.x < w - 2 && p.y < w - 2 && pass(p.x, p.y))
            candidates.push(p);
        }
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
      );
      for (const goal of candidates.slice(0, 3)) {
        const path = findPath(world.meta, start, goal, pass, 6000, step);
        if (path && path.length > 1)
          return path.map((p) => ({ x: p.x + origin.x + 0.5, y: p.y + origin.y + 0.5 }));
      }
      return [];
    };
    const visited = new Set(['0,0']);
    const chunkKey = (p) => Math.floor(p.x / 32) + ',' + Math.floor(p.y / 32);
    const points = [{ x: 0.5, y: 0.5 }],
      full = [],
      started = Date.now();
    let total = 0,
      iterations = 0;
    while (total < length) {
      const p = session.globalPosition(sim.player);
      // Deterministic broad zigzag: fresh territory, both signs, all cardinal/diagonal headings.
      const phase = Math.floor(iterations / 60) % 8;
      const dirs = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ];
      const [dx, dy] = dirs[phase];
      let route = [];
      let fallback = [];
      search: for (const distance of [40, 64, 24])
        for (const delta of [
          [dx, dy],
          [dy, -dx],
          [-dy, dx],
          [-dx, -dy],
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
          [1, 1],
          [-1, -1],
        ]) {
          const found = plan(p.x + delta[0] * distance, p.y + delta[1] * distance);
          if (found.length < 2) continue;
          if (!fallback.length) fallback = found;
          if (!visited.has(chunkKey(found.at(-1)))) {
            route = found;
            break search;
          }
        }
      if (!route.length) route = fallback;
      if (route.length < 2) throw new Error('No route at ' + JSON.stringify(p));
      for (const target of route.slice(1)) {
        const previous = full.at(-1) ?? points[0];
        total += Math.hypot(target.x - previous.x, target.y - previous.y);
        full.push(target);
        visited.add(chunkKey(target));
      }
      const end = route.at(-1);
      await sim.setGlobalPosition(end.x, end.y);
      iterations++;
      if (iterations % 25 === 0)
        console.info(
          JSON.stringify({
            seed,
            iterations,
            tiles: Math.round(total),
            elapsedSec: (Date.now() - started) / 1000,
          }),
        );
    }
    // Only remove exactly collinear intermediate grid points; never shortcut a turn.
    for (let i = 0; i < full.length; i++) {
      const a = points.at(-1),
        b = full[i],
        c = full[i + 1];
      if (!c || (b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x)) points.push(b);
    }
    const record = {
      seed,
      generatorVersion: 13,
      chunkSize: 32,
      tiles: total,
      uniqueChunks: visited.size,
      points,
      generatedMs: Date.now() - started,
    };
    record.hash = createHash('sha256').update(JSON.stringify(points)).digest('hex');
    await writeFile(output + '/seed-' + seed + '.json', JSON.stringify(record));
    session.dispose();
    console.info(JSON.stringify({ seed, tiles: total, points: points.length, hash: record.hash }));
  }
} finally {
  await server.close();
}
