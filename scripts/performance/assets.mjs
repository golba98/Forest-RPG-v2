import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser, boot, checkpoint } from './browser.mjs';

// Read-only Pixi 8.22 cache census outside cadence benchmarks. Re-importing the
// already-loaded module returns its existing namespace; no second Pixi instance.
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/assets';
await mkdir(root, { recursive: true });
const session = await openBrowser({ profileDir: root + '/browser-profile' });
try {
  await boot(session, { cap: 60, warmup: 5000 });
  const census = async () =>
    session.page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .find((s) => /\/assets\/pixi-[^/]+\.js$/.test(s));
      if (!url) throw new Error('Loaded Pixi module not found');
      const module = await import(url);
      const assets = Object.values(module).find(
        (x) => x && typeof x === 'object' && typeof x.loadBundle === 'function' && x.cache,
      );
      if (!assets || !(assets.cache._cache instanceof Map))
        throw new Error('Unsupported Pixi cache shape');
      const sources = new Map();
      for (const [alias, value] of assets.cache._cache) {
        const textures = value?.source ? [value] : Object.values(value?.textures ?? {});
        for (const texture of textures) {
          const source = texture.source;
          if (!source || !Number.isFinite(source.pixelWidth)) continue;
          if (!sources.has(source)) sources.set(source, new Set());
          sources.get(source).add(String(alias));
        }
      }
      const rows = [...sources]
        .map(([source, aliases]) => ({
          aliases: [...aliases],
          width: source.pixelWidth,
          height: source.pixelHeight,
          baseRgba8Bytes: source.pixelWidth * source.pixelHeight * 4,
          resourceType: source.resource?.constructor?.name,
          format: source.format,
          gpuDataEntries: Object.keys(source._gpuData ?? {}).length,
          glBacked: Object.values(source._gpuData ?? {}).some((x) => !!x.texture),
          mipmaps: source.autoGenerateMipmaps,
          mipLevelCount: source.mipLevelCount,
        }))
        .sort((a, b) => b.baseRgba8Bytes - a.baseRgba8Bytes);
      return {
        url,
        cacheKeys: assets.cache._cache.size,
        sources: rows.length,
        baseRgba8Bytes: rows.reduce((n, r) => n + r.baseRgba8Bytes, 0),
        glBackedSources: rows.filter((r) => r.glBacked).length,
        glBackedBaseRgba8Bytes: rows
          .filter((r) => r.glBacked)
          .reduce((n, r) => n + r.baseRgba8Bytes, 0),
        rows,
      };
    });
  const report = {
    method:
      'Unique sources in Pixi global Assets cache, private shape checked against installed 8.22.0. Base RGBA8 dimension estimate is not decoded-image residency or total VRAM. GL-backed means a Pixi GL texture wrapper exists; filters/terrain/runtime pools can be outside this cache.',
    initial: await census(),
  };
  for (const [x, y] of [
    [-1024.5, 768.5],
    [1536.5, -1024.5],
    [0.5, 0.5],
  ]) {
    await session.page.evaluate(({ x, y }) => window.__GAME__.setGlobalPosition(x, y), { x, y });
    await session.page.waitForTimeout(6000);
  }
  report.afterRegions = await census();
  report.postGc = await checkpoint(session, true, true);
  report.errors = session.errors;
  report.environment = session.config;
  await writeFile(root + '/asset-census.json', JSON.stringify(report, null, 2));
  console.info(
    JSON.stringify({
      initial: report.initial.sources,
      after: report.afterRegions.sources,
      baseRgba8MiB: report.initial.baseRgba8Bytes / 1048576,
      glBackedSources: report.afterRegions.glBackedSources,
    }),
  );
} finally {
  await session.browser.close();
}
