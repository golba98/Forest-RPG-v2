import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { EntityAnimator } from '../../../src/rendering/EntityAnimator';
import { resolveSpriteFrame } from '../../../src/animation/resolveSpriteFrame';
import { ANIMATION_DEFS } from '../../../src/animation/AnimationDefs';
import { PLAYER_SHEET_ANIMS, DIRECTION_FILE_SUFFIX } from '../../../src/rendering/assetCatalog';
import type { RenderEntityView } from '../../../src/types/render';

const player = (extra: Partial<RenderEntityView> = {}): RenderEntityView => ({
  id: 'player', kind: 'player', spriteKey: 'player', x: 0, y: 0, prevX: 0, prevY: 0,
  anim: 'walk', animTimeMs: 0, facing: 'E', lift: 0, alpha: 1, hurtFlash: false, ...extra,
});

describe('player gait presentation', () => {
  it('uses distance, preserves walk/run phase, and stops at a wall', () => {
    const a = new EntityAnimator();
    const sample = (x: number, view = player()) => {
      a.beginFrame();
      return resolveSpriteFrame(a.resolve(view, 16, { x, y: 0 }));
    };
    expect(sample(0).frame.x).toBe(0);
    expect(sample(8).frame.x).toBe(64);
    expect(sample(16).frame.x).toBe(128);
    expect(sample(16, player({ anim: 'run' })).frame.x).toBe(128);
    for (let i = 0; i < 60; i++) expect(sample(16, player({ animTimeMs: i * 16 })).frame.x).toBe(128);
    expect(sample(64).frame.x).toBe(0);
  });
  it('ignores camera/lift changes and resets on teleport or world clear', () => {
    const a = new EntityAnimator();
    a.resolve(player(), 16, { x: 0, y: 0 });
    a.resolve(player(), 16, { x: 8, y: 0 });
    expect(resolveSpriteFrame(a.resolve(player({ lift: 1 }), 16, { x: 8, y: 0 })).frame.x).toBe(64);
    expect(resolveSpriteFrame(a.resolve(player(), 16, { x: 400, y: 0 })).frame.x).toBe(0);
    a.resolve(player(), 16, { x: 408, y: 0 });
    a.clear();
    expect(resolveSpriteFrame(a.resolve(player(), 16, { x: 408, y: 0 })).frame.x).toBe(0);
  });
  it('keeps authoritative attack time and combo when ground motion changes', () => {
    const a = new EntityAnimator();
    a.resolve(player(), 16, { x: 0, y: 0 });
    const attack = { swingId: 7, comboStep: 3, direction: 'NW' as const, elapsedMs: 120 };
    const out = a.resolve(player({ anim: 'attack', facing: 'NW', animTimeMs: 999, attack }), 16, { x: 100, y: 100 });
    expect(out.animTimeMs).toBe(120); expect(out.facing).toBe('NW');
    expect(resolveSpriteFrame(out).textureAlias).toBe('player_attack3_northwest');
    expect(resolveSpriteFrame(out).frame.x).toBe(192);
    expect(attack.elapsedMs).toBe(120);
  });
});

it('ships 56 complete strips with shared palette, integer cells and safe padding', async () => {
  const palette = new Set<string>();
  let frames = 0;
  for (const anim of PLAYER_SHEET_ANIMS) for (const suffix of Object.values(DIRECTION_FILE_SUFFIX)) {
    const file = `public/assets/images/characters/player/${anim}/${anim}_${suffix}.png`;
    const { data, info } = await sharp(await fs.readFile(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const count = anim === 'idle' ? 6 : anim.startsWith('attack') ? 9 : 8;
    expect(info.width).toBe(count * 64); expect(info.height).toBe(64);
    for (let f = 0; f < count; f++) {
      let opaque = 0, invalidAlpha = 0, outside = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const p = (y * info.width + f * 64 + x) * 4;
        if (data[p + 3] !== 0 && data[p + 3] !== 255) invalidAlpha++;
        if (!data[p + 3]) continue;
        opaque++;
        if (x < 2 || x >= 62 || y < 2 || y >= 62) outside++;
        palette.add(data.subarray(p, p + 3).toString('hex'));
      }
      expect(invalidAlpha, file).toBe(0); expect(outside, file).toBe(0);
      expect(opaque).toBeGreaterThan(200); frames++;
    }
  }
  expect(frames).toBe(456); expect(palette.size).toBeLessThanOrEqual(16);
  expect(ANIMATION_DEFS.player!.scale).toBe(1);
});
