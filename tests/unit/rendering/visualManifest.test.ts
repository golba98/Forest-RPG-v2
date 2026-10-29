import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVisualManifest } from '../../../src/rendering/visualManifest';
import { PORTAL_ART_ALIAS, PORTAL_ART_SRC, rendererExtraAssets } from '../../../src/rendering/assetCatalog';
import { ANIMATION_DEFS, listReferencedAliases } from '../../../src/animation/AnimationDefs';
import { resolveSpriteFrame } from '../../../src/animation/resolveSpriteFrame';
import type { AnimState, Direction } from '../../../src/types/entities';

const PUBLIC = resolve(__dirname, '../../../public');

/** Width/height from a PNG IHDR chunk. */
function pngSize(path: string): { w: number; h: number } {
  const buf = readFileSync(path);
  expect(buf.toString('ascii', 12, 16)).toBe('IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

interface ManifestJson {
  bundles: Array<{ assets: Array<{ alias: string; src: string }> }>;
}
const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'assets/manifests/asset_manifest.json'), 'utf8')) as ManifestJson;
const manifestSrc = new Map(manifest.bundles.flatMap((b) => b.assets.map((a) => [a.alias, a.src] as const)));
const extraSrc = new Map(rendererExtraAssets().map((a) => [a.alias, a.src] as const));

describe('visual asset manifest', () => {
  const entries = buildVisualManifest();

  it('declares texture sizes that match the PNG files', () => {
    for (const e of entries) {
      expect(e.path, e.id).not.toBe('');
      const size = pngSize(resolve(PUBLIC, e.path));
      expect(size, e.id).toEqual(e.texture);
      expect(e.frame.w).toBeLessThanOrEqual(e.texture.w);
      expect(e.frame.h).toBeLessThanOrEqual(e.texture.h);
    }
  });

  it('agrees with the alias → file mapping the TextureStore loads', () => {
    for (const e of entries) {
      const loaded = manifestSrc.get(e.alias) ?? extraSrc.get(e.alias);
      expect(loaded, e.alias).toBe(e.path);
    }
  });

  it('covers every alias the animation system references', () => {
    const aliases = new Set(entries.map((e) => e.alias));
    for (const alias of listReferencedAliases()) expect(aliases.has(alias), alias).toBe(true);
  });

  it('loads the real portal artwork through renderer extras when an older manifest omits it', () => {
    expect(rendererExtraAssets()).toContainEqual({ alias: PORTAL_ART_ALIAS, src: PORTAL_ART_SRC });
    expect(pngSize(resolve(PUBLIC, PORTAL_ART_SRC))).toEqual({ w: 1312, h: 1199 });
  });

  it('every texture alias the renderer can request exists on disk', () => {
    for (const [alias, src] of [...manifestSrc, ...extraSrc]) {
      if (src.endsWith('.ttf')) continue;
      expect(existsSync(resolve(PUBLIC, src)), alias).toBe(true);
    }
  });
});

describe('sprite frame rectangles', () => {
  const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const anims: AnimState[] = ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'death'];

  it('are integer rectangles inside their PNG (no sub-pixel sampling or bleeding)', () => {
    const sizes = new Map<string, { w: number; h: number }>();
    const sizeOf = (alias: string) => {
      let s = sizes.get(alias);
      if (!s) {
        const src = manifestSrc.get(alias) ?? extraSrc.get(alias);
        expect(src, alias).toBeDefined();
        s = pngSize(resolve(PUBLIC, src ?? ''));
        sizes.set(alias, s);
      }
      return s;
    };
    for (const key of Object.keys(ANIMATION_DEFS)) for (const anim of anims) for (const facing of dirs) for (const active of [false, true]) {
      for (let t = 0; t < 1200; t += 37) {
        const f = resolveSpriteFrame({ spriteKey: key, anim, facing, animTimeMs: t, active });
        const { x, y, w, h } = f.frame;
        for (const v of [x, y, w, h]) expect(Number.isInteger(v)).toBe(true);
        const size = sizeOf(f.textureAlias);
        expect(x + w).toBeLessThanOrEqual(size.w);
        expect(y + h).toBeLessThanOrEqual(size.h);
      }
    }
  });
});
