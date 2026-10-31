import { describe, expect, it } from 'vitest';
import { InputManager } from '../../../src/core/input/InputManager';
import { IntentMapper } from '../../../src/game/IntentMapper';
import { Simulation } from '../../../src/simulation/Simulation';
import { EntityAnimator } from '../../../src/rendering/EntityAnimator';
import { resolveSpriteFrame } from '../../../src/animation/resolveSpriteFrame';
import { IDLE_INTENT, type EnemyEntity } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import { makeWorld } from '../game/fakes';
import { GameLoop } from '../../../src/core/loop/GameLoop';

const directions = [
  { facing: 'N', keys: ['KeyW'], suffix: 'north', dx: 0, dy: -1 },
  { facing: 'E', keys: ['KeyD'], suffix: 'east', dx: 1, dy: 0 },
  { facing: 'S', keys: ['KeyS'], suffix: 'south', dx: 0, dy: 1 },
  { facing: 'W', keys: ['KeyA'], suffix: 'west', dx: -1, dy: 0 },
  { facing: 'NW', keys: ['KeyW', 'KeyA'], suffix: 'northeast', dx: -1, dy: -1 },
  { facing: 'NE', keys: ['KeyW', 'KeyD'], suffix: 'northwest', dx: 1, dy: -1 },
  { facing: 'SW', keys: ['KeyS', 'KeyA'], suffix: 'southeast', dx: -1, dy: 1 },
  { facing: 'SE', keys: ['KeyS', 'KeyD'], suffix: 'southwest', dx: 1, dy: 1 },
] as const;

function setup() {
  const simulation = new Simulation();
  const world = makeWorld();
  simulation.loadWorld({ ...world, meta: { ...world.meta, width: 40, height: 40 },
    tiles: new Uint8Array(1600).fill(Tile.GRASS), portal: { x: 38, y: 38 } });
  simulation.setPlayerPosition(20.5, 20.5);
  const input = new InputManager();
  const mapper = new IntentMapper();
  const animator = new EntityAnimator();
  const fixed = (dt = 1 / 60) => simulation.step(dt, mapper.nextIntent(input));
  const render = (dtMs = 1000 / 60) => {
    mapper.collect(input);
    input.clearFrameState(); mapper.endFrame(); animator.beginFrame();
    const view = simulation.buildRenderSnapshot().entities.find(e => e.id === simulation.player.id)!;
    return resolveSpriteFrame(animator.resolve(view, dtMs));
  };
  const step = () => { fixed(); return render(); };
  const frames = (n: number) => { for (let i = 0; i < n; i++) step(); };
  return { simulation, input, mapper, fixed, render, step, frames };
}

