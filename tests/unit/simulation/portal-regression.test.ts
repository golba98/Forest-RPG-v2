import { expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { makeWorld } from '../game/fakes';
function setup() {
  const s = new Simulation();
  s.loadWorld({
    ...makeWorld(),
    enemySpawns: [{ type: 'mantis', x: 1, y: 1, aggressive: false }],
    pickupSpawns: [{ type: 'coin', x: 2, y: 1 }],
  });
  return s;
}
function portal(s: Simulation) {
  return s.getEntities().find((e) => e.kind === 'portal')!;
}
function complete(s: Simulation) {
  for (const e of s.getEntities()) if (e.kind === 'enemy' || e.kind === 'pickup') e.alive = false;
  s.step(1 / 60, { ...IDLE_INTENT });
}
it('reacts to a locked approach once until leaving, and cannot transition', () => {
  const s = setup();
  expect(portal(s).portalState).toBe('locked');
  s.setPlayerPosition(6.5, 6.5);
  s.step(1 / 60, { ...IDLE_INTENT });
  expect(portal(s).portalState).toBe('reacting');
  expect(s.claimPortalTransition()).toBe(false);
  for (let i = 0; i < 90; i++) s.step(1 / 60, { ...IDLE_INTENT });
  expect(portal(s).portalState).toBe('locked');
  s.setPlayerPosition(1.5, 6.5);
  s.step(1 / 60, { ...IDLE_INTENT });
  s.setPlayerPosition(6.5, 6.5);
  s.step(1 / 60, { ...IDLE_INTENT });
  expect(portal(s).portalState).toBe('reacting');
});
it('requires both objectives, unlocks once nearby or far away, and latches', () => {
  for (const near of [false, true]) {
    const s = setup();
    let unlocks = 0,
      completions = 0;
    s.onPortalChange = (c) => {
      if (c.state === 'open') unlocks++;
    };
    s.onRoundComplete = () => completions++;
    s.setPlayerPosition(near ? 6.5 : 1.5, 6.5);
    for (const e of s.getEntities()) if (e.kind === 'enemy') e.alive = false;
    s.step(1 / 60, { ...IDLE_INTENT });
    expect(portal(s).active).toBe(false);
    complete(s);
    expect(portal(s).portalState).toBe('open');
    s.spawnEnemy('ghost', 2.5, 2.5);
    s.spawnEnemy('mantis', 2.5, 2.5);
    for (let i = 0; i < 10; i++) s.step(1 / 60, { ...IDLE_INTENT });
    expect(portal(s).portalState).toBe('open');
    expect(unlocks).toBe(1);
    expect(completions).toBe(1);
  }
});
it('claims entry exactly once at the trigger boundary and resets on regeneration', () => {
  const s = setup();
  complete(s);
  s.setPlayerPosition(5.7, 6.5);
  expect(s.claimPortalTransition()).toBe(false);
  s.setPlayerPosition(5.71, 6.5);
  expect(s.claimPortalTransition()).toBe(true);
  expect(portal(s).portalState).toBe('transitioning');
  expect(s.claimPortalTransition()).toBe(false);
  s.loadWorld(setup().world);
  expect(portal(s).portalState).toBe('locked');
  expect(s.claimPortalTransition()).toBe(false);
});
it('normalizes saved reactions/transitions and derives old-save completion', () => {
  for (const state of ['locked', 'reacting', 'open', 'transitioning'] as const) {
    const s = setup();
    complete(s);
    const p = portal(s);
    p.portalState = state;
    const entities = structuredClone([...s.getEntities()]);
    s.loadWorld(s.world);
    s.restoreEntities(entities, 0.3, 0, 0);
    expect(portal(s).portalState).toBe('open');
  }
  const s = setup();
  const entities = structuredClone([...s.getEntities()]);
  const p = entities.find((e) => e.kind === 'portal')!;
  delete p.portalState;
  delete p.roundComplete;
  p.active = true;
  s.restoreEntities(entities, 0.3, 0, 0);
  expect(portal(s).portalState).toBe('locked');
});
