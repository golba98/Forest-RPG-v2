import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { ForestGenerator } = await server.ssrLoadModule('/src/world/infinite/ForestGenerator.ts');
  const fixtures = {};
  for (const seed of [42, 123, 1337]) {
    const g = new ForestGenerator({
      id: 'fixtures',
      seed,
      generatorVersion: 13,
      biomeVersion: 1,
      chunkSize: 32,
      level: 1,
      difficulty: 'normal',
    });
    const quiet = (px, py) => {
      if (!g.starting.enemies.every((p) => Math.hypot(p.x - px, p.y - py) > 18)) return false;
      for (let cy = Math.floor(py / 32) - 1; cy <= Math.floor(py / 32) + 1; cy++)
        for (let cx = Math.floor(px / 32) - 1; cx <= Math.floor(px / 32) + 1; cx++) {
          const x = cx * 32 + 16.5,
            y = cy * 32 + 16.5;
          if (Math.hypot(x - 0.5, y - 0.5) >= 96 && Math.hypot(x - px, y - py) < 11.5) return false;
        }
      return true;
    };
    let dense,
      forest,
      bridge,
      hill,
      hillRock,
      maxTrees = -1;
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const c = g.generate({ x, y }),
          trees = c.props.filter((p) => p.kind === 'tree').length;
        if (trees > maxTrees) {
          maxTrees = trees;
          dense = { x: x * 32 + 16.5, y: y * 32 + 4.5, treesInDataChunk: trees };
        }
        if (
          trees > 8 &&
          Math.hypot(x * 32 + 16.5, y * 32 + 16.5) < 90 &&
          g.starting.enemies.every(
            (p) => Math.hypot(p.x - (x * 32 + 16.5), p.y - (y * 32 + 16.5)) > 20,
          ) &&
          (!forest || Math.abs(trees - 40) < Math.abs(forest.treesInDataChunk - 40))
        )
          forest = { x: x * 32 + 16.5, y: y * 32 + 16.5, treesInDataChunk: trees };
        if (!bridge && c.bridges.length) {
          const b = c.bridges.find((b) => quiet(b.x + 0.5, b.y + 0.5));
          if (b) bridge = { x: b.x + 0.5, y: b.y + 0.5, id: b.id, orientation: b.orientation };
        }
        if (!hill) {
          const i = c.tiles.findIndex((t) => t === 21);
          if (i >= 0) hill = { x: x * 32 + (i % 32) + 0.5, y: y * 32 + Math.floor(i / 32) + 0.5 };
        }
        if (!hillRock) {
          const rock = c.props.find((p) => p.hilltop && quiet(p.tileX + 1.5, p.tileY + 1.5));
          if (rock)
            hillRock = {
              x: rock.tileX + 1.5,
              y: rock.tileY + 1.5,
              id: rock.id,
              kind: rock.kind,
              hilltop: true,
            };
        }
      }
    if (!bridge || !hill) throw new Error('Missing terrain fixture for ' + seed);
    fixtures[seed] = { forest, dense, bridge, hill: hillRock ?? hill };
  }
  await mkdir('artifacts/performance/fixtures', { recursive: true });
  await writeFile('artifacts/performance/fixtures/scenes.json', JSON.stringify(fixtures, null, 2));
  console.info(JSON.stringify(fixtures));
} finally {
  await server.close();
}