describe('player punch direction through input, simulation and animation', () => {
  for (const d of directions) {
    for (const keys of d.keys.length === 1 ? [d.keys] : [d.keys, [...d.keys].reverse()]) {
      it(`${keys.join(' then ')} keeps ${d.facing} through repeated and idle punches`, () => {
        const { simulation: s, input, step, frames } = setup();
        for (const key of keys) { input.simulateKeyDown(key); step(); }
        for (let punch = 0; punch < 3; punch++) {
          s.setPlayerPosition(20.5, 20.5);
          input.simulateKeyDown('KeyE');
          const ref = step();
          expect(s.player.facing).toBe(d.facing);
          expect(s.player.anim).toBe('attack');
          expect(s.getPlayerAttack()?.direction).toBe(d.facing);
          expect(ref.textureAlias).toBe(`player_attack_${d.suffix}`);
          expect(ref.flipX).toBe(false);
          input.simulateKeyUp('KeyE'); frames(23);
          expect(s.player.anim).toBe('walk');
          expect(Math.sign(s.player.x - 20.5)).toBe(d.dx);
          expect(Math.sign(s.player.y - 20.5)).toBe(d.dy);
        }
        for (const key of keys) input.simulateKeyUp(key);
        step(); expect(s.player.anim).toBe('idle');
        expect(s.player.facing).toBe(d.facing);
        input.simulateKeyDown('KeyE');
        expect(step().textureAlias).toBe(`player_attack_${d.suffix}`);
        expect(s.player.facing).toBe(d.facing);
      });
    }

    it(`${d.facing} damages its cone rather than the opposite or mirrored cone`, () => {
      const { simulation: s, input, step, frames } = setup();
      for (const key of d.keys) input.simulateKeyDown(key);
      step();
      for (const key of d.keys) input.simulateKeyUp(key);
      const length = Math.hypot(d.dx, d.dy);
      const target = (dx: number, dy: number) => {
        const id = s.spawnEnemy('mantis', s.player.x + dx / length * 1.4, s.player.y + dy / length * 1.4);
        const e = s.getEntities().find(e => e.id === id) as EnemyEntity;
        e.aggressive = false;
        return e;
      };
      const ahead = target(d.dx, d.dy);
      const mirror = target(-d.dx, d.dx === 0 || d.dy === 0 ? -d.dy : d.dy);
      const health = ahead.health;
      input.simulateKeyDown('KeyE');
      expect(step().textureAlias).toBe(`player_attack_${d.suffix}`);
      frames(5); expect(ahead.health).toBe(health); // Before the 120 ms strike.
      frames(3); expect(ahead.health).toBeLessThan(health);
      expect(mirror.health).toBe(health);
      expect(s.player.facing).toBe(d.facing);
    });
  }

  it('locks the punch while movement changes between left and right diagonals', () => {
    const { simulation: s, input, step } = setup();
    input.simulateKeyDown('KeyW'); input.simulateKeyDown('KeyA');
    input.simulateKeyDown('KeyE'); step();
    for (const [vertical, horizontal, facing] of [
      ['KeyW', 'KeyD', 'NE'], ['KeyS', 'KeyA', 'SW'],
      ['KeyS', 'KeyD', 'SE'], ['KeyW', 'KeyA', 'NW'],
    ] as const) {
      for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) input.simulateKeyUp(key);
      input.simulateKeyDown(vertical); input.simulateKeyDown(horizontal);
      const ref = step();
      expect(s.player.anim).toBe('attack');
      expect(s.player.facing).toBe(facing);
      expect(s.getPlayerAttack()?.direction).toBe('NW');
      expect(ref.textureAlias).toBe('player_attack_northeast');
      expect(ref.flipX).toBe(false);
    }
  });

  it('keeps idle aim assist when a target steps beside the player', () => {
    const { simulation: s } = setup();
    s.player.facing = 'S';
    s.spawnEnemy('mantis', s.player.x + 1.2, s.player.y);
    s.step(1 / 60, { ...IDLE_INTENT, attack: true });
    expect(s.player.facing).toBe('E');
    const view = s.buildRenderSnapshot().entities.find(e => e.id === s.player.id)!;
    expect(resolveSpriteFrame(view).textureAlias).toBe('player_attack_east');
  });
});

