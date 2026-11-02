import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EntityAnimator } from '../../../src/rendering/EntityAnimator';
import { ANIMATION_DEFS } from '../../../src/animation/AnimationDefs';
import {
  resolveSpriteFrame,
  getAnimationDurationMs,
} from '../../../src/animation/resolveSpriteFrame';
import { createPlayerFlow, settlePlayerMotion } from '../../../src/animation/PlayerPlayback';
import type { RenderEntityView } from '../../../src/types/render';

const view = (extra: Partial<RenderEntityView> = {}): RenderEntityView => ({
  id: 'p',
  kind: 'player',
  spriteKey: 'player',
  anim: 'walk',
  animTimeMs: 0,
  facing: 'NW',
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  lift: 0,
  alpha: 1,
  hurtFlash: false,
  ...extra,
});

it('ships the exact approved remaster bytes, not the later experimental model', async () => {
  const hashes = JSON.parse(
    await fs.readFile('docs/assets/source/player-remaster/approved-hashes.json', 'utf8'),
  ) as Record<string, string>;
  expect(Object.keys(hashes)).toHaveLength(56);
  for (const [file, hash] of Object.entries(hashes)) {
    const bytes = await fs.readFile(`public/assets/images/characters/player/${file}`);
    expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(hash);
  }
});

describe('player presentation flow', () => {
  it('settles every gait phase within 80 ms and keeps idle breathing afterward', () => {
    for (const clip of ['walk', 'run'] as const)
      for (let frame = 0; frame < 8; frame++) {
        const state = createPlayerFlow('NW');
        const duration = clip === 'walk' ? 40 : 1000 / 34;
        settlePlayerMotion(state, clip, frame * duration + 0.001, 'NW', 16, false);
        for (let ms = 0; ms < 80; ms += 10) {
          const out = settlePlayerMotion(state, 'idle', 0, 'NW', 10, false);
          expect(['walk', 'run', 'idle']).toContain(out.anim);
        }
        expect(settlePlayerMotion(state, 'idle', 0, 'NW', 1, false).anim).toBe('idle');
        const later = settlePlayerMotion(state, 'idle', 0, 'NW', 250, false);
        expect(later.time).toBeGreaterThanOrEqual(250);
      }
  });
  it('freezes settling while paused and cancels it for new actions, facing and teleports', () => {
    for (const next of ['walk', 'run', 'attack', 'jump', 'hurt', 'death'] as const) {
      const state = createPlayerFlow('NE');
      settlePlayerMotion(state, 'walk', 80, 'NE', 16, false);
      const first = settlePlayerMotion(state, 'idle', 0, 'NE', 0, false);
      for (let i = 0; i < 10; i++)
        expect(settlePlayerMotion(state, 'idle', 0, 'NE', 0, false)).toEqual(first);
      expect(settlePlayerMotion(state, next, 120, 'NE', 16, false)).toEqual({
        anim: next,
        time: 120,
      });
      expect(state.settle).toBeUndefined();
    }
    for (const [facing, discontinuity] of [
      ['SW', false],
      ['NE', true],
    ] as const) {
      const state = createPlayerFlow('NE');
      settlePlayerMotion(state, 'walk', 80, 'NE', 16, false);
      settlePlayerMotion(state, 'idle', 0, 'NE', 10, false);
      expect(settlePlayerMotion(state, 'idle', 0, facing, 10, discontinuity).anim).toBe('idle');
      expect(state.settle).toBeUndefined();
    }
  });
  it('does not advance idle or settling when simulation time is frozen', () => {
    const animator = new EntityAnimator();
    for (let i = 0; i < 60; i++)
      expect(animator.resolve(view({ anim: 'idle', animTimeMs: 0 }), 16).animTimeMs).toBe(0);
    animator.resolve(view({ anim: 'walk', animTimeMs: 100 }), 16, { x: 0, y: 0 });
    animator.resolve(view({ anim: 'walk', animTimeMs: 116 }), 16, { x: 24, y: 0 });
    const stopped = animator.resolve(view({ anim: 'idle', animTimeMs: 0 }), 16, { x: 24, y: 0 });
    for (let i = 0; i < 60; i++)
      expect(animator.resolve(view({ anim: 'idle', animTimeMs: 0 }), 16, { x: 24, y: 0 })).toEqual(
        stopped,
      );
    expect(animator.resolve(view({ anim: 'idle', animTimeMs: 81 }), 16, { x: 24, y: 0 }).anim).toBe(
      'idle',
    );
  });
  it('never defers a locked swing or mutates authoritative attack time', () => {
    const animator = new EntityAnimator();
    animator.resolve(view(), 16, { x: 0, y: 0 });
    animator.resolve(view(), 16, { x: 24, y: 0 });
    animator.resolve(view({ anim: 'idle' }), 16, { x: 24, y: 0 });
    const attack = { swingId: 1, comboStep: 2, direction: 'NW' as const, elapsedMs: 120 };
    const out = animator.resolve(view({ anim: 'attack', attack }), 16, { x: 24, y: 0 });
    expect(out.anim).toBe('attack');
    expect(out.facing).toBe('NW');
    expect(out.animTimeMs).toBe(120);
    expect(resolveSpriteFrame(out).textureAlias).toBe('player_attack2_northwest');
    expect(resolveSpriteFrame(out).frame.x).toBe(3 * 64);
    expect(attack.elapsedMs).toBe(120);
  });
  it('keeps strike at 120 and end at 360 with a readable impact and graded recovery', () => {
    for (const step of [1, 2, 3]) {
      const sample = (ms: number) =>
        resolveSpriteFrame(
          view({
            anim: 'attack',
            animTimeMs: ms,
            attack: { swingId: 1, comboStep: step, direction: 'NW', elapsedMs: ms },
          }),
        );
      expect(sample(119.99).frame.x).toBe(2 * 64);
      expect(sample(120).frame.x).toBe(3 * 64);
      expect(sample(179.99).frame.x).toBe(3 * 64);
      expect(sample(180).frame.x).toBe(4 * 64);
      expect(sample(319.99).frame.x).toBe(7 * 64);
      expect(sample(320).frame.x).toBe(8 * 64);
      expect(sample(359.99).finished).toBe(false);
      expect(sample(360).finished).toBe(true);
    }
    expect(getAnimationDurationMs('player', 'attack')).toBe(360);
    for (const clip of Object.values(ANIMATION_DEFS.player!.attackClips!)) {
      expect(clip.frameDurationsMs?.length).toBe(clip.frameCount);
      expect(clip.frameDurationsMs?.reduce((a, b) => a + b, 0)).toBe(360);
    }
  });
});
