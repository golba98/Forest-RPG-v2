import { it, expect } from 'vitest';
import { playerPose, PlayerPoseController, poseFrame } from '../../../src/animation/PlayerMotion';
import type { RenderEntityView } from '../../../src/types/render';
const view = (extra: Partial<RenderEntityView> = {}): RenderEntityView => ({
  id: 'p',
  kind: 'player',
  spriteKey: 'player',
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  lift: 0,
  alpha: 1,
  hurtFlash: false,
  anim: 'idle',
  animTimeMs: 0,
  facing: 'S',
  ...extra,
});
it('uses one complete punch and resumes the current airborne phase afterward', () => {
  const air = view({
    isJumping: true,
    jumpProgress: 0.8,
    attack: { swingId: 1, comboStep: 2, direction: 'NW', elapsedMs: 120 },
  });
  expect(playerPose(air, 8)).toEqual({
    upper: { clip: 'attack2', frame: 6, facing: 'NW' },
    lower: { clip: 'attack2', frame: 6, facing: 'NW' },
  });
  expect(playerPose({ ...air, attack: null }, 8).upper).toEqual({
    clip: 'jump',
    frame: 12,
    facing: 'S',
  });
});
it('retains fixed strike, end and jump boundaries despite additional drawings', () => {
  expect(poseFrame('attack', 119.9)).toBe(5);
  expect(poseFrame('attack', 120)).toBe(6);
  expect(poseFrame('attack', 359)).toBe(17);
  expect(poseFrame('jump', 499)).toBe(15);
});
it('joins stopping with complete frames, freezes on pause and finishes within 80 ms', () => {
  const c = new PlayerPoseController();
  c.update(view({ vx: 2 }), 24, 16);
  const stop = c.update(view(), 24, 10);
  expect(stop.upper).toEqual({ clip: 'idle', frame: 0, facing: 'S' });
  expect(stop.transition?.from.upper).toEqual({ clip: 'walk', frame: 6, facing: 'S' });
  expect(stop.transition?.step).toBe(1);
  expect(stop.lower).toEqual(stop.upper);
  expect(c.update(view(), 24, 0)).toEqual(stop);
  const incoming = c.update(view(), 24, 40);
  expect(incoming.transition?.step).toBe(2);
  expect(incoming.upper.clip).toBe('idle');
  expect(c.update(view(), 24, 30).transition).toBeUndefined();
});
it('never delays the authoritative strike, even during a bridge or a long frame', () => {
  for (const elapsedMs of [60, 120, 180, 350]) {
    const c = new PlayerPoseController();
    c.update(view({ vx: 2 }), 24, 16);
    c.update(view(), 24, 10);
    const p = c.update(
      view({ attack: { swingId: 1, comboStep: 3, direction: 'S', elapsedMs } }),
      24,
      0,
    );
    expect(p.upper).toEqual({
      clip: 'attack3',
      frame: poseFrame('attack3', elapsedMs),
      facing: 'S',
    });
    expect(p.lower).toEqual(p.upper);
  }
});
it('cancels old-facing joins and teleport history immediately', () => {
  for (const reset of [true, false]) {
    const c = new PlayerPoseController();
    c.update(view({ vx: 2 }), 24, 16);
    c.update(view(), 24, 10);
    const next = view({ facing: reset ? 'S' : 'NW', isJumping: true, jumpProgress: 0.5 });
    expect(c.update(next, 0, 16, reset)).toEqual(playerPose(next, 0));
  }
});
it('retargets a rapid interruption without restarting or stacking joins', () => {
  const c = new PlayerPoseController();
  c.update(view({ vx: 2 }), 16, 16);
  c.update(view(), 16, 10);
  c.update(view({ isJumping: true, jumpProgress: 0.1 }), 16, 10);
  c.update(view({ vx: 2, isSprinting: true }), 16, 10);
  const end = view({ isJumping: true, jumpProgress: 0.3 });
  expect(c.update(end, 16, 50)).toEqual(playerPose(end, 16));
});
it('preserves signed gait phase and samples the advancing target after a walk/run join', () => {
  const c = new PlayerPoseController();
  c.update(view({ vx: 2 }), 16, 16);
  c.update(view({ vx: 2, isSprinting: true }), 16, 16);
  expect(c.update(view({ vx: 2, isSprinting: true }), 32, 44).upper).toEqual({
    clip: 'run',
    frame: 8,
    facing: 'S',
  });
  expect(playerPose(view({ vx: -2 }), -16).upper.frame).toBe(12);
});

it('keeps a rapid retarget rooted in the last displayed transition without extending its deadline', () => {
  const c = new PlayerPoseController();
  c.update(view({ vx: 2 }), 24, 16);
  const stop = c.update(view(), 24, 10);
  const air = view({ isJumping: true, jumpProgress: 0.1 });
  const jump = c.update(air, 24, 10);
  expect(jump.transition?.from).toBe(stop);
  expect(jump.transition?.id).not.toBe(stop.transition?.id);
  expect(c.update(air, 24, 59).transition).toBeDefined();
  expect(c.update(air, 24, 1).transition).toBeUndefined();
});
it('aligns southeast running feet while retaining the signed 64-pixel cycle', () => {
  expect(playerPose(view({ vx: 1, vy: 1, facing: 'SE' }), 0).upper.frame).toBe(0);
  const running = view({ vx: 1, vy: 1, facing: 'SE', isSprinting: true });
  expect(playerPose(running, 0).upper.frame).toBe(14);
  expect(playerPose(running, 64).upper.frame).toBe(14);
  expect(playerPose(running, -4).upper.frame).toBe(13);
});