describe('locked attacks across input and animation transitions', () => {
  for (const start of directions) {
    it(`${start.facing} retains cardinal movement speed while walking, sprinting and punching`, () => {
      for (const sprint of [false, true]) for (const attack of [false, true]) {
        const { simulation: cardinal } = setup();
        const { simulation: s } = setup();
        cardinal.step(1 / 60, { ...IDLE_INTENT, moveX: 1, sprint, attack });
        s.step(1 / 60, { ...IDLE_INTENT, moveX: start.dx, moveY: start.dy, sprint, attack });
        expect(Math.hypot(s.player.x - 20.5, s.player.y - 20.5)).toBeCloseTo(cardinal.player.x - 20.5);
        expect(s.player.prevX).toBe(20.5); expect(s.player.prevY).toBe(20.5);
      }
    });

    for (const next of directions) {
      it(`${start.facing} stays locked through movement reversal to ${next.facing}`, () => {
        const { simulation: s, input, step, frames } = setup();
        for (const key of start.keys) input.simulateKeyDown(key);
        input.simulateKeyDown('KeyE'); step(); input.simulateKeyUp('KeyE');
        for (const key of start.keys) input.simulateKeyUp(key);
        for (const key of next.keys) input.simulateKeyDown(key);
        for (let frame = 1; frame < 21; frame++) {
          const ref = step();
          expect(s.player.facing).toBe(next.facing);
          expect(s.getPlayerAttack()?.direction).toBe(start.facing);
          expect(ref.textureAlias).toBe(`player_attack_${start.suffix}`);
          expect(ref.frame.x).toBe(Math.floor(Math.min(3, Math.floor(s.player.animTimeMs / 80)) * 446 / 4));
        }
        frames(2);
        expect(s.getPlayerAttack()).toBeNull();
        expect(s.player.anim).toBe('walk');
        input.simulateKeyDown('KeyE'); step();
        expect(s.getPlayerAttack()?.direction).toBe(next.facing);
      });
    }

    it(`${start.facing} movement overrides an enemy behind it on every attack frame`, () => {
      const { simulation: s, input, step } = setup();
      const len = Math.hypot(start.dx, start.dy);
      const id = s.spawnEnemy('mantis', 20.5 - start.dx / len, 20.5 - start.dy / len);
      const enemy = s.getEntities().find(e => e.id === id) as EnemyEntity;
      enemy.aggressive = false;
      for (const key of start.keys) input.simulateKeyDown(key);
      input.simulateKeyDown('KeyE');
      for (let frame = 0; frame < 21; frame++) {
        const ref = step();
        expect(s.player.facing).toBe(start.facing);
        expect(ref.textureAlias).toBe(`player_attack_${start.suffix}`);
      }
      expect(enemy.health).toBe(enemy.maxHealth);
    });

    it(`${start.facing} strike uses the initial vector after movement reverses`, () => {
      const { simulation: s, input, step } = setup();
      const len = Math.hypot(start.dx, start.dy);
      const enemyAt = (sign: number) => {
        const id = s.spawnEnemy('mantis', 20.5 + sign * start.dx / len * 1.5, 20.5 + sign * start.dy / len * 1.5);
        const enemy = s.getEntities().find(e => e.id === id) as EnemyEntity;
        enemy.aggressive = false;
        return enemy;
      };
      const ahead = enemyAt(1), behind = enemyAt(-1);
      for (const key of start.keys) input.simulateKeyDown(key);
      input.simulateKeyDown('KeyE'); step();
      for (const key of start.keys) input.simulateKeyUp(key);
      const reverse = directions.find(d => d.dx === -start.dx && d.dy === -start.dy)!;
      for (const key of reverse.keys) input.simulateKeyDown(key);
      for (let n = 0; n < 7; n++) { s.setPlayerPosition(20.5, 20.5); step(); }
      expect(ahead.health).toBeLessThan(ahead.maxHealth);
      expect(behind.health).toBe(behind.maxHealth);
      expect(s.getPlayerAttack()?.direction).toBe(start.facing);
    });

    if (start.keys.length === 2) for (const released of start.keys) {
      it(`${start.facing} keeps its punch when releasing ${released}, then uses the remaining key`, () => {
        const { simulation: s, input, step, frames } = setup();
        for (const key of start.keys) input.simulateKeyDown(key);
        input.simulateKeyDown('KeyE'); step(); input.simulateKeyUp('KeyE');
        input.simulateKeyUp(released);
        expect(step().textureAlias).toBe(`player_attack_${start.suffix}`);
        frames(22);
        const remaining = directions.find(d => d.keys.length === 1 && d.keys[0] === start.keys.find(k => k !== released))!;
        expect(s.player.facing).toBe(remaining.facing);
        input.simulateKeyDown('KeyE'); step();
        expect(s.getPlayerAttack()?.direction).toBe(remaining.facing);
      });
    }
  }

  it('locks flower cutting to the original direction, including a large timing step', () => {
    const { simulation: s } = setup();
    s.world.tiles[20 * 40 + 21] = Tile.FLOWERS;
    s.world.tiles[20 * 40 + 19] = Tile.FLOWERS;
    s.step(.01, { ...IDLE_INTENT, moveX: 1, attack: true });
    s.step(.01, { ...IDLE_INTENT, moveX: -1 });
    s.setPlayerPosition(20.5, 20.5);
    s.step(.4, IDLE_INTENT);
    expect(s.world.tiles[20 * 40 + 21]).toBe(Tile.GRASS);
    expect(s.world.tiles[20 * 40 + 19]).toBe(Tile.FLOWERS);
    expect(s.getPlayerAttack()).toBeNull();
  });

  it('does not queue attack taps during a swing or duplicate its strike', () => {
    const { simulation: s, input, step, frames } = setup();
    let swings = 0;
    s.onFeedback = kind => { if (kind === 'swing') swings++; };
    input.simulateKeyDown('KeyD'); input.simulateKeyDown('KeyE'); step();
    for (let frame = 0; frame < 18; frame++) {
      input.simulateKeyUp('KeyE'); input.simulateKeyDown('KeyE'); step();
    }
    frames(30);
    expect(swings).toBe(1);
    expect(s.getPlayerAttack()).toBeNull();
    input.simulateKeyUp('KeyE'); input.simulateKeyDown('KeyE'); step();
    expect(swings).toBe(2);
  });

  it('consumes the strike at 120 ms once, without hitting enemies arriving afterward', () => {
    const { simulation: s } = setup();
    s.step(.119, { ...IDLE_INTENT, moveX: 1, attack: true });
    const id = s.spawnEnemy('mantis', s.player.x + 1.2, s.player.y);
    const enemy = s.getEntities().find(e => e.id === id) as EnemyEntity;
    enemy.aggressive = false;
    s.step(.001, IDLE_INTENT);
    expect(enemy.health).toBe(enemy.maxHealth - 1);
    const lateId = s.spawnEnemy('mantis', s.player.x + 1.2, s.player.y);
    const late = s.getEntities().find(e => e.id === lateId) as EnemyEntity;
    late.aggressive = false;
    s.step(.25, IDLE_INTENT);
    expect(late.health).toBe(late.maxHealth);
  });

  it('does not start a punch without enough stamina', () => {
    const { simulation: s } = setup();
    s.player.stats.stamina = 0;
    s.step(1 / 60, { ...IDLE_INTENT, moveX: -1, attack: true });
    expect(s.getPlayerAttack()).toBeNull();
    expect(s.player.anim).toBe('walk');
  });

  it('keeps movement and melee direction while a simultaneous bolt aims independently', () => {
    const { simulation: s } = setup();
    s.spawnEnemy('mantis', 18, 20.5);
    s.step(1 / 60, { ...IDLE_INTENT, moveX: 1, attack: true, skillE: true });
    expect(s.player.facing).toBe('E');
    const bolt = s.getEntities().find(e => e.kind === 'projectile');
    expect(bolt?.facing).toBe('W');
    expect(s.getPlayerAttack()?.direction).toBe('E');
    expect(s.buildRenderSnapshot().entities.find(e => e.id === s.player.id)?.facing).toBe('E');
  });

  it('uses inverted movement intent for both animation and attack', () => {
    const { simulation: s } = setup(); s.invertY = true;
    s.step(1 / 60, { ...IDLE_INTENT, moveX: -1, moveY: -1, attack: true });
    expect(s.player.x).toBeLessThan(20.5); expect(s.player.y).toBeGreaterThan(20.5);
    expect(s.player.facing).toBe('SW'); expect(s.getPlayerAttack()?.direction).toBe('SW');
  });

  it('blocked movement still aims with held input instead of a nearby enemy', () => {
    const { simulation: s } = setup();
    s.world.tiles[20 * 40 + 21] = Tile.CLIFF;
    s.setPlayerPosition(20.69, 20.5);
    s.spawnEnemy('mantis', 19.5, 20.5);
    s.step(1 / 60, { ...IDLE_INTENT, moveX: 1, attack: true });
    expect(s.getPlayerAttack()?.direction).toBe('E');
  });

  it('does not carry an attack or pending strike into replacement/restored entities', () => {
    const { simulation: s } = setup();
    s.step(1 / 60, { ...IDLE_INTENT, moveY: -1, attack: true });
    const entities = structuredClone([...s.getEntities()]);
    s.restoreEntities(entities, .3, 0, 0);
    expect(s.getPlayerAttack()).toBeNull(); expect(s.player.anim).toBe('idle');
    s.step(1 / 60, { ...IDLE_INTENT, moveX: -1, attack: true });
    expect(s.getPlayerAttack()?.direction).toBe('W');
    s.loadWorld(makeWorld()); expect(s.getPlayerAttack()).toBeNull();
  });
});

