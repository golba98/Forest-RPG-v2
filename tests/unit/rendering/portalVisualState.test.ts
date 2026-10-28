import { describe, expect, it } from 'vitest';
import { PORTAL_REACT_MS, PortalVisualMachine } from '../../../src/rendering/portalVisualState';

const FRAME = 16;

function run(machine: PortalVisualMachine, frames: number, input: { active: boolean; playerDistance: number }) {
  const seen: string[] = [];
  for (let i = 0; i < frames; i++) seen.push(machine.update({ ...input, dtMs: FRAME }));
  return seen;
}

describe('PortalVisualMachine', () => {
  it('stays locked while the player is far from an incomplete portal', () => {
    const m = new PortalVisualMachine();
    expect(new Set(run(m, 30, { active: false, playerDistance: 8 }))).toEqual(new Set(['locked']));
  });

  it('reacts once on approach, then returns to locked without restarting', () => {
    const m = new PortalVisualMachine();
    const seen = run(m, Math.ceil((PORTAL_REACT_MS * 2) / FRAME), { active: false, playerDistance: 1.5 });
    expect(seen[0]).toBe('reacting');
    const firstLocked = seen.indexOf('locked');
    expect(firstLocked).toBeGreaterThan(0);
    expect(firstLocked * FRAME).toBeGreaterThanOrEqual(PORTAL_REACT_MS - FRAME);
    // No second reaction while the player lingers.
    expect(seen.slice(firstLocked).every((s) => s === 'locked')).toBe(true);
  });

  it('progress rises monotonically during a reaction (no per-frame restart)', () => {
    const m = new PortalVisualMachine();
    let last = -1;
    for (let i = 0; i < 40; i++) {
      m.update({ active: false, playerDistance: 2, dtMs: FRAME });
      if (m.state !== 'reacting') break;
      expect(m.reactProgress).toBeGreaterThan(last);
      last = m.reactProgress;
    }
  });

  it('uses hysteresis: re-arms only after the player moves beyond the exit radius', () => {
    const m = new PortalVisualMachine();
    run(m, 80, { active: false, playerDistance: 2 });
    // Hovering between enter (2.5) and exit (3.2) radii does not re-trigger.
    expect(run(m, 5, { active: false, playerDistance: 2.9 })).toEqual(Array(5).fill('locked'));
    expect(run(m, 5, { active: false, playerDistance: 2.2 })).toEqual(Array(5).fill('locked'));
    run(m, 2, { active: false, playerDistance: 5 });
    expect(m.update({ active: false, playerDistance: 2, dtMs: FRAME })).toBe('reacting');
  });

  it('opens when the simulation reports the round complete and stays open', () => {
    const m = new PortalVisualMachine();
    run(m, 3, { active: false, playerDistance: 2 });
    const seen = run(m, 200, { active: true, playerDistance: 2 });
    expect(new Set(seen)).toEqual(new Set(['open']));
    expect(m.elapsedMs).toBeGreaterThan(3000);
  });

  it('never shows open when the simulation says the portal is inactive', () => {
    const m = new PortalVisualMachine();
    for (const d of [10, 2, 0.5, 3, 10]) expect(m.update({ active: false, playerDistance: d, dtMs: FRAME })).not.toBe('open');
  });

  it('honours an explicit state from the simulation', () => {
    const m = new PortalVisualMachine();
    expect(m.update({ active: true, explicit: 'transitioning', playerDistance: 0, dtMs: FRAME })).toBe('transitioning');
    expect(m.update({ active: false, explicit: 'locked', playerDistance: 0, dtMs: FRAME })).toBe('locked');
  });
});
