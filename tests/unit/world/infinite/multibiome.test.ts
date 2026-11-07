import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BiomeGeography } from '../../../../src/world/infinite/BiomeGeography';
import { ForestGenerator } from '../../../../src/world/infinite/ForestGenerator';
import { infiniteDescriptor } from '../../../../src/world/infinite/InfiniteSession';
import { BIOMES, validEnvironmentAssetKey } from '../../../../src/world/Biomes';
import { Tile } from '../../../../src/types/tiles';

describe('streamed five-biome geography', () => {
  it('has substantial distinct interiors of every biome near the starting region', () => {
    for (const seed of [1, 2, 42, 111, 123, 999, 1337, 98765]) {
      const geography = new BiomeGeography(seed);
      for (const a of geography.anchors) {
        expect(Math.hypot(a.x, a.y)).toBeLessThan(1024);
        let core = 0;
        for (let y = -48; y <= 48; y += 8)
          for (let x = -48; x <= 48; x += 8) {
            const s = geography.sample(a.x + x, a.y + y);
            if (s.biome === a.biome && s.blend < 0.2) core++;
          }
        expect(core, `${seed}:${a.biome}`).toBeGreaterThan(80);
      }
    }
  });
  it('generates identical terrain and owned objects in any visitation order, including distant signed coordinates', () => {
    const options = { seed: 42, level: 1, difficulty: 'normal' as const };
    const descriptor = infiniteDescriptor(options),
      a = new ForestGenerator(descriptor),
      b = new ForestGenerator(descriptor);
    const targets = [
      [0, 0],
      [150, 150],
      [500, 500],
      [2000, 2000],
      [10000, 10000],
      [-2000, -2000],
      [-10000, 10000],
      [1000000000, -1000000000],
    ];
    const addresses = targets.map(([x, y]) => ({ x: Math.floor(x! / 32), y: Math.floor(y! / 32) }));
    const first = addresses.map((p) => a.generate(p));
    for (const p of [...addresses].reverse()) b.generate(p);
    for (let i = 0; i < addresses.length; i++) {
      const chunk = b.generate(addresses[i]!);
      expect(chunk).toEqual(first[i]);
      expect(chunk.tiles).not.toContain(Tile.BORDER);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          expect(chunk.tiles[y * 32 + x]).toBe(
            b.tileAt(chunk.address.x * 32 + x, chunk.address.y * 32 + y),
          );
      expect(new Set(chunk.props.map((p) => p.id)).size).toBe(chunk.props.length);
    }
  }, 15000);
  it('keeps biome tree sets exclusive and object selections stable at chunk seams', () => {
    const g = new ForestGenerator(infiniteDescriptor({ seed: 42, level: 1, difficulty: 'normal' }));
    const all = new Set<string>();
    for (const a of g.geography!.anchors) {
      const cx = Math.floor(a.x / 32),
        cy = Math.floor(a.y / 32);
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++) {
          const c = g.generate({ x, y });
          for (const p of c.props) {
            expect(all.has(String(p.id))).toBe(false);
            all.add(String(p.id));
            if (p.kind !== 'tree') continue;
            const s = g.geography!.sample(p.tileX, p.tileY);
            if (s.blend > 0) continue;
            if (s.biome === 0) expect(p.assetKey).toMatch(/^native:/);
            else expect(BIOMES[s.biome]!.trees).toContain(Number(p.assetKey!.split(':')[1]));
          }
        }
    }
    expect(all.size).toBeGreaterThan(100);
  }, 15000);
  it('retains bounded adventure objectives and a dry origin across varied seeds', () => {
    for (let seed = 0; seed < 32; seed++) {
      const generator = new ForestGenerator(
        infiniteDescriptor({ seed, level: 1, difficulty: 'hard' }),
      );
      expect(generator.starting.coins).toHaveLength(20);
      expect(generator.starting.enemies).toHaveLength(24);
      expect(generator.tileAt(0, 0)).toBe(Tile.GRASS);
      for (const p of [
        generator.starting.portal,
        generator.starting.nest,
        ...generator.starting.coins,
      ]) {
        expect([Tile.GRASS, Tile.FLOWERS, Tile.MUD]).toContain(generator.tileAt(p.x, p.y));
      }
    }
  }, 20000);
  it('validates saved art references before they reach the renderer', () => {
    for (const key of [undefined, 'native:broad', 'tree:4', 'plant:wetlands:9'])
      expect(validEnvironmentAssetKey(key)).toBe(true);
    for (const key of [
      null,
      42,
      'tree:14',
      'tree:-1',
      'plant:wetlands:10',
      'plant:bog:0',
      'native:missing',
      'plant:forest:NaN',
    ])
      expect(validEnvironmentAssetKey(key)).toBe(false);
  });
  it('retains all approved character source sheets exactly', () => {
    const hashes = JSON.parse(
      readFileSync('docs/assets/source/player-face-continuity/sheet-hashes.json', 'utf8'),
    ) as Record<string, string>;
    expect(Object.keys(hashes)).toHaveLength(56);
    for (const [name, hash] of Object.entries(hashes))
      expect(
        createHash('sha256')
          .update(readFileSync(`public/assets/images/characters/player/${name}`))
          .digest('hex'),
      ).toBe(hash);
  });
});