describe('direction under different render schedules', () => {
  it('keeps the authoritative clip clock when rendering skips the start of an attack', () => {
    const { simulation: s, input, fixed, render } = setup();
    render();
    input.simulateKeyDown('KeyW'); input.simulateKeyDown('KeyA'); input.simulateKeyDown('KeyE');
    for (let n = 0; n < 6; n++) fixed();
    expect(s.getPlayerAttack()?.elapsedMs).toBeCloseTo(100);
    expect(render(100).frame.x).toBe(111);
    for (let n = 0; n < 4; n++) fixed();
    expect(render(1000 / 15).frame.x).toBe(223);
  });

  for (const hz of [30, 60, 144, 240]) for (const d of directions) {
    it(`${hz} Hz keeps ${d.facing} through reversals and ignored inputs`, () => {
      const { simulation: s, input, fixed, render } = setup();
      const reverse = directions.find(other => other.dx === -d.dx && other.dy === -d.dy)!;
      let swings = 0;
      s.onFeedback = kind => { if (kind === 'swing') swings++; };
      const loop = new GameLoop({
        onFixedUpdate: dt => fixed(dt),
        onRender: (_alpha, dt) => {
          const frame = render(dt);
          if (s.getPlayerAttack()) expect(frame.textureAlias).toBe(`player_attack_${swings === 1 ? d.suffix : reverse.suffix}`);
        },
      });
      for (const key of d.keys) input.simulateKeyDown(key);
      input.simulateKeyDown('KeyE');
      loop.start(); loop.tick(0);
      const done = new Set<number>();
      for (let frame = 1; frame <= hz; frame++) {
        const t = frame * 1000 / hz;
        for (const [at, action] of [
          [70, () => { input.simulateKeyUp('KeyE'); for (const key of d.keys) input.simulateKeyUp(key); for (const key of reverse.keys) input.simulateKeyDown(key); }],
          [130, () => input.simulateKeyDown('KeyE')],
          [220, () => { input.simulateKeyUp('KeyE'); for (const key of reverse.keys) input.simulateKeyUp(key); }],
          [430, () => input.simulateKeyDown('KeyE')],
        ] as const) if (t >= at && !done.has(at)) { done.add(at); action(); }
        loop.tick(t);
      }
      loop.stop(); expect(swings).toBe(2); expect(s.getPlayerAttack()).toBeNull();
    });
  }

  it('latches a zero-step-frame attack and consumes it once across catch-up steps', () => {
    const { simulation: s, input, fixed, render } = setup();
    input.simulateKeyDown('KeyW'); input.simulateKeyDown('KeyA'); input.simulateKeyDown('KeyE');
    render(4); input.simulateKeyUp('KeyE'); render(4);
    for (let n = 0; n < 3; n++) fixed();
    expect(render(50).textureAlias).toBe('player_attack_northeast');
    expect(s.getPlayerAttack()?.elapsedMs).toBeCloseTo(50);
    expect(s.player.comboCount).toBe(1);
  });
});

