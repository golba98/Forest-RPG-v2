import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run before/after in isolation with the same Node version. SSR timings exclude rendering.
const capture = process.argv.includes('--capture-baseline');
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex < 0 ? undefined : process.argv[outputIndex + 1];
const fixtures = 'tests/fixtures/landscape';
const server = await createServer({
  configFile: false,
  cacheDir: join(tmpdir(), 'forest-landscape-profile'),
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { generateWorld } = await server.ssrLoadModule('/src/world/WorldGenerator.ts');
  const { Simulation } = await server.ssrLoadModule('/src/simulation/Simulation.ts');
  const { SaveManager } = await server.ssrLoadModule('/src/persistence/SaveManager.ts');
  const { GAME_CONFIG } = await server.ssrLoadModule('/src/config/GameConfig.ts');
  const { ENCOUNTER_CONFIG } = await server.ssrLoadModule('/src/config/EncounterConfig.ts');
  const sim = new Simulation();
  const saves = new SaveManager({}, { loadWorld: (world) => sim.loadWorld(world) }, sim);
  const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const results = [];
  generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
  for (const seed of [1, 42, 123, 1337]) {
    const options = { seed, level: 1, difficulty: 'normal', width: 150, height: 150 };
    const timings = { generation: [], simulationLoad: [], saveImport: [], legacyImport: [] };
    let world;
    for (let n = 0; n < 5; n++) {
      let start = performance.now();
      world = generateWorld(options);
      timings.generation.push(performance.now() - start);
      start = performance.now();
      sim.loadWorld(world);
      timings.simulationLoad.push(performance.now() - start);
      const raw = saves.export();
      start = performance.now();
      saves.import(raw);
      timings.saveImport.push(performance.now() - start);
      const old = JSON.parse(raw);
      old.world.props = old.world.props.filter((p) => !p.hilltop);
      delete old.world.meta.hilltopObjectsVersion;
      old.world.meta.generatorVersion = 9;
      old.world.meta.riverRepairVersion = 1;
      const legacy = JSON.stringify(old);
      start = performance.now();
      saves.import(legacy);
      timings.legacyImport.push(performance.now() - start);
    }
    const serialized = { ...world, tiles: Array.from(world.tiles) };
    if (capture) {
      await mkdir(fixtures, { recursive: true });
      await writeFile(`${fixtures}/v10-seed-${seed}.json`, JSON.stringify(serialized) + '\n', {
        flag: 'wx',
      });
    }
    results.push({
      options,
      worldHash: digest(serialized),
      counts: {
        objects: world.props.length,
        hilltop: world.props.filter((p) => p.hilltop).length,
        bridges: world.bridges?.length ?? 0,
        encounters: world.encounterSites?.length ?? 0,
      },
      timings,
    });
  }
  const report = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeSourceChanges:
      execFileSync('git', ['status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim()
        .length > 0,
    node: process.version,
    configurationHash: digest({ world: GAME_CONFIG.world, encounters: ENCOUNTER_CONFIG }),
    method: 'Vite SSR; one generation warmup; five serial samples per seed; no parallel tests',
    results,
  };
  if (capture)
    await writeFile(`${fixtures}/baseline.json`, JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
    });
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.info(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
