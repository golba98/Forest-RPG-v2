import { describe, expect, it } from 'vitest';
import { ATTACK_REPEAT_GAP_MS, EntityAnimator, FACING_HOLD_MS, TELEGRAPH_MS } from '../../../src/rendering/EntityAnimator';
import { getAnimationDurationMs, resolveSpriteFrame } from '../../../src/animation/resolveSpriteFrame';
import type { RenderEntityView } from '../../../src/types/render';

function enemy(overrides: Partial<RenderEntityView> = {}): RenderEntityView {
  return {
    id: 'enemy-1', kind: 'enemy', spriteKey: 'mantis', x: 0, y: 0, prevX: 0, prevY: 0,
    facing: 'S', anim: 'walk', animTimeMs: 0, lift: 0, alpha: 1, hurtFlash: false, ...overrides,
  };
}

describe('EntityAnimator', () => {
  it('restarts the clip when the simulation changes anim without resetting animTimeMs', () => {
    const a = new EntityAnimator();
    a.beginFrame();
    a.resolve(enemy({ anim: 'walk', animTimeMs: 5000 }), 16);
    a.beginFrame();
    const entered = a.resolve(enemy({ anim: 'attack', animTimeMs: 5016 }), 16);
    expect(entered.anim).toBe('attack');
    expect(entered.animTimeMs).toBe(0);
    // Without the clock fix the legacy 5 s timer would show the final attack frame.
    expect(resolveSpriteFrame({ ...entered }).frame.x).toBe(0);
    a.beginFrame();
    expect(a.resolve(enemy({ anim: 'attack', animTimeMs: 5216 }), 16).animTimeMs).toBe(200);
  });

  it('honours animStartedAtMs when the simulation provides it', () => {
    const a = new EntityAnimator();
    a.beginFrame();
    expect(a.resolve(enemy({ anim: 'attack', animTimeMs: 900, animStartedAtMs: 800 }), 16).animTimeMs).toBe(100);
  });

  it('treats a small animTimeMs after a change as already reset by the simulation', () => {
    const a = new EntityAnimator();
    a.beginFrame();
    a.resolve(enemy({ id: 'p', kind: 'player', spriteKey: 'player', anim: 'walk', animTimeMs: 900 }), 16);
    a.beginFrame();
    expect(a.resolve(enemy({ id: 'p', kind: 'player', spriteKey: 'player', anim: 'attack', animTimeMs: 16 }), 16).animTimeMs).toBe(16);
  });

  it('replays an attack after a short idle gap while the attack state persists, with a telegraph each time', () => {
    const a = new EntityAnimator();
    const clip = getAnimationDurationMs('mantis', 'attack');
    a.beginFrame();
    a.resolve(enemy({ anim: 'idle', animTimeMs: 1000 }), 16);
    const at = (t: number) => { a.beginFrame(); return a.resolve(enemy({ anim: 'attack', animTimeMs: 1000 + t }), 16); };
    expect(at(0).telegraph).toBe(1);
    expect(at(TELEGRAPH_MS + 1).telegraph).toBe(0);
    expect(at(clip + 10).anim).toBe('idle');
    const replay = at(clip + ATTACK_REPEAT_GAP_MS + 5);
    expect(replay.anim).toBe('attack');
    expect(replay.animTimeMs).toBe(5);
    expect(replay.telegraph).toBeGreaterThan(0);
  });

  it('filters enemy facing flips shorter than the hold time', () => {
    const a = new EntityAnimator();
    const step = (facing: 'S' | 'E', dt: number) => { a.beginFrame(); return a.resolve(enemy({ facing }), dt).facing; };
    expect(step('S', 16)).toBe('S');
    expect(step('E', 16)).toBe('S');
    expect(step('S', 16)).toBe('S');
    let shown = 'S';
    for (let t = 0; t <= FACING_HOLD_MS + 16; t += 16) shown = step('E', 16);
    expect(shown).toBe('E');
  });

  it('never filters the player facing', () => {
    const a = new EntityAnimator();
    a.beginFrame();
    a.resolve(enemy({ id: 'p', kind: 'player', spriteKey: 'player', facing: 'S' }), 16);
    a.beginFrame();
    expect(a.resolve(enemy({ id: 'p', kind: 'player', spriteKey: 'player', facing: 'W' }), 16).facing).toBe('W');
  });

  it('sweeps entities that were not drawn this frame', () => {
    const a = new EntityAnimator();
    a.beginFrame();
    a.resolve(enemy({ id: 'a' }), 16);
    a.resolve(enemy({ id: 'b' }), 16);
    a.beginFrame();
    a.resolve(enemy({ id: 'a' }), 16);
    expect(a.sweep()).toEqual(['b']);
  });
});