describe('independent bolt aim and authoritative swings', () => {
  for (const d of directions) it(`${d.facing} moving bolt keeps locomotion while aiming behind`, () => {
    const { simulation: s } = setup();
    s.spawnEnemy('mantis', 20.5 - d.dx * 3, 20.5 - d.dy * 3);
    s.step(1 / 60, { ...IDLE_INTENT, moveX: d.dx, moveY: d.dy, sprint: true, skillE: true });
    expect(s.player.facing).toBe(d.facing);
    expect(s.player.anim).toBe('run');
    const shot = s.getEntities().find(e => e.kind === 'projectile');
    expect(shot?.kind).toBe('projectile');
    if (shot?.kind !== 'projectile') throw new Error('Missing bolt');
    expect(Math.sign(shot.vx)).toBe(-d.dx || 0); expect(Math.sign(shot.vy)).toBe(-d.dy || 0);
    expect(s.buildRenderSnapshot().entities.find(e => e.kind === 'player')?.facing).toBe(d.facing);
  });

  it('stationary bolt assistance may update resting facing', () => {
    const { simulation: s } = setup(); s.spawnEnemy('mantis', 17.5, 20.5);
    s.step(1 / 60, { ...IDLE_INTENT, skillE: true }); expect(s.player.facing).toBe('W');
  });

  it('exposes immutable swing copies and authoritative combo through missed starts and restore', () => {
    const { simulation: s } = setup();
    let prior = 0;
    for (let n = 0; n < 4; n++) {
      s.step(.2, { ...IDLE_INTENT, attack: true });
      const attack = s.getPlayerAttack()!;
      expect(attack.swingId).toBeGreaterThan(prior); prior = attack.swingId;
      expect(attack.comboStep).toBe(n % 3 + 1);
      expect(attack.elapsedMs).toBe(200);
      expect(s.buildRenderSnapshot().entities.find(e => e.kind === 'player')?.attack).toEqual(attack);
      s.step(.17, IDLE_INTENT);
      expect(attack.elapsedMs).toBe(200); // Detached read-only view, not a mutable simulation object.
    }
    s.restoreEntities(structuredClone([...s.getEntities()]), .3, 0, 0);
    s.step(.01, { ...IDLE_INTENT, attack: true });
    expect(s.getPlayerAttack()!.swingId).toBeGreaterThan(prior);
    expect(s.getPlayerAttack()!.comboStep).toBe(1);
  });
});

