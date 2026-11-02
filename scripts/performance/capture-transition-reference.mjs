// One-off fixture capture from the preserved PRE-optimization bundle sources.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
const root = 'artifacts/optimization/baseline/build/assets';
for (const file of await readdir(root))
  if (file.endsWith('.map')) {
    const map = JSON.parse(await readFile(root + '/' + file, 'utf8'));
    for (const [i, name] of map.sources.entries()) {
      if (!name.endsWith('/systems/SurfaceMoisture.ts')) continue;
      let source = map.sourcesContent[i];
      source = source.replace(/from ['"]([^'"]+)['"]/g, (all, id) =>
        id.startsWith('.') ? `from '${path.posix.normalize('/src/systems/' + id)}'` : all,
      );
      await writeFile('artifacts/optimization/reference-surface.ts', source);
    }
  }
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { SurfaceSites } = await server.ssrLoadModule(
    '/artifacts/optimization/reference-surface.ts',
  );
  const { streamingSurfaceFixture } = await server.ssrLoadModule(
    '/tests/fixtures/streaming-surface.ts',
  );
  const rows = [];
  for (const vertical of [false, true]) {
    const sites = new SurfaceSites(streamingSurfaceFixture(vertical));
    rows.push({
      vertical,
      hash: createHash('sha256')
        .update(JSON.stringify({ eligible: sites.eligible, pools: [...sites.pools] }))
        .digest('hex'),
    });
  }
  await writeFile(
    'tests/fixtures/streaming-surface-reference.json',
    JSON.stringify(
      {
        provenance:
          'Pre-optimization production source map, baseline build 233277b6603e46ac24eb76312ab40deb32e5f900c0179bbbd6c4192f9eae1caf',
        rows,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await server.close();
}
