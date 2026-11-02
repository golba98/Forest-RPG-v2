// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteDriver } from '../../../src/performance/RouteDriver';
import type { Simulation } from '../../../src/simulation/Simulation';

function fixture() {
  let now = 1000;
  let next: FrameRequestCallback | undefined;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    next = undefined;
  });
  const player = { x: 0.5, y: 0.5, stats: { health: 7, maxHealth: 7 } };
  const driver = new RouteDriver({ player } as unknown as Simulation);
  const tick = (elapsed: number) => {
    now = 1000 + elapsed;
    const callback = next;
    next = undefined;
    callback?.(now);
  };
  return { player, driver, tick };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('real-time benchmark controller progress', () => {
  it('allows a long straight segment while the target gets closer', () => {
    const { player, driver, tick } = fixture();
    driver.start({ points: [{ x: 1000.5, y: 0.5 }] });
    for (let elapsed = 0; elapsed <= 40000; elapsed += 1000) {
      player.x = 0.5 + (elapsed / 1000) * 6.25;
      tick(elapsed);
    }
    expect(driver.snapshot().index).toBe(0);
    expect(driver.snapshot().waypointIdleMs).toBeGreaterThan(20000);
    expect(driver.snapshot().error).toBeNull();
    driver.stop();
  });
  it('rejects oscillation that moves the actor without approaching the target', () => {
    const { player, driver, tick } = fixture();
    driver.start({ points: [{ x: 100.5, y: 0.5 }] });
    for (let elapsed = 0; elapsed <= 25000; elapsed += 1000) {
      player.x = elapsed % 2000 ? 1.5 : 2.5;
      tick(elapsed);
    }
    expect(driver.snapshot().distanceTiles).toBeGreaterThan(10);
    expect(driver.snapshot().error).toContain('No progress toward target');
    driver.stop();
  });
  it('corrects a small lateral bridge offset after progress stops', () => {
    const { player, driver, tick } = fixture();
    const codes: string[] = [];
    const listen = (event: KeyboardEvent) => codes.push(event.code);
    window.addEventListener('keydown', listen);
    try {
      player.y = 0.537;
      driver.start({ points: [{ x: 20.5, y: 0.5 }] });
      tick(0);
      expect(codes).not.toContain('KeyW');
      tick(700);
      expect(codes).toContain('KeyW');
      expect(driver.snapshot().corrections).toBe(1);
    } finally {
      driver.stop();
      window.removeEventListener('keydown', listen);
    }
  });
});