describe('held input matrix and seeded timing traces', () => {
  for (const keys of [['KeyW', 'KeyA', 'KeyS', 'KeyD'], ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']]) {
    for (let mask = 0; mask < 16; mask++) it(`${keys[0]} family held mask ${mask}`, () => {
      const { simulation: s, input, step } = setup();
      keys.forEach((key, i) => { if (mask & (1 << i)) input.simulateKeyDown(key); });
      step();
      const dx = Number(!!(mask & 8)) - Number(!!(mask & 2));
      const dy = Number(!!(mask & 4)) - Number(!!(mask & 1));
      expect(Math.sign(s.player.x - 20.5)).toBe(dx); expect(Math.sign(s.player.y - 20.5)).toBe(dy);
      expect(Math.hypot(s.player.vx, s.player.vy)).toBeCloseTo(dx || dy ? 6.25 : 0);
    });
  }
  for (const hz of [30, 60, 144, 240]) it(`${hz} Hz ten seeded rapid input and boundary traces`, () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { simulation: s, input, fixed, render } = setup();
      const loop = new GameLoop({ onFixedUpdate: fixed, onRender: (_alpha, dt) => { render(dt); } });
      let random = seed, previousId = 0, locked: string | null = null;
      loop.start(); loop.tick(0);
      for (let i = 1; i <= hz * 2; i++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const d = directions[random % directions.length]!;
        for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE']) input.simulateKeyUp(key);
        for (const key of d.keys) input.simulateKeyDown(key);
        if (random & 16) input.simulateKeyDown('KeyE');
        loop.tick(i * 1000 / hz + (i % 2 ? .001 : -.001));
        const attack = s.getPlayerAttack();
        if (attack) {
          if (attack.swingId !== previousId) { previousId = attack.swingId; locked = attack.direction; }
          expect(attack.direction).toBe(locked);
          expect(s.buildRenderSnapshot().entities.find(e => e.kind === 'player')?.facing).toBe(locked);
        }
      }
      loop.stop();
    }
  });
});
