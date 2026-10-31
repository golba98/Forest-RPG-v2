import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT, type EnemyEntity } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import { facingToward } from '../../../src/systems/EncounterSystem';
import { makeWorld } from '../game/fakes';

function setup() {
  const w = {
    ...makeWorld(),
    meta: { ...makeWorld().meta, width: 20, height: 20 },
    tiles: new Uint8Array(400).fill(Tile.GRASS),
    spawn: { x: 2, y: 4 },
    portal: { x: 18, y: 18 },
  };
  const s = new Simulation();
  s.loadWorld(w);
  s.setPlayerPosition(8.5, 8.5);
  s.player.facing = 'S';
  return s;
}
function enemy(s: Simulation, type: 'mantis' | 'maggot', x: number, y: number) {
  const id = s.spawnEnemy(type, x, y);
  return s.getEntities().find((e) => e.id === id) as EnemyEntity;
}
/** One swing, then enough frames for the strike to land (strike at 120 ms). */
function swing(s: Simulation) {
  s.step(1 / 60, { ...IDLE_INTENT, attack: true });
  for (let i = 0; i < 12; i++) s.step(1 / 60, IDLE_INTENT);
}

describe('melee aim assist', () => {
  it('hits an enemy standing beside the player and turns to face it', () => {
    const s = setup();
    const e = enemy(s, 'mantis', 9.3, 8.5);
    const before = e.health;
    swing(s);
    expect(e.health).toBeLessThan(before);
    expect(s.player.facing).toBe('E');
  });

  it('keeps the facing when an enemy is already in front', () => {
    const s = setup();
    const ahead = enemy(s, 'mantis', 8.5, 9.6);
    enemy(s, 'mantis', 7.4, 8.5);
    const before = ahead.health;
    swing(s);
    expect(s.player.facing).toBe('S');
    expect(ahead.health).toBeLessThan(before);
  });

  it('does not turn toward an enemy behind a wall or out of reach', () => {
    const s = setup();
    s.world.tiles[8 * 20 + 9] = Tile.CLIFF;
    const walled = enemy(s, 'mantis', 10.2, 8.5);
    enemy(s, 'mantis', 8.5, 4.5);
    const before = walled.health;
    swing(s);
    expect(s.player.facing).toBe('S');
    expect(walled.health).toBe(before);
  });

  it('maps vectors to 8-way facings', () => {
    expect(facingToward(1, 0)).toBe('E');
    expect(facingToward(0, 1)).toBe('S');
    expect(facingToward(-1, -1)).toBe('NW');
    expect(facingToward(0.2, -1)).toBe('N');
  });
});

describe('ranged enemy kiting', () => {
  it('holds a firing band instead of flipping between chase and flee', () => {
    const s = setup();
    const m = enemy(s, 'maggot', 11.5, 8.5);
    const states: string[] = [];
    for (let i = 0; i < 180; i++) {
      s.step(1 / 60, IDLE_INTENT);
      states.push(m.aiState);
    }
    // Count transitions between chase and flee: the old logic flipped every few frames.
    let flips = 0;
    for (let i = 1; i < states.length; i++) {
      const a = states[i - 1], b = states[i];
      if ((a === 'chase' && b === 'flee') || (a === 'flee' && b === 'chase')) flips++;
    }
    expect(flips).toBeLessThanOrEqual(1);
    const d = Math.hypot(m.x - s.player.x, m.y - s.player.y);
    expect(d).toBeGreaterThanOrEqual(2.4);
    expect(d).toBeLessThanOrEqual(6.1);
  });
});
